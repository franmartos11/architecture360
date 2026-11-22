// Texto que lee la IA sobre un proyecto + filtros sobre las unidades vivas.
// Sin imports de next/react: corre con tsx fuera de Next.
import type { ConstructionProgress } from '@/types';
import type { AmenityRow, BuildingRow, FloorRow, PointOfInterestRow, ProjectRow } from '@/types/database';
import type { WaBot } from '@/types/whatsapp-bot';
import { armarMaterial, resumenMaterial, urlMapa, type SlideAerea } from './material';
import type { PreguntaFrecuente } from './preguntas';
import { textoHorarios, type ConfigVisitas } from './visitas';

export type EstadoUnidad = 'available' | 'reserved' | 'sold';

export type UnidadBot = {
  /** id de la unidad y de su edificio: arman el link a su página pública. */
  id: string;
  edificioId: string;
  codigo: string;
  edificio: string;
  piso: string;
  tipo: string;
  categoria: string;
  ambientes: number | null;
  dormitorios: number;
  banos: number;
  m2Total: number | null;
  m2Cubiertos: number | null;
  precio: number | null;
  moneda: string;
  estado: EstadoUnidad;
  orientacion: string | null;
  expensas: number | null;
  cocheras: number;
  condicion: string | null;
  features: string[];
  fotos: string[];
  plano: string | null;
  plano3d: string | null;
};

export type DatosProyecto = {
  proyecto: ProjectRow;
  edificios: BuildingRow[];
  pisos: FloorRow[];
  unidades: UnidadBot[];
  amenities: AmenityRow[];
  pois: PointOfInterestRow[];
  calculadora: { interest_rate: number; max_years: number; min_down_payment: number } | null;
  /** Vistas aéreas / renders del masterplan. */
  slides: SlideAerea[];
  /** Avance de obra, solo si la sección está visible en el sitio. */
  avance: ConstructionProgress | null;
  /** Preguntas que el equipo ya respondió desde el panel. */
  faq: PreguntaFrecuente[];
};

const ESTADO_LABEL: Record<EstadoUnidad, string> = {
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
};

const CONDICION_LABEL: Record<string, string> = {
  a_estrenar: 'a estrenar',
  en_construccion: 'en construcción',
  en_pozo: 'en pozo',
  usada: 'usada',
};

const num = (n: number) => Math.round(n * 100) / 100;

function dinero(n: number, moneda: string): string {
  return `${moneda} ${Math.round(n).toLocaleString('es-AR')}`;
}

function precioTexto(u: Pick<UnidadBot, 'precio' | 'moneda'>): string {
  return u.precio != null && u.precio > 0 ? dinero(u.precio, u.moneda) : 'precio a consultar';
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function lineaUnidad(u: UnidadBot): string {
  const partes: string[] = [`${u.codigo} (${u.edificio}, ${u.piso})`, u.tipo];
  if (u.ambientes != null && u.ambientes > 0) partes.push(`${u.ambientes} amb`);
  if (u.m2Total != null && u.m2Total > 0) partes.push(`${num(u.m2Total)} m²`);
  partes.push(precioTexto(u));
  partes.push(ESTADO_LABEL[u.estado]);
  return partes.join(' · ');
}

/**
 * Las unidades que pidió la IA (por código) descriptas para el aviso al
 * vendedor: código, ambientes, m², precio. Un código que no existe va tal cual.
 */
export function unidadesParaAviso(codigos: string[], unidades: UnidadBot[]): string[] {
  return codigos
    .map(c => c.trim())
    .filter(Boolean)
    .map(c => {
      const u = unidades.find(x => x.codigo.trim().toLowerCase() === c.toLowerCase());
      return u ? lineaUnidad(u) : c;
    });
}

export function fichaUnidad(u: UnidadBot): string {
  const l: string[] = [`Unidad ${u.codigo} — ${u.edificio}, ${u.piso}`];
  l.push(`Estado: ${ESTADO_LABEL[u.estado]}`);
  l.push(`Precio: ${precioTexto(u)}`);
  l.push(`Tipo: ${u.tipo}`);
  if (u.ambientes != null && u.ambientes > 0) l.push(`Ambientes: ${u.ambientes}`);
  if (u.categoria === 'vivienda') {
    l.push(`Dormitorios: ${u.dormitorios}`);
    l.push(`Baños: ${u.banos}`);
  }
  if (u.m2Total != null && u.m2Total > 0) l.push(`Superficie total: ${num(u.m2Total)} m²`);
  if (u.m2Cubiertos != null && u.m2Cubiertos > 0) l.push(`Superficie cubierta: ${num(u.m2Cubiertos)} m²`);
  if (u.orientacion) l.push(`Orientación: ${u.orientacion}`);
  if (u.cocheras > 0) l.push(`Cocheras: ${u.cocheras}`);
  if (u.expensas != null && u.expensas > 0) l.push(`Expensas: ${dinero(u.expensas, u.moneda)}`);
  if (u.condicion) l.push(`Condición: ${CONDICION_LABEL[u.condicion] ?? u.condicion}`);
  if (u.features.length) l.push(`Características: ${u.features.join(', ')}`);
  return l.join('\n');
}

export function resumenInventario(unidades: UnidadBot[]): string {
  if (unidades.length === 0) return 'Todavía no hay unidades cargadas.';
  const disp = unidades.filter(u => u.estado === 'available');
  const reservadas = unidades.filter(u => u.estado === 'reserved').length;
  const vendidas = unidades.filter(u => u.estado === 'sold').length;
  const l: string[] = [
    `${plural(unidades.length, 'unidad', 'unidades')} en total: ${plural(disp.length, 'disponible', 'disponibles')}, ${plural(reservadas, 'reservada', 'reservadas')}, ${plural(vendidas, 'vendida', 'vendidas')}.`,
  ];
  const grupos = new Map<string, number>();
  for (const u of disp) {
    const k = u.ambientes != null && u.ambientes > 0 ? `${u.ambientes} amb` : u.tipo;
    grupos.set(k, (grupos.get(k) ?? 0) + 1);
  }
  if (grupos.size) {
    l.push(`Disponibles por tipo: ${[...grupos].map(([k, n]) => `${k}: ${n}`).join(', ')}.`);
  }
  const monedas = new Set(disp.filter(u => u.precio != null && u.precio > 0).map(u => u.moneda));
  const rangos: string[] = [];
  for (const m of monedas) {
    const ps = disp.filter(u => u.moneda === m && u.precio != null && u.precio > 0).map(u => u.precio as number);
    const min = Math.min(...ps);
    const max = Math.max(...ps);
    rangos.push(min === max ? dinero(min, m) : `${dinero(min, m)} a ${dinero(max, m)}`);
  }
  if (rangos.length) l.push(`Precios de las disponibles: ${rangos.join(' / ')}.`);
  return l.join('\n');
}

export type FiltroUnidades = {
  ambientes?: number;
  dormitorios?: number;
  precio_max?: number;
  moneda?: string;
  edificio?: string;
  estado?: EstadoUnidad | 'todas';
};

export const MAX_UNIDADES_LISTA = 15;

/** Primeras MAX_UNIDADES_LISTA coincidencias (ver `coincidenUnidades`). */
export function filtrarUnidades(us: UnidadBot[], f: FiltroUnidades): UnidadBot[] {
  return coincidenUnidades(us, f).slice(0, MAX_UNIDADES_LISTA);
}

/** Todas las unidades que cumplen el filtro (por defecto disponibles), de menor a mayor precio. */
export function coincidenUnidades(us: UnidadBot[], f: FiltroUnidades): UnidadBot[] {
  const estado = f.estado ?? 'available';
  const edificio = f.edificio?.trim().toLowerCase();
  return us
    .filter(u => estado === 'todas' || u.estado === estado)
    .filter(u => f.ambientes == null || u.ambientes === f.ambientes)
    .filter(u => f.dormitorios == null || u.dormitorios === f.dormitorios)
    .filter(u => f.moneda == null || u.moneda.toUpperCase() === f.moneda.toUpperCase())
    .filter(u => !edificio || u.edificio.toLowerCase().includes(edificio))
    .filter(u => f.precio_max == null || (u.precio != null && u.precio <= f.precio_max))
    .sort((a, b) => {
      if (a.precio == null && b.precio == null) return 0;
      if (a.precio == null) return 1;
      if (b.precio == null) return -1;
      return a.precio - b.precio;
    });
}

const MAX_NOVEDADES = 3;
const MAX_DETALLE_NOVEDAD = 300;

/** Avance de obra para la ficha: etapa, porcentaje, entrega estimada y últimas novedades. */
export function textoAvance(a: ConstructionProgress | null | undefined): string | null {
  if (!a) return null;
  const l: string[] = [];
  const ultima = [...a.updates].sort((x, y) => y.date.localeCompare(x.date));
  const etapaId = a.currentStageId ?? ultima.find(u => u.stageId)?.stageId;
  const etapa = a.stages.find(st => st.id === etapaId)?.label;
  if (etapa) l.push(`Etapa actual: ${etapa}`);
  if (a.stages.length > 1) l.push(`Etapas: ${a.stages.map(st => st.label).join(' → ')}`);
  if (a.percent != null) l.push(`Avance: ${Math.round(a.percent)}%`);
  if (a.deliveryEstimate?.trim()) l.push(`Entrega estimada: ${a.deliveryEstimate.trim()}`);
  const novedades = ultima.slice(0, MAX_NOVEDADES).map(u => {
    const det = u.body?.trim();
    const corto = det && det.length > MAX_DETALLE_NOVEDAD ? `${det.slice(0, MAX_DETALLE_NOVEDAD)}…` : det;
    return `- ${u.date}${u.title ? `: ${u.title}` : ''}${corto ? ` — ${corto}` : ''}`;
  });
  if (novedades.length) l.push(`Últimas novedades:\n${novedades.join('\n')}`);
  return l.length ? l.join('\n') : null;
}

export function armarFicha(
  d: Omit<DatosProyecto, 'unidades' | 'slides' | 'avance' | 'faq'> &
    Partial<Pick<DatosProyecto, 'slides' | 'avance' | 'faq'>> & {
      resumenUnidades: string;
      /** URL pública del sitio; null si el proyecto no está publicado. */
      sitio?: string | null;
      /** Agenda de visitas del bot (solo entra si está activa). */
      visitas?: ConfigVisitas | null;
    },
  bot: Pick<WaBot, 'conocimiento'>,
): string {
  const p = d.proyecto;
  const s: string[] = [`# Proyecto: ${p.name}`];
  if (p.tagline) s.push(p.tagline);
  if (p.location) s.push(`Ubicación: ${p.location}`);
  const mapa = urlMapa(p.latitude, p.longitude);
  if (mapa) s.push(`Ubicación en el mapa: ${mapa}`);
  if (d.sitio) s.push(`Sitio web del proyecto (fotos, recorrido 360 y unidades): ${d.sitio}`);
  if (p.description) s.push(`\n## Descripción\n${p.description}`);
  if (d.edificios.length) {
    s.push(`\n## Edificios\n${d.edificios.map(e => `- ${e.name}${e.total_floors > 0 ? ` (${plural(e.total_floors, 'piso', 'pisos')})` : ''}`).join('\n')}`);
  }
  const edificioDe = new Map(d.edificios.map(e => [e.id, e.name]));
  const amenities = d.amenities.map(a => {
    const extra = [a.category, a.building_id ? edificioDe.get(a.building_id) : null].filter(Boolean);
    const specs = (a.specs ?? []).filter(x => x.key?.trim() && x.value?.trim()).map(x => `${x.key}: ${x.value}`);
    let t = `- ${a.name}${extra.length ? ` (${extra.join(', ')})` : ''}`;
    if (a.description) t += `: ${a.description}`;
    if (specs.length) t += `. ${specs.join(', ')}`;
    return t;
  });
  if (amenities.length) s.push(`\n## Amenities\n${amenities.join('\n')}`);
  if (d.pois.length) {
    const lineas = d.pois.map(poi => {
      const t: string[] = [];
      if (poi.walk_minutes != null) t.push(`${poi.walk_minutes} min a pie`);
      if (poi.bike_minutes != null) t.push(`${poi.bike_minutes} min en bici`);
      if (poi.drive_minutes != null) t.push(`${poi.drive_minutes} min en auto`);
      if (!t.length && poi.distance_label) t.push(poi.distance_label);
      const desc = poi.description?.trim();
      return `- ${poi.name}${t.length ? `: ${t.join(', ')}` : ''}${desc ? `. ${desc}` : ''}`;
    });
    s.push(`\n## Zona y puntos de interés\n${lineas.join('\n')}`);
  }
  const avance = textoAvance(d.avance);
  if (avance) s.push(`\n## Avance de obra\n${avance}`);
  s.push(`\n## Unidades (resumen; para detalle usá las herramientas)\n${d.resumenUnidades}`);
  const material = resumenMaterial(
    armarMaterial({ proyecto: p, edificios: d.edificios, amenities: d.amenities, slides: d.slides ?? [], avance: d.avance ?? null }),
  );
  if (material) s.push(`\n## Material del proyecto para mandar con enviar_material\n${material}`);
  if (d.calculadora) {
    const c = d.calculadora;
    s.push(
      `\n## Simulador de cuotas de referencia (no es una oferta de financiación del desarrollador)\nEl sitio del proyecto trae un simulador con estos valores de ejemplo: tasa anual ${c.interest_rate}%, plazo hasta ${c.max_years} años, anticipo desde ${c.min_down_payment}%. Son solo para simular: no los presentes como condiciones de pago ni como financiación ofrecida.`,
    );
  }
  if (d.visitas?.activo) {
    const v = d.visitas;
    const l = [
      'Se agendan por este chat con ver_horarios_visita y agendar_visita.',
      `Duración: ${v.duracion_min} min.`,
    ];
    if (v.lugar) l.push(`Lugar: ${v.lugar}.`);
    const horarios = textoHorarios(v);
    if (horarios) l.push(`Horarios de visita: ${horarios}.`);
    s.push(`\n## Visitas al proyecto\n${l.join('\n')}`);
  }
  if (d.faq?.length) {
    const faq = d.faq.map(f => `- P: ${f.pregunta}\n  R: ${f.respuesta}`);
    s.push(`\n## Preguntas frecuentes (respondidas por el equipo)\n${faq.join('\n')}`);
  }
  if (bot.conocimiento && bot.conocimiento.trim()) {
    s.push(`\n## Información adicional del vendedor\n${bot.conocimiento}`);
  }
  return s.join('\n');
}
