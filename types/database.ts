// ─── Filas crudas de Supabase (snake_case) ──────────────────────────
// Fuente única de verdad para las tablas del schema (ver supabase/schema.sql).
// Antes cada pantalla de admin + data/project-repository.ts declaraba su
// propia copia a mano de estas mismas interfaces — un rename de columna
// obligaba a cazar N archivos. Las páginas que solo necesitan un
// subconjunto de columnas usan `Pick<...>` sobre estos tipos completos.
import type { UnitType, UnitStatus, PoiCategory, TourData, Room } from './index';

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  masterplan_image: string | null;
  amenities: string[];
  common_areas_tour: TourData | null;
  created_at: string;
  updated_at: string;
}

export interface BuildingRow {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  total_floors: number;
  amenities_tour: TourData | null;
  cover_image: string | null;
  created_at: string;
}

export interface FloorRow {
  id: string;
  building_id: string;
  number: number;
  label: string;
  plan_image: string | null;
  unit_dots: { unitId: string; x: number; y: number }[];
  created_at: string;
}

export interface UnitRow {
  id: string;
  floor_id: string;
  code: string;
  model_name: string | null;
  type: UnitType;
  total_area: number | null;
  inner_area: number | null;
  balcony_area: number;
  external_area: number;
  bedrooms: number;
  bathrooms: number;
  has_service_room: boolean;
  price: number | null;
  status: UnitStatus;
  orientation: string | null;
  interior_image_url: string | null;
  gallery_images: string[];
  floor_plan_3d_url: string | null;
  plan_3d_url: string | null;
  technical_plan_url: string | null;
  room_plan_image: string | null;
  polygon: { x: number; y: number }[] | null;
  rooms: Room[] | null;
  tour_image_url: string | null;
  tour_data: TourData | null;
  created_at: string;
  updated_at: string;
}

export interface AerialSlideRow {
  id: string;
  project_id: string;
  image_url: string;
  video_url: string | null;
  label: string;
  sort_order: number;
}

export interface AerialHotspotRow {
  id: string;
  slide_id: string;
  building_id: string;
  x: number;
  y: number;
  polygon: { x: number; y: number }[] | null;
}

export interface AmenityRow {
  id: string;
  project_id: string;
  building_id: string | null;
  name: string;
  description: string | null;
  images: string[];
  tour_node_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface PointOfInterestRow {
  id: string;
  project_id: string;
  name: string;
  category: PoiCategory;
  description: string | null;
  distance_label: string | null;
  image: string | null;
  latitude: number | null;
  longitude: number | null;
  walk_minutes: number | null;
  drive_minutes: number | null;
  bike_minutes: number | null;
  sort_order: number;
  created_at: string;
}
