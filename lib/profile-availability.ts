import type { ProfileAvailability } from '@/types';

// Catálogo compartido entre el editor de perfil y el perfil público — para
// que el color/label de cada estado de disponibilidad no se repita suelto
// en dos archivos y quede desincronizado si alguien cambia uno.
export const PROFILE_AVAILABILITY: { key: ProfileAvailability; label: string; color: string }[] = [
  { key: 'open', label: 'Abierto a colaborar', color: '#5c7a58' },
  { key: 'hiring', label: 'Buscando equipo', color: '#c98a5e' },
  { key: 'busy', label: 'Sin disponibilidad', color: 'rgba(28,25,23,.35)' },
];

export function getAvailabilityInfo(availability: ProfileAvailability | undefined) {
  return PROFILE_AVAILABILITY.find(a => a.key === availability) ?? PROFILE_AVAILABILITY[0];
}
