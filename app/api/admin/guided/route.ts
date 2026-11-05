import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { canonicalProjectType, getProjectTypeConfig } from '@/lib/project-types';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import { sanitizeText, sanitizePolygon } from '@/lib/sanitize';
import { isValidEnum, UNIT_STATUSES } from '@/lib/validate';
import {
  planEdificio, planDuplex, planLoteo, planUnico, countUnits, duplicateCodes, MAX_PLANNED_UNITS,
  type PlannedBuilding, type TowerInput, type DuplexModel, type BlockInput, type LevelInput, type NumberingScheme, type GroundFloorUse,
} from '@/lib/guided-structure';

// Carga guiada (/admin/carga). Tres operaciones, todas en UN request para
// no pasar por el límite de escrituras por minuto del panel (proxy.ts),
// que está pensado para una escritura por vez y no para dar de alta 48
// unidades una por una:
//
//  GET   → el árbol completo edificios → pisos → unidades del proyecto activo.
//  POST  → crea la estructura del paso 1 de cada flujo (o agrega espacios a
//          un nivel de un proyecto único) a partir de lib/guided-structure.
//  PATCH → actualiza en lote campos de unidades y pisos (tipologías, planta
//          tipo, precios de lotes, polígonos…).

const UNIT_COLUMNS = 'id, floor_id, code, model_name, type, category, bedrooms, bathrooms, total_area, inner_area, balcony_area, external_area, lot_size, floors_count, living_rooms, garage_spaces, hoa_fee, price, currency, status, condition, features, polygon, rooms, tour_data, gallery_images, interior_image_url';

async function loadTree(supabase: SupabaseClient, projectId: string) {
  const { data: buildings, error } = await supabase
    .from('buildings').select('id, slug, name, total_floors, created_at').eq('project_id', projectId).order('created_at');
  if (error) return { error: error.message };
  const buildingIds = (buildings ?? []).map(b => b.id as string);
  const { data: floors, error: floorsErr } = buildingIds.length
    ? await supabase.from('floors').select('id, building_id, number, label, plan_image, floor_kind, floor_kind_description, unit_dots').in('building_id', buildingIds).order('number')
    : { data: [], error: null };
  if (floorsErr) return { error: floorsErr.message };
  const floorIds = (floors ?? []).map(f => f.id as string);
  const { data: units, error: unitsErr } = floorIds.length
    ? await supabase.from('units').select(UNIT_COLUMNS).in('floor_id', floorIds).order('code')
    : { data: [], error: null };
  if (unitsErr) return { error: unitsErr.message };

  const unitsByFloor = new Map<string, unknown[]>();
  for (const u of (units ?? []) as { floor_id: string }[]) {
    const list = unitsByFloor.get(u.floor_id) ?? [];
    list.push(u);
    unitsByFloor.set(u.floor_id, list);
  }
  return {
    buildings: (buildings ?? []).map(b => ({
      ...b,
      floors: (floors ?? [])
        .filter(f => f.building_id === b.id)
        .map(f => ({ ...f, units: unitsByFloor.get(f.id as string) ?? [] })),
    })),
  };
}

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tree = await loadTree(access.supabase, projectId);
  if ('error' in tree) return NextResponse.json({ error: tree.error }, { status: 500 });
  return NextResponse.json(tree);
}

// ─── POST ──────────────────────────────────────────────────────────

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const str = (v: unknown, max: number) => sanitizeText(typeof v === 'string' ? v : '', max);
const url = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null);

/** { "5": 2 } → { 5: 2 }: claves = número de piso/posición, valores = cantidad; descarta lo inválido. */
function parseOverrides(v: unknown, maxKey: number, maxVal: number): Record<number, number> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<number, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>).slice(0, 500)) {
    const key = Math.floor(Number(k));
    const val = Math.floor(Number(raw));
    if (Number.isFinite(key) && key >= 0 && key <= maxKey && Number.isFinite(val) && val >= 1 && val <= maxVal) out[key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

const GROUND: GroundFloorUse[] = ['none', 'amenities', 'locales', 'cocheras', 'unidades'];
const SCHEMES: NumberingScheme[] = ['letter', 'number', 'custom'];

function parsePlan(body: Record<string, unknown>, projectName: string): PlannedBuilding[] | string {
  switch (body.kind) {
    case 'edificio': {
      if (!Array.isArray(body.towers) || body.towers.length === 0 || body.towers.length > 12) return 'Mandá entre 1 y 12 torres.';
      const towers: TowerInput[] = body.towers.map((t: Record<string, unknown>, i: number) => ({
        name: str(t?.name, 80) || `Torre ${i + 1}`,
        floors: int(t?.floors, 0, 200, 1),
        perFloor: int(t?.perFloor, 1, 60, 1),
        groundFloor: isValidEnum(t?.groundFloor, GROUND) ? t.groundFloor as GroundFloorUse : 'none',
        penthouses: int(t?.penthouses, 0, 20, 0),
        floorOverrides: parseOverrides(t?.floorOverrides, 200, 60),
      }));
      const scheme = isValidEnum(body.scheme, SCHEMES) ? body.scheme as NumberingScheme : 'letter';
      return planEdificio(towers, scheme, str(body.template, 40) || undefined);
    }
    case 'duplex': {
      const rawModels = Array.isArray(body.models) ? body.models.slice(0, 10) : [];
      const models: DuplexModel[] = rawModels.map((m: Record<string, unknown>, i: number) => ({
        name: str(m?.name, 80) || `Modelo ${i + 1}`,
        bedrooms: int(m?.bedrooms, 0, 20, 0),
        bathrooms: int(m?.bathrooms, 0, 20, 1),
        floorsCount: int(m?.floorsCount, 1, 6, 2),
        innerArea: num(m?.innerArea),
        lotSize: num(m?.lotSize),
        garageSpaces: int(m?.garageSpaces, 0, 10, 0),
      }));
      if (models.length === 0) return 'Falta el modelo de unidad.';
      const unitModels: Record<string, number> = {};
      if (body.unitModels && typeof body.unitModels === 'object' && !Array.isArray(body.unitModels)) {
        for (const [code, idx] of Object.entries(body.unitModels as Record<string, unknown>).slice(0, 800)) {
          const n = Math.floor(Number(idx));
          if (/^D\d{1,3}-[A-Z]{1,2}$/.test(code) && Number.isFinite(n) && n >= 0 && n < models.length) unitModels[code] = n;
        }
      }
      return planDuplex(int(body.count, 1, 100, 1), int(body.perDuplex, 1, 8, 2), models, unitModels);
    }
    case 'loteo': {
      const mode = body.mode === 'sequential' ? 'sequential' : 'blocks';
      const blocks: BlockInput[] = Array.isArray(body.blocks)
        ? body.blocks.slice(0, 200).map((b: Record<string, unknown>, i: number) => ({ name: str(b?.name, 40) || `Manzana ${i + 1}`, lots: int(b?.lots, 0, 500, 0) }))
        : [];
      if (mode === 'blocks' && blocks.every(b => b.lots === 0)) return 'Cargá al menos una manzana con lotes.';
      return planLoteo({ name: str(body.name, 150) || projectName, planImage: url(body.planImage), mode, blocks, totalLots: int(body.totalLots, 1, MAX_PLANNED_UNITS, 1) });
    }
    case 'unico': {
      if (!Array.isArray(body.levels) || body.levels.length === 0 || body.levels.length > 60) return 'Mandá entre 1 y 60 niveles.';
      const levels: LevelInput[] = body.levels.map((l: Record<string, unknown>) => ({ name: str(l?.name, 80), use: str(l?.use, 120), planImage: url(l?.planImage) }));
      return planUnico(projectName, levels);
    }
    default:
      return 'kind debe ser edificio, duplex, loteo, unico o spaces.';
  }
}

const KIND_FOR_TYPE: Record<string, string> = { edificio: 'edificio', duplex: 'duplex', loteo: 'loteo', unico: 'unico' };

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  const { data: project } = await supabase.from('projects').select('name, project_type, sale_mode').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  if (body.kind === 'spaces') return addSpaces(supabase, projectId, body);

  const type = canonicalProjectType(project.project_type ?? '');
  if (KIND_FOR_TYPE[type] !== body.kind) {
    return NextResponse.json({ error: `Este proyecto es de tipo "${type}"; no se le puede armar una estructura de "${String(body.kind)}".` }, { status: 400 });
  }

  const { count } = await supabase.from('buildings').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Este proyecto ya tiene su estructura creada. Los cambios se hacen desde la pantalla de estructura.' }, { status: 409 });
  }

  const plan = parsePlan(body, project.name ?? 'Proyecto');
  if (typeof plan === 'string') return NextResponse.json({ error: plan }, { status: 400 });
  const total = countUnits(plan);
  if (total > MAX_PLANNED_UNITS) return NextResponse.json({ error: `Son ${total} unidades; el máximo por carga es ${MAX_PLANNED_UNITS}.` }, { status: 400 });
  const dups = duplicateCodes(plan);
  if (dups.length > 0) return NextResponse.json({ error: `Hay códigos repetidos: ${dups.slice(0, 5).join(', ')}. Cambiá la numeración.` }, { status: 400 });

  const typeConfig = getProjectTypeConfig(project.project_type ?? '', project.sale_mode ?? '');
  const created: string[] = [];
  try {
    for (const b of plan) {
      const slug = await ensureUniqueSlug(supabase, {
        table: 'buildings', column: 'slug', base: slugify(b.name),
        scope: { column: 'project_id', value: projectId },
      });
      const { data: building, error } = await supabase
        .from('buildings')
        .insert({ project_id: projectId, slug, name: b.name, total_floors: Math.max(1, b.floors.length) })
        .select('id').single();
      if (error || !building) throw new Error(error?.message ?? 'No se pudo crear el edificio');
      created.push(building.id);

      if (b.floors.length === 0) continue;
      const { data: floors, error: floorsErr } = await supabase
        .from('floors')
        .insert(b.floors.map(f => ({
          building_id: building.id,
          number: f.number,
          label: f.label,
          plan_image: f.planImage ?? null,
          floor_kind: f.floorKind,
          floor_kind_description: f.floorKindDescription ?? null,
        })))
        .select('id, number');
      if (floorsErr || !floors) throw new Error(floorsErr?.message ?? 'No se pudieron crear los pisos');
      const floorIdByNumber = new Map(floors.map(f => [f.number as number, f.id as string]));

      const rows = b.floors.flatMap(f => f.units.map(u => ({
        floor_id: floorIdByNumber.get(f.number),
        code: u.code,
        type: u.type,
        model_name: u.modelName ?? null,
        bedrooms: u.bedrooms ?? 0,
        bathrooms: u.bathrooms ?? 1,
        floors_count: u.floorsCount ?? 1,
        inner_area: u.innerArea ?? null,
        lot_size: u.lotSize ?? null,
        garage_spaces: u.garageSpaces ?? 0,
        // Un proyecto "solo para mostrar" no tiene estado de venta — pero
        // la columna es NOT NULL; 'available' es el neutro que no se ve.
        status: 'available',
      })));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: unitsErr } = await supabase.from('units').insert(rows.slice(i, i + 500));
        if (unitsErr) throw new Error(unitsErr.message);
      }
    }
  } catch (e) {
    // Todo o nada: si algo falló a mitad de camino, se borra lo creado
    // (floors/units caen en cascada) para que el usuario pueda reintentar
    // sin chocar con el 409 de "ya tiene estructura".
    if (created.length) await supabase.from('buildings').delete().in('id', created);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo crear la estructura' }, { status: 500 });
  }

  const tree = await loadTree(supabase, projectId);
  if ('error' in tree) return NextResponse.json({ error: tree.error }, { status: 500 });
  return NextResponse.json({ ...tree, unitsCreated: total, unitLabel: typeConfig.unitLabel }, { status: 201 });
}

async function floorIdsOfProject(supabase: SupabaseClient, projectId: string): Promise<Set<string>> {
  const { data: buildings } = await supabase.from('buildings').select('id').eq('project_id', projectId);
  const buildingIds = (buildings ?? []).map(b => b.id as string);
  if (buildingIds.length === 0) return new Set();
  const { data: floors } = await supabase.from('floors').select('id').in('building_id', buildingIds);
  return new Set((floors ?? []).map(f => f.id as string));
}

// Espacios de un nivel (proyecto único) — o cualquier alta de unidades
// sueltas sobre un piso que ya existe. Salta los códigos que ya están.
async function addSpaces(supabase: SupabaseClient, projectId: string, body: Record<string, unknown>) {
  const floorId = typeof body.floorId === 'string' ? body.floorId : '';
  const ownFloors = await floorIdsOfProject(supabase, projectId);
  if (!ownFloors.has(floorId)) return NextResponse.json({ error: 'El nivel no pertenece a este proyecto' }, { status: 400 });
  const spaces = Array.isArray(body.spaces) ? body.spaces.slice(0, 200) : [];
  const rows = spaces
    .map((s: Record<string, unknown>) => ({ floor_id: floorId, code: str(s?.code, 60), type: str(s?.type, 80) || 'Espacio', status: 'available' }))
    .filter((r: { code: string }) => r.code);
  if (rows.length === 0) return NextResponse.json({ error: 'Faltan los nombres de los espacios' }, { status: 400 });

  const { data: existing } = await supabase.from('units').select('code').eq('floor_id', floorId);
  const taken = new Set((existing ?? []).map(u => u.code as string));
  const fresh = rows.filter((r: { code: string }) => !taken.has(r.code));
  if (fresh.length === 0) return NextResponse.json({ error: 'Ya hay espacios con esos nombres en este nivel' }, { status: 409 });
  const { data, error } = await supabase.from('units').insert(fresh).select(UNIT_COLUMNS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ units: data ?? [] }, { status: 201 });
}

// ─── PATCH ─────────────────────────────────────────────────────────

const MAX_PATCH = 1000;

// camelCase del cliente → columna. Solo lo que algún paso de la carga
// guiada edita; el resto sigue pasando por /api/admin/units/[id].
const UNIT_FIELDS: Record<string, { column: string; kind: 'text' | 'number' | 'int' | 'json' | 'textArray' | 'status' | 'condition' }> = {
  code: { column: 'code', kind: 'text' },
  modelName: { column: 'model_name', kind: 'text' },
  type: { column: 'type', kind: 'text' },
  bedrooms: { column: 'bedrooms', kind: 'int' },
  bathrooms: { column: 'bathrooms', kind: 'number' },
  livingRooms: { column: 'living_rooms', kind: 'int' },
  floorsCount: { column: 'floors_count', kind: 'int' },
  garageSpaces: { column: 'garage_spaces', kind: 'int' },
  totalArea: { column: 'total_area', kind: 'number' },
  innerArea: { column: 'inner_area', kind: 'number' },
  balconyArea: { column: 'balcony_area', kind: 'number' },
  externalArea: { column: 'external_area', kind: 'number' },
  lotSize: { column: 'lot_size', kind: 'number' },
  hoaFee: { column: 'hoa_fee', kind: 'number' },
  price: { column: 'price', kind: 'number' },
  status: { column: 'status', kind: 'status' },
  condition: { column: 'condition', kind: 'condition' },
  orientation: { column: 'orientation', kind: 'text' },
  features: { column: 'features', kind: 'textArray' },
  galleryImages: { column: 'gallery_images', kind: 'textArray' },
  interiorImageUrl: { column: 'interior_image_url', kind: 'text' },
  polygon: { column: 'polygon', kind: 'json' },
  rooms: { column: 'rooms', kind: 'json' },
  tourData: { column: 'tour_data', kind: 'json' },
};
// Columnas NOT NULL: un null ahí rompe el update entero.
const NOT_NULL = new Set(['code', 'type', 'bedrooms', 'bathrooms', 'living_rooms', 'floors_count', 'garage_spaces', 'balcony_area', 'external_area', 'status', 'features', 'gallery_images']);
const CONDITIONS = ['a_estrenar', 'en_construccion', 'en_pozo', 'usada'] as const;

function buildUnitUpdate(input: Record<string, unknown>): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(UNIT_FIELDS)) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null) {
      if (NOT_NULL.has(spec.column)) return `${key} no puede quedar vacío`;
      out[spec.column] = null;
      continue;
    }
    switch (spec.kind) {
      case 'text': {
        const s = sanitizeText(v, spec.column === 'interior_image_url' ? 2000 : spec.column === 'orientation' ? 10 : 150);
        if (!s && NOT_NULL.has(spec.column)) return `${key} no puede quedar vacío`;
        out[spec.column] = s || null;
        break;
      }
      case 'number':
      case 'int': {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return `${key} debe ser un número`;
        out[spec.column] = spec.kind === 'int' ? Math.floor(n) : n;
        break;
      }
      case 'status':
        if (!isValidEnum(v, UNIT_STATUSES)) return `status debe ser uno de: ${UNIT_STATUSES.join(', ')}`;
        out[spec.column] = v;
        break;
      case 'condition':
        if (!isValidEnum(v, CONDITIONS)) return `condition debe ser uno de: ${CONDITIONS.join(', ')}`;
        out[spec.column] = v;
        break;
      case 'textArray':
        if (!Array.isArray(v)) return `${key} debe ser una lista`;
        out[spec.column] = v.filter((s): s is string => typeof s === 'string').map(s => s.slice(0, 2000)).slice(0, 200);
        break;
      case 'json':
        out[spec.column] = spec.column === 'polygon' ? sanitizePolygon(v) : v;
        break;
    }
  }
  return out;
}

export async function PATCH(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json().catch(() => null) as { units?: unknown; floors?: unknown } | null;
  const unitPatches = Array.isArray(body?.units) ? body.units as Record<string, unknown>[] : [];
  const floorPatches = Array.isArray(body?.floors) ? body.floors as Record<string, unknown>[] : [];
  if (unitPatches.length + floorPatches.length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  if (unitPatches.length > MAX_PATCH || floorPatches.length > MAX_PATCH) {
    return NextResponse.json({ error: `Máximo ${MAX_PATCH} cambios por vez` }, { status: 400 });
  }

  const unitUpdates: { id: string; values: Record<string, unknown> }[] = [];
  for (const p of unitPatches) {
    if (typeof p?.id !== 'string') return NextResponse.json({ error: 'Cada unidad necesita su id' }, { status: 400 });
    const values = buildUnitUpdate(p);
    if (typeof values === 'string') return NextResponse.json({ error: values }, { status: 400 });
    unitUpdates.push({ id: p.id, values });
  }
  const floorUpdates: { id: string; values: Record<string, unknown> }[] = [];
  for (const p of floorPatches) {
    if (typeof p?.id !== 'string') return NextResponse.json({ error: 'Cada piso necesita su id' }, { status: 400 });
    const values: Record<string, unknown> = {};
    if ('planImage' in p) values.plan_image = url(p.planImage);
    if ('label' in p) {
      const label = str(p.label, 100);
      if (!label) return NextResponse.json({ error: 'label no puede quedar vacío' }, { status: 400 });
      values.label = label;
    }
    if ('unitDots' in p) {
      if (!Array.isArray(p.unitDots)) return NextResponse.json({ error: 'unitDots debe ser una lista' }, { status: 400 });
      values.unit_dots = p.unitDots.slice(0, 2000);
    }
    floorUpdates.push({ id: p.id, values });
  }

  // Todo lo que se toca tiene que ser de ESTE proyecto.
  const ownFloors = await floorIdsOfProject(supabase, projectId);
  if (floorUpdates.some(f => !ownFloors.has(f.id))) {
    return NextResponse.json({ error: 'Hay pisos que no pertenecen a este proyecto' }, { status: 400 });
  }
  if (unitUpdates.length > 0) {
    const ids = unitUpdates.map(u => u.id);
    const owned = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await supabase.from('units').select('id, floor_id').in('id', ids.slice(i, i + 300));
      for (const u of data ?? []) if (ownFloors.has(u.floor_id as string)) owned.add(u.id as string);
    }
    if (ids.some(id => !owned.has(id))) return NextResponse.json({ error: 'Hay unidades que no pertenecen a este proyecto' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const failed: { id: string; error: string }[] = [];
  const run = async <T,>(items: T[], fn: (item: T) => Promise<void>) => {
    for (let i = 0; i < items.length; i += 25) await Promise.all(items.slice(i, i + 25).map(fn));
  };
  await run(unitUpdates, async u => {
    if (Object.keys(u.values).length === 0) return;
    const { error } = await supabase.from('units').update({ ...u.values, updated_at: now }).eq('id', u.id);
    if (error) failed.push({ id: u.id, error: error.code === '23505' ? 'Código repetido en ese piso' : error.message });
  });
  await run(floorUpdates, async f => {
    if (Object.keys(f.values).length === 0) return;
    const { error } = await supabase.from('floors').update(f.values).eq('id', f.id);
    if (error) failed.push({ id: f.id, error: error.message });
  });

  if (failed.length > 0) {
    return NextResponse.json({ error: `No se pudieron guardar ${failed.length} cambio${failed.length === 1 ? '' : 's'}.`, failed }, { status: 500 });
  }
  return NextResponse.json({ updated: unitUpdates.length + floorUpdates.length });
}
