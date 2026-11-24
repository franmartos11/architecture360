// Lectura de los datos vivos de un proyecto para el bot. Usa un cliente
// inyectado (service role), así que TODO se filtra a mano por projectId.
// Sin imports de next/react.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AmenityRow, BuildingRow, FloorRow, PointOfInterestRow, ProjectRow, UnitRow } from '@/types/database';
import { allProgramRooms, hasRoomProgram, roomCounts, unitIsDwelling, parseOrientation } from '@/lib/units';
import { parseConstructionProgress } from '@/lib/construction-progress-sanitize';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveSectionOrder } from '@/lib/project-sections';
import type { DatosProyecto, UnidadBot } from './ficha';
import type { SlideAerea } from './material';
import { cargarFaq } from './preguntas';
import { parseStoredPlans } from '@/lib/financing';

async function leer<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, que: string): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(`No se pudo leer ${que}: ${error.message}`);
  return data ?? [];
}

const COLS_UNIDAD = [
  'id', 'floor_id', 'code', 'type', 'category', 'total_area', 'inner_area', 'bedrooms', 'bathrooms',
  'living_rooms', 'garage_spaces', 'garage_covered', 'garage_uncovered', 'parking_spots', 'rooms', 'levels',
  'interior_image_url', 'gallery_images', 'price', 'currency', 'status', 'orientation', 'hoa_fee',
  'condition', 'features', 'technical_plan_url', 'room_plan_image', 'floor_plan_3d_url', 'plan_3d_url',
].join(', ');

export type FilaUnidad = Pick<
  UnitRow,
  | 'id' | 'floor_id' | 'code' | 'type' | 'category' | 'total_area' | 'inner_area' | 'bedrooms' | 'bathrooms'
  | 'living_rooms' | 'garage_spaces' | 'garage_covered' | 'garage_uncovered' | 'parking_spots' | 'rooms' | 'levels'
  | 'interior_image_url' | 'gallery_images' | 'price' | 'currency' | 'status' | 'orientation' | 'hoa_fee'
  | 'condition' | 'features' | 'technical_plan_url' | 'room_plan_image' | 'floor_plan_3d_url' | 'plan_3d_url'
>;

export const IDS_POR_LOTE = 100;
export const FILAS_POR_PAGINA = 1000;

// Lee filas de `.in(col, ids)` sin pasar el tope de 1000 filas de PostgREST ni
// el largo de URL: ids en lotes de 100 y cada lote paginado con range().
export async function leerPorLotes<T>(
  ids: string[],
  consulta: (lote: string[], desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  que: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_LOTE) {
    const lote = ids.slice(i, i + IDS_POR_LOTE);
    for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
      const { data, error } = await consulta(lote, desde, desde + FILAS_POR_PAGINA - 1);
      if (error) throw new Error(`No se pudo leer ${que}: ${error.message}`);
      const filas = data ?? [];
      out.push(...filas);
      if (filas.length < FILAS_POR_PAGINA) break;
    }
  }
  return out;
}

const nn = (n: number | null | undefined): number | null => (n == null ? null : Number(n));

export function unidadDesdeFila(u: FilaUnidad, edificio: string, piso: string, edificioId = ''): UnidadBot {
  const rooms = allProgramRooms(u.rooms, u.levels);
  const programa = hasRoomProgram(rooms);
  const c = roomCounts(rooms);
  const dormitorios = programa ? c.bedrooms : u.bedrooms;
  const banos = programa ? c.bathrooms : Number(u.bathrooms);
  const living = programa ? c.living : u.living_rooms;
  const esVivienda = unitIsDwelling(u);
  const amb = living + dormitorios;
  const cocheras = (u.garage_covered ?? 0) + (u.garage_uncovered ?? 0) || u.garage_spaces || u.parking_spots?.length || 0;
  const fotos = [u.interior_image_url, ...(u.gallery_images ?? [])].filter((x): x is string => !!x);
  const total = nn(u.total_area);
  const cubierta = nn(u.inner_area);
  return {
    id: u.id,
    edificioId,
    codigo: u.code,
    edificio,
    piso,
    tipo: u.type,
    categoria: u.category ?? 'vivienda',
    ambientes: esVivienda && amb > 0 ? amb : null,
    dormitorios: esVivienda ? dormitorios : 0,
    banos: esVivienda ? banos : 0,
    m2Total: total && total > 0 ? total : null,
    m2Cubiertos: cubierta && cubierta > 0 ? cubierta : null,
    precio: u.price != null ? Number(u.price) : null,
    moneda: u.currency || 'USD',
    estado: u.status,
    orientacion: parseOrientation(u.orientation).cardinal ?? null,
    expensas: nn(u.hoa_fee),
    cocheras,
    condicion: u.condition ?? null,
    features: u.features ?? [],
    fotos,
    plano: u.technical_plan_url ?? u.room_plan_image ?? null,
    plano3d: u.floor_plan_3d_url ?? u.plan_3d_url ?? null,
  };
}

export async function cargarDatosProyecto(sb: SupabaseClient, projectId: string): Promise<DatosProyecto> {
  const { data: proyecto, error } = await sb.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw new Error(`No se pudo leer el proyecto ${projectId}: ${error.message}`);
  if (!proyecto) throw new Error(`El proyecto ${projectId} no existe`);

  const edificios = await leer<BuildingRow>(
    sb.from('buildings').select('*').eq('project_id', projectId).order('created_at'),
    'los edificios',
  );
  const edIds = edificios.map(e => e.id);
  const pisos = (
    await leerPorLotes<FloorRow>(
      edIds,
      (lote, d, h) => sb.from('floors').select('*').in('building_id', lote).order('id').range(d, h),
      'los pisos',
    )
  ).sort((a, b) => a.number - b.number);
  const pisoIds = pisos.map(f => f.id);
  const filas = await leerPorLotes<FilaUnidad>(
    pisoIds,
    (lote, d, h) => sb.from('units').select(COLS_UNIDAD).in('floor_id', lote).order('id').range(d, h).overrideTypes<FilaUnidad[], { merge: false }>(),
    'las unidades',
  );
  const amenitiesTodas = await leer<AmenityRow>(
    sb.from('amenities').select('*').eq('project_id', projectId).order('sort_order'),
    'los amenities',
  );
  const pois = await leer<PointOfInterestRow>(
    sb.from('points_of_interest').select('*').eq('project_id', projectId).order('sort_order'),
    'los puntos de interés',
  );
  const { data: calc, error: errCalc } = await sb
    .from('calculator_settings')
    .select('interest_rate, max_years, min_down_payment, financing_plans')
    .eq('project_id', projectId)
    .maybeSingle();
  if (errCalc) throw new Error(`No se pudo leer la calculadora: ${errCalc.message}`);

  const edPorId = new Map(edificios.map(e => [e.id, e]));
  const pisoPorId = new Map(pisos.map(f => [f.id, f]));
  const unidades = filas.map(u => {
    const piso = pisoPorId.get(u.floor_id)!;
    const ed = edPorId.get(piso.building_id)!;
    return unidadDesdeFila(u, ed.name, piso.label?.trim() ? piso.label : `Piso ${piso.number}`, ed.id);
  });

  const slides = await leer<SlideAerea>(
    sb.from('aerial_slides').select('label, image_url').eq('project_id', projectId).order('sort_order'),
    'las vistas aéreas',
  );
  const p = proyecto as ProjectRow;
  // El avance solo si el dueño lo muestra en el sitio: si lo apagó, puede ser a propósito.
  const secciones = resolveSectionOrder(p.section_config, getProjectTypeConfig(p.project_type, p.sale_mode));
  const avance = secciones.includes('progress') ? parseConstructionProgress(p.construction_progress) : null;

  return {
    proyecto: p,
    edificios,
    pisos,
    unidades,
    amenities: amenitiesTodas.filter(a => a.visible !== false),
    pois,
    calculadora: calc
      ? {
          interest_rate: Number(calc.interest_rate),
          max_years: Number(calc.max_years),
          min_down_payment: Number(calc.min_down_payment),
          financing_plans: parseStoredPlans(calc.financing_plans),
        }
      : null,
    slides,
    avance,
    faq: await cargarFaq(sb, projectId),
  };
}
