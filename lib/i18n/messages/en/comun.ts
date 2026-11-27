import type { comun as es } from '../es/comun';

export const comun: Record<keyof typeof es, string> = {
  'nav.unidades': 'Units',
  'nav.proyecto': 'Project',
  'nav.amenities': 'Amenities',
  'nav.ubicacion': 'Location',
  'nav.fachada': 'Facade',
  'nav.recorrido360': '360° Tour',
  'nav.plantas': 'Floor plans',
  'nav.explorar3d': 'Explore 3D',
  'nav.espaciosComunes_one': '{count} shared space',
  'nav.espaciosComunes_other': '{count} shared spaces',

  'unidades.disponibles_one': '{count} available',
  'unidades.disponibles_other': '{count} available',

  'comun.linkCopiado': 'Link copied to clipboard',

  'chat.saludoConNombre': "Hi! I'm {nombre}, the project's virtual assistant. How can I help you?",
};
