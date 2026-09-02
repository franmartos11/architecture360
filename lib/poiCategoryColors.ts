import type { PoiCategory } from '@/types';

// Colores de pin por categoría — reutiliza tonos que ya existen en el
// resto del admin (brand, y los semánticos de TourEditor/LotsEditor) en
// vez de inventar una paleta nueva. Import liviano (sin leaflet) para que
// tanto el mapa dinámico como los chips/badges del editor lo puedan usar.
export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  colegio: '#2563eb',
  salud: '#ef4444',
  comercio: '#f59e0b',
  transporte: '#647a6d',
  entretenimiento: '#10b981',
  otro: '#6b7280',
};
