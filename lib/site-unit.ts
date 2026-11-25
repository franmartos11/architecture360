import type { BimModel, Building, Project, Unit } from '@/types';

// Búsqueda de la unidad de la página pública /edificio/<buildingId>/unidad/<código>.
// El código (Unit.id) solo es único por piso (unique (floor_id, code)): dos
// torres con la misma numeración tienen, por ejemplo, una "101" cada una. Por
// eso se busca dentro del edificio de la URL y no en todo el proyecto, que
// devolvía la primera que encontraba aunque fuera de la otra torre.
// También se acepta el uuid de la unidad (Unit.dbId), que no es ambiguo: los
// links que arma el bot de WhatsApp (lib/whatsapp-bot/material.ts) lo usan.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null; // "%E0%A4%A" y similares: no es un código válido
  }
}

export function findSiteUnit(
  project: Pick<Project, 'buildings' | 'units'> | null | undefined,
  buildingId: string,
  unitParam: string,
): { building: Building; unit: Unit } | null {
  const building = project?.buildings.find(b => b.id === buildingId);
  if (!project || !building) return null;
  const decoded = safeDecode(unitParam);
  const inBuilding = project.units.filter(u => u.buildingId === building.id);
  // Primero el código decodificado (los links lo codifican); si no, tal cual
  // llegó, por si el código tiene un "%" que no era un escape.
  const unit = (UUID_RE.test(unitParam) && inBuilding.find(u => u.dbId === unitParam.toLowerCase())) ||
    (decoded !== null && inBuilding.find(u => u.id === decoded)) ||
    inBuilding.find(u => u.id === unitParam);
  return unit ? { building, unit } : null;
}

/**
 * Pieza BIM para la unidad: la asignada a ella, si no la de su piso, si no la
 * general (sin unidades ni pisos). bim_model_units guarda el uuid de la unidad
 * (Unit.dbId), no el código.
 */
export function unitBimModel(models: BimModel[] | undefined, unit: Pick<Unit, 'dbId' | 'floorId'>): BimModel | undefined {
  return models?.find(m => m.unitIds?.includes(unit.dbId)) ??
    models?.find(m => m.floorIds?.includes(unit.floorId)) ??
    models?.find(m => m.unitIds?.length === 0 && m.floorIds?.length === 0);
}
