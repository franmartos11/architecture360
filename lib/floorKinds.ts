import type { Locale } from '@/lib/i18n/locales';
import type { FloorKind } from '@/types';

export const FLOOR_KIND_OPTIONS: { value: FloorKind; label: string; icon: string }[] = [
  { value: 'units', label: 'Departamentos', icon: '🏠' },
  { value: 'amenity', label: 'Amenities', icon: '🏊' },
  { value: 'offices', label: 'Oficinas', icon: '🏢' },
  { value: 'technical', label: 'Técnico', icon: '⚙️' },
  { value: 'parking', label: 'Cochera', icon: '🚗' },
  { value: 'other', label: 'Otro', icon: '📍' },
];

const FLOOR_KIND_LABEL_EN: Record<FloorKind, string> = {
  units: 'Apartments', amenity: 'Amenities', offices: 'Offices', technical: 'Technical', parking: 'Parking', other: 'Other',
};

export function floorKindLabel(kind: FloorKind, locale: Locale = 'es'): string {
  return (locale === 'en' ? FLOOR_KIND_LABEL_EN : FLOOR_KIND_LABEL)[kind];
}

export const FLOOR_KIND_LABEL: Record<FloorKind, string> = Object.fromEntries(
  FLOOR_KIND_OPTIONS.map(o => [o.value, o.label])
) as Record<FloorKind, string>;

export const FLOOR_KIND_ICON: Record<FloorKind, string> = Object.fromEntries(
  FLOOR_KIND_OPTIONS.map(o => [o.value, o.icon])
) as Record<FloorKind, string>;
