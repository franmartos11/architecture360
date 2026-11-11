import type { ConstructionProgress, ConstructionStage, ConstructionUpdate, ProjectType } from '@/types';

// Avance de obra — helpers compartidos por la landing, el admin y el
// laboratorio. La pieza es la misma para cualquier tipo de proyecto: las
// etapas las define cada uno. Lo de acá abajo son solo SUGERENCIAS para no
// arrancar de cero; el admin las puede renombrar, reordenar o borrar.
// (La validación de lo que llega del admin vive en
// construction-progress-sanitize.ts, que usa sanitize-html — no tiene que
// terminar en el bundle del navegador.)

export const SUGGESTED_STAGES: Record<ProjectType, string[]> = {
  edificio: ['Excavación', 'Estructura', 'Cerramientos', 'Terminaciones', 'Entrega'],
  unico: ['Excavación', 'Estructura', 'Cerramientos', 'Terminaciones', 'Entrega'],
  duplex: ['Cimientos', 'Muros', 'Techo', 'Terminaciones', 'Entrega'],
  casa: ['Cimientos', 'Muros', 'Techo', 'Terminaciones', 'Entrega'],
  loteo: ['Amojonamiento', 'Apertura de calles', 'Agua y cloacas', 'Electricidad', 'Entrega'],
};

export const MAX_STAGES = 12;
export const MAX_UPDATES = 100;
export const MAX_IMAGES_PER_UPDATE = 12;

/** id corto para etapas y actualizaciones (no necesita ser global, solo único dentro del proyecto). */
export function newProgressId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function suggestedStages(projectType: ProjectType | undefined): ConstructionStage[] {
  return (SUGGESTED_STAGES[projectType ?? 'edificio'] ?? SUGGESTED_STAGES.edificio).map(label => ({ id: newProgressId(), label }));
}

export function emptyProgress(): ConstructionProgress {
  return { stages: [], updates: [] };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-03-14" → "mar 2026". Sin Date para no depender de la zona horaria. */
export function formatUpdateDate(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  if (!y) return '';
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

export function stageLabelOf(progress: ConstructionProgress, id: string | undefined): string | undefined {
  return id ? progress.stages.find(s => s.id === id)?.label : undefined;
}

/** ¿Tiene algo que mostrar en el sitio? Al menos una foto o un clip, y no es borrador. */
export function isPublishedUpdate(u: ConstructionUpdate): boolean {
  return !u.draft && (u.images.length > 0 || !!u.video);
}

/** Actualizaciones publicadas con foto o clip, de la más vieja a la más nueva. Es lo que ve el sitio. */
export function visibleUpdates(progress: ConstructionProgress): ConstructionUpdate[] {
  return progress.updates
    .filter(isPublishedUpdate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** La entrada más reciente por fecha (borradores incluidos si `includeDrafts`), o undefined. */
export function latestUpdate(progress: ConstructionProgress, { includeDrafts = false } = {}): ConstructionUpdate | undefined {
  return [...progress.updates]
    .filter(u => includeDrafts || !u.draft)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

const DAY_MS = 86_400_000;
/** Días enteros entre dos fechas yyyy-mm-dd (en UTC, sin zona horaria). Negativo si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Días desde la última entrada publicada hasta `today` (yyyy-mm-dd), o null si no hay ninguna. Para el "hace N días" del panel. */
export function daysSinceLastUpdate(progress: ConstructionProgress, today: string): number | null {
  const last = latestUpdate(progress, { includeDrafts: true });
  return last ? daysBetween(last.date, today) : null;
}

/** "Mes N de obra" contando desde startedAt (el mes de inicio es el 1). null sin fecha de inicio o si `date` es anterior. */
export function constructionMonth(progress: ConstructionProgress, date: string): number | null {
  if (!progress.startedAt) return null;
  const [y0, m0] = progress.startedAt.split('-').map(Number);
  const [y1, m1] = date.split('-').map(Number);
  if (!y0 || !y1) return null;
  const months = (y1 - y0) * 12 + (m1 - m0) + 1;
  return months >= 1 ? months : null;
}

/** Etapa en curso: la marcada, o la de la actualización más reciente que tenga una. */
export function currentStageIndex(progress: ConstructionProgress): number {
  const byId = (id?: string) => (id ? progress.stages.findIndex(s => s.id === id) : -1);
  const marked = byId(progress.currentStageId);
  if (marked >= 0) return marked;
  const latest = [...progress.updates].sort((a, b) => b.date.localeCompare(a.date)).find(u => byId(u.stageId) >= 0);
  return latest ? byId(latest.stageId) : -1;
}

/** ¿Hay algo para mostrar en la landing? Fotos, o al menos el número / la entrega. */
export function hasConstructionProgress(progress: ConstructionProgress | undefined | null): progress is ConstructionProgress {
  if (!progress) return false;
  return visibleUpdates(progress).length > 0 || progress.percent != null || !!progress.deliveryEstimate;
}

// ─── Datos de ejemplo (solo para /prototipos/avance-de-obra) ─────────

const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=75`;
const st = (labels: string[]) => labels.map((label, i) => ({ id: `s${i}`, label }));

export const DEMO_PROGRESS: Record<'edificio' | 'casa' | 'loteo', ConstructionProgress> = {
  edificio: {
    stages: st(SUGGESTED_STAGES.edificio),
    currentStageId: 's3',
    percent: 72,
    deliveryEstimate: 'Diciembre 2027',
    updates: [
      { id: 'e1', date: '2025-08-10', stageId: 's0', title: 'Arrancó el movimiento de suelos', body: 'Excavación de los dos subsuelos y submuración de las medianeras.', images: [u('1517089596392-fb9a9033e05b')], view: 'Dron' },
      { id: 'e2', date: '2025-11-22', stageId: 's1', title: 'Platea de fundación terminada', body: 'Se hormigonó la platea completa en una sola jornada.', images: [u('1504307651254-35680f356dfd')], view: 'Dron' },
      { id: 'e3', date: '2026-02-18', stageId: 's1', title: 'Columnas del piso 4', body: 'La estructura avanza a razón de un piso cada tres semanas.', images: [u('1531834685032-c34bf0d84c77')], view: 'Frente' },
      { id: 'e4', date: '2026-05-30', stageId: 's1', title: 'Losa de techo hormigonada', body: 'Terminó la estructura de hormigón: 12 pisos y sala de máquinas.', images: [u('1429497419816-9ca5cfb4571a')], view: 'Frente' },
      { id: 'e5', date: '2026-08-14', stageId: 's2', title: 'Fachada y carpinterías', body: 'Mampostería completa y colocación de aberturas hasta el piso 8.', images: [u('1508450859948-4e04fabaa4ea')], view: 'Frente' },
      { id: 'e6', date: '2026-10-25', stageId: 's3', title: 'Instalaciones y terminaciones', body: 'Tableros, cañerías y pisos en las unidades de los primeros niveles.', images: [u('1621905251189-08b45d6a269e')], view: 'Interior' },
    ],
  },
  casa: {
    stages: st(SUGGESTED_STAGES.casa),
    currentStageId: 's2',
    percent: 55,
    deliveryEstimate: 'Marzo 2027',
    updates: [
      { id: 'c1', date: '2026-03-05', stageId: 's0', title: 'Cimientos y vigas de fundación', body: 'Replanteo, excavación de zanjas y armado de hierros.', images: [u('1489514354504-1653aa90e34e')] },
      { id: 'c2', date: '2026-06-12', stageId: 's1', title: 'Estructura de muros en pie', body: 'Paneles de planta baja y alta montados.', images: [u('1587582423116-ec07293f0395')], view: 'Frente' },
      { id: 'c3', date: '2026-09-08', stageId: 's2', title: 'Techo en marcha', body: 'Cabriadas colocadas, sigue la aislación y la cubierta.', images: [u('1513467535987-fd81bc7d62f8')], view: 'Frente' },
      { id: 'c4', date: '2026-10-30', stageId: 's2', title: 'Así va a quedar', body: 'Render de la fachada terminada, para comparar con la obra.', images: [u('1600596542815-ffad4c1539a9')], view: 'Frente' },
    ],
  },
  loteo: {
    stages: st(SUGGESTED_STAGES.loteo),
    currentStageId: 's2',
    percent: 40,
    deliveryEstimate: 'Posesión desde junio 2027',
    updates: [
      { id: 'l1', date: '2025-12-01', stageId: 's0', title: 'Así estaba el campo', body: 'Relevamiento topográfico y amojonamiento de los 120 lotes.', images: [u('1500382017468-9049fed747ef')], view: 'Dron' },
      { id: 'l2', date: '2026-04-15', stageId: 's1', title: 'Apertura de calles', body: 'Movimiento de suelo y trazado de las calles internas.', images: [u('1517089596392-fb9a9033e05b')], view: 'Dron' },
      { id: 'l3', date: '2026-09-20', stageId: 's2', title: 'Red de agua y cloacas', body: 'Zanjeo y tendido de cañerías en el sector norte.', images: [u('1541888946425-d81bb19240f5')], view: 'Dron' },
      { id: 'l4', date: '2026-10-28', stageId: 's2', title: 'Así va a quedar el barrio', body: 'Render del barrio con las primeras casas construidas.', images: [u('1605276374104-dee2a0ed3cd6')], view: 'Calle' },
    ],
  },
};
