// Estado de filtros de la lista de unidades, serializado a query string para
// que un listado filtrado sea una dirección a la que se puede volver (y que
// se puede compartir). Sólo se serializa lo que cambia el conjunto de
// resultados — el estado puramente visual (vista grid/tabla, panel avanzado
// abierto, selección del comparador) se queda en memoria a propósito.
export interface UnitFilters {
  edificio: string;
  tipo: string;
  estado: string;
  precioMax: number;
  m2Min: number;
  favs: boolean;
  feats: string[];
  orden: string;
}

export const DEFAULT_UNIT_FILTERS: UnitFilters = {
  edificio: 'all',
  tipo: 'all',
  estado: 'all',
  precioMax: 0,
  m2Min: 0,
  favs: false,
  feats: [],
  orden: 'piso',
};

export function filtersToQuery(filters: UnitFilters): string {
  const params = new URLSearchParams();
  if (filters.edificio !== DEFAULT_UNIT_FILTERS.edificio) params.set('edificio', filters.edificio);
  if (filters.tipo !== DEFAULT_UNIT_FILTERS.tipo) params.set('tipo', filters.tipo);
  if (filters.estado !== DEFAULT_UNIT_FILTERS.estado) params.set('estado', filters.estado);
  if (filters.precioMax > 0) params.set('precioMax', String(filters.precioMax));
  if (filters.m2Min > 0) params.set('m2Min', String(filters.m2Min));
  if (filters.favs) params.set('favs', '1');
  if (filters.feats.length > 0) params.set('feats', filters.feats.join(','));
  if (filters.orden !== DEFAULT_UNIT_FILTERS.orden) params.set('orden', filters.orden);
  return params.toString();
}

export function filtersFromQuery(params: URLSearchParams): UnitFilters {
  const num = (key: string) => {
    const parsed = Number(params.get(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const feats = params.get('feats');
  return {
    edificio: params.get('edificio') || DEFAULT_UNIT_FILTERS.edificio,
    tipo: params.get('tipo') || DEFAULT_UNIT_FILTERS.tipo,
    estado: params.get('estado') || DEFAULT_UNIT_FILTERS.estado,
    precioMax: num('precioMax'),
    m2Min: num('m2Min'),
    favs: params.get('favs') === '1',
    feats: feats ? feats.split(',').filter(Boolean) : [],
    orden: params.get('orden') || DEFAULT_UNIT_FILTERS.orden,
  };
}
