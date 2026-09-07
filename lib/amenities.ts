// Categorías sugeridas para agrupar amenities (pileta → "Aire libre", gym →
// "Bienestar", etc.) — libres, no un enum cerrado en la base: esto solo
// alimenta el datalist del editor admin para que no haya que tipear desde
// cero, pero cualquier texto libre es válido.
export const AMENITY_CATEGORY_SUGGESTIONS = [
  'Aire libre',
  'Bienestar',
  'Social',
  'Trabajo',
  'Servicios',
] as const;
