import type { ProjectTypeConfig } from '@/lib/project-types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import { getTourStats } from '@/lib/tour-stats';

export type UnitGroupStatus = 'complete' | 'partial' | 'empty';

export interface UnitGroupNavItem {
  key: string;
  label: string;
  /** Segmento de ruta bajo .../unidades/[unitId]/ */
  slug: string;
  applies: (tc: ProjectTypeConfig) => boolean;
  status: (unit: DbUnitRow, tc: ProjectTypeConfig) => UnitGroupStatus;
}

// Orden = orden del menú lateral del shell (layout.tsx). "Imágenes" usa el
// slug histórico "fotos" (la ruta ya existía antes del shell) para no
// romper el link que UnitsEditor ya tenía guardado.
export const UNIT_GROUP_NAV: UnitGroupNavItem[] = [
  {
    key: 'datos', label: 'Datos', slug: 'datos',
    applies: () => true,
    status: (u, tc) => {
      if (tc.unitIsLand) return u.total_area != null ? 'complete' : 'empty';
      if (!u.model_name && !u.type) return 'empty';
      return (u.orientation && u.bedrooms > 0) ? 'complete' : 'partial';
    },
  },
  {
    key: 'superficies', label: 'Superficies', slug: 'superficies',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => {
      if (u.total_area == null) return 'empty';
      return u.inner_area != null ? 'complete' : 'partial';
    },
  },
  {
    key: 'comercial', label: 'Comercial', slug: 'comercial',
    applies: (tc) => tc.showPrice || tc.showStatus,
    status: (u) => (u.price != null ? 'complete' : 'empty'),
  },
  {
    key: 'imagenes', label: 'Imágenes', slug: 'fotos',
    applies: () => true,
    status: (u) => {
      const hasMain = !!u.interior_image_url;
      const hasGallery = (u.gallery_images ?? []).length > 0;
      if (!hasMain && !hasGallery) return 'empty';
      return hasMain && hasGallery ? 'complete' : 'partial';
    },
  },
  {
    key: 'planos', label: 'Planos', slug: 'planos',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => {
      const count = [u.floor_plan_3d_url, u.plan_3d_url, u.technical_plan_url].filter(Boolean).length;
      if (count === 0) return 'empty';
      return count === 3 ? 'complete' : 'partial';
    },
  },
  {
    key: 'ambientes', label: 'Ambientes', slug: 'ambientes',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => ((u.rooms ?? []).length > 0 ? 'complete' : 'empty'),
  },
  {
    key: 'tour', label: 'Recorrido 360°', slug: 'tour',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => {
      const { nodeCount, orphanCount, hasStart } = getTourStats(u.tour_data);
      if (nodeCount === 0) return 'empty';
      return (orphanCount === 0 && hasStart) ? 'complete' : 'partial';
    },
  },
];
