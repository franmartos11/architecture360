import type { ProjectTypeConfig } from '@/lib/project-types';

// Lo MÍNIMO para que un proyecto se pueda publicar. Es la única fuente de
// verdad: la usan el botón "Publicar" (lo deshabilita y lista lo que falta),
// los avisos del panel y el PATCH de /api/admin/project, que rechaza el
// published:true si algo de esto falta — así no se puede saltear desde
// otra pantalla ni a mano.
//
// Todo lo demás (bajada, descripción, ubicación, precios, amenities…) es
// recomendado: mejora el sitio pero no lo rompe, así que no bloquea.

export interface ReadinessProject {
  name: string;
  masterplanImage?: string | null;
  aerialSlides: unknown[];
  buildings: unknown[];
  units: unknown[];
}

export interface ReadinessItem {
  key: 'name' | 'main_image' | 'units' | 'house';
  label: string;
  ok: boolean;
}

export interface PublishReadiness {
  items: ReadinessItem[];
  /** Labels de lo que falta — vacío cuando se puede publicar. */
  missing: string[];
  canPublish: boolean;
}

type ReadinessTypeConfig = Pick<ProjectTypeConfig, 'hasUnitStep' | 'saleMode' | 'aerialLabel' | 'unitLabel' | 'unitLabelGender'>;

export function getPublishReadiness(project: ReadinessProject, typeConfig: ReadinessTypeConfig): PublishReadiness {
  const items: ReadinessItem[] = [
    { key: 'name', label: 'Nombre', ok: (project.name ?? '').trim().length > 0 },
    {
      // Sin imagen el hero cae a una foto de stock: peor que no publicar.
      key: 'main_image',
      label: `Imagen principal (${typeConfig.aerialLabel.toLowerCase()})`,
      ok: !!project.masterplanImage || (project.aerialSlides?.length ?? 0) > 0,
    },
  ];

  if (typeConfig.hasUnitStep) {
    // Un sitio de venta sin nada a la venta no tiene sentido. En showcase
    // las unidades son opcionales.
    if (typeConfig.saleMode === 'venta') {
      items.push({
        key: 'units',
        label: typeConfig.unitLabelGender === 'f'
          ? `Al menos una ${typeConfig.unitLabel.toLowerCase()} cargada`
          : `Al menos un ${typeConfig.unitLabel.toLowerCase()} cargado`,
        ok: (project.units?.length ?? 0) > 0,
      });
    }
  } else {
    // Casa: el building ES la casa y crea su unidad sola.
    items.push({ key: 'house', label: 'Datos de la casa', ok: (project.buildings?.length ?? 0) > 0 && (project.units?.length ?? 0) > 0 });
  }

  const missing = items.filter(i => !i.ok).map(i => i.label);
  return { items, missing, canPublish: missing.length === 0 };
}

/** "Falta: Nombre, Imagen principal" — para toasts y tooltips. */
export function describeMissing(missing: string[]): string {
  return missing.length === 0 ? '' : `Falta: ${missing.join(', ')}.`;
}
