import type { ConstructionProgress } from '@/types';
import { SUGGESTED_STAGES } from '@/lib/construction-progress';

// Datos de ejemplo del avance de obra, solo para /prototipos/avance-de-obra.
// Viven aparte de lib/construction-progress.ts porque ese módulo lo importan
// el editor del panel y la vista pública: con esto adentro, las URLs de
// ejemplo viajaban en el bundle del sitio de cada cliente.

const u = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=75`;
const st = (labels: string[]) => labels.map((label, i) => ({ id: `s${i}`, label }));

export const DEMO_PROGRESS: Record<'edificio' | 'casa' | 'loteo', ConstructionProgress> = {
  // Más de STORY_MAX (8) entradas publicadas a propósito, para ver la
  // historia acotada y el "Ver las N entradas"; dos ángulos con varios
  // cuadros (chips del time-lapse y comparación del mismo ángulo) y un
  // borrador que no tiene que aparecer en ningún lado.
  edificio: {
    stages: [
      { id: 's0', label: 'Excavación', from: '2025-07-01', to: '2025-10-31' },
      { id: 's1', label: 'Estructura', from: '2025-11-01', to: '2026-06-15' },
      { id: 's2', label: 'Cerramientos', from: '2026-06-16', to: '2026-10-15' },
      { id: 's3', label: 'Terminaciones', from: '2026-10-16' },
      { id: 's4', label: 'Entrega' },
    ],
    currentStageId: 's3',
    percent: 72,
    deliveryEstimate: 'Diciembre 2027',
    startedAt: '2025-07-01',
    updates: [
      { id: 'e0', date: '2025-07-20', stageId: 's0', title: 'Cerco de obra y demolición', body: 'Se levantó el cerco perimetral y se demolió la casa existente.', images: [u('1541888946425-d81bb19240f5')], view: 'Frente' },
      { id: 'e1', date: '2025-08-10', stageId: 's0', title: 'Arrancó el movimiento de suelos', body: 'Excavación de los dos subsuelos y submuración de las medianeras.', images: [u('1517089596392-fb9a9033e05b')], view: 'Dron' },
      { id: 'e1b', date: '2025-09-28', stageId: 's0', title: 'Submuración terminada', body: 'Las medianeras quedaron apuntaladas en todo el perímetro.', images: [u('1500382017468-9049fed747ef')], view: 'Dron' },
      { id: 'e2', date: '2025-11-22', stageId: 's1', title: 'Platea de fundación terminada', body: 'Se hormigonó la platea completa en una sola jornada.', images: [u('1504307651254-35680f356dfd')], view: 'Dron' },
      { id: 'e3', date: '2026-02-18', stageId: 's1', title: 'Columnas del piso 4', body: 'La estructura avanza a razón de un piso cada tres semanas.', images: [u('1531834685032-c34bf0d84c77'), u('1587582423116-ec07293f0395')], view: 'Frente' },
      { id: 'e3b', date: '2026-04-05', stageId: 's1', title: 'Piso 9 y tanque de reserva', body: 'Se encofró el piso 9 y llegaron los tanques de reserva.', images: [u('1489514354504-1653aa90e34e')], view: 'Frente' },
      { id: 'e4', date: '2026-05-30', stageId: 's1', title: 'Losa de techo hormigonada', body: 'Terminó la estructura de hormigón: 12 pisos y sala de máquinas.', images: [u('1429497419816-9ca5cfb4571a')], view: 'Frente' },
      { id: 'e5', date: '2026-08-14', stageId: 's2', title: 'Fachada y carpinterías', body: 'Mampostería completa y colocación de aberturas hasta el piso 8.', images: [u('1508450859948-4e04fabaa4ea')], view: 'Frente' },
      { id: 'e5b', date: '2026-09-20', stageId: 's2', title: 'Balcones y barandas', body: 'Barandas de vidrio colocadas en los balcones del frente.', images: [u('1513467535987-fd81bc7d62f8')], view: 'Frente' },
      { id: 'e6', date: '2026-10-25', stageId: 's3', title: 'Instalaciones y terminaciones', body: 'Tableros, cañerías y pisos en las unidades de los primeros niveles.', images: [u('1621905251189-08b45d6a269e')], view: 'Interior' },
      { id: 'e7', date: '2026-11-05', stageId: 's3', title: 'Pintura de palieres', body: 'Borrador: todavía no se publica.', images: [u('1600596542815-ffad4c1539a9')], view: 'Interior', draft: true },
    ],
  },
  casa: {
    stages: st(SUGGESTED_STAGES.casa),
    currentStageId: 's2',
    percent: 55,
    deliveryEstimate: 'Marzo 2027',
    startedAt: '2026-02-01',
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
    startedAt: '2025-11-01',
    updates: [
      { id: 'l1', date: '2025-12-01', stageId: 's0', title: 'Así estaba el campo', body: 'Relevamiento topográfico y amojonamiento de los 120 lotes.', images: [u('1500382017468-9049fed747ef')], view: 'Dron' },
      { id: 'l2', date: '2026-04-15', stageId: 's1', title: 'Apertura de calles', body: 'Movimiento de suelo y trazado de las calles internas.', images: [u('1517089596392-fb9a9033e05b')], view: 'Dron' },
      { id: 'l3', date: '2026-09-20', stageId: 's2', title: 'Red de agua y cloacas', body: 'Zanjeo y tendido de cañerías en el sector norte.', images: [u('1541888946425-d81bb19240f5')], view: 'Dron' },
      { id: 'l4', date: '2026-10-28', stageId: 's2', title: 'Así va a quedar el barrio', body: 'Render del barrio con las primeras casas construidas.', images: [u('1605276374104-dee2a0ed3cd6')], view: 'Calle' },
    ],
  },
};
