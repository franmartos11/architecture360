// ─── Filas crudas de Supabase (snake_case) ──────────────────────────
// Fuente única de verdad para las tablas del schema (ver supabase/schema.sql).
// Antes cada pantalla de admin + data/project-repository.ts declaraba su
// propia copia a mano de estas mismas interfaces — un rename de columna
// obligaba a cazar N archivos. Las páginas que solo necesitan un
// subconjunto de columnas usan `Pick<...>` sobre estos tipos completos.
import type { UnitType, UnitStatus, PoiCategory, TourData, Room, UnitLevel, ProjectType, ProjectSaleMode, BeforeAfterPair, ProfileExperience, ProfileEducation, ProfileCertification, ProfileAward, ProfileSkill, ProfileAvailability, ThemeConfig } from './index';

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string | null;
  section_config: { key: string; enabled: boolean }[];
  theme_config: ThemeConfig;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  masterplan_image: string | null;
  amenities: string[];
  common_areas_tour: TourData | null;
  tour_orientation_degrees: number | null;
  owner_id: string;
  project_type: ProjectType;
  sale_mode: ProjectSaleMode;
  academic_institution: string | null;
  academic_career: string | null;
  academic_tutor: string | null;
  academic_year: string | null;
  academic_team: string | null;
  process_gallery: string[];
  before_after: BeforeAfterPair[];
  show_in_portfolio: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PostRow {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_image: string | null;
  banner_image: string | null;
  account_type: 'person' | 'company';
  location: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  website_url: string | null;
  headline: string | null;
  license: string | null;
  availability: ProfileAvailability;
  specialties: string[];
  languages: string[];
  skills: ProfileSkill[];
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  certifications: ProfileCertification[];
  awards: ProfileAward[];
  is_public: boolean;
  show_contact: boolean;
  is_indexed: boolean;
  featured_project_id: string | null;
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
  tour_orientation_degrees: number | null;
  created_at: string;
}

export type FloorKind = 'units' | 'amenity' | 'offices' | 'technical' | 'parking' | 'other';

export interface FloorRow {
  id: string;
  building_id: string;
  number: number;
  label: string;
  plan_image: string | null;
  unit_dots: { unitId: string; x: number; y: number; color?: string; style?: 'pill' | 'dot' }[];
  floor_kind: FloorKind;
  floor_kind_description: string | null;
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
  lot_size: number | null;
  ceiling_height: number | null;
  garage_spaces: number;
  garage_type: 'cubierta' | 'descubierta' | null;
  garage_covered: number;
  garage_uncovered: number;
  condition: 'a_estrenar' | 'en_construccion' | 'en_pozo' | 'usada' | null;
  features: string[];
  living_rooms: number;
  kitchens: number;
  other_rooms_count: number;
  other_rooms_description: string | null;
  hoa_fee: number | null;
  floors_count: number;
  price: number | null;
  currency: string;
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
  levels: UnitLevel[] | null;
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
  tour_3d_url: string | null;
  sort_order: number;
  visible: boolean;
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

// Cuenta-scoped (owner_id), no project-scoped — reusables entre todos
// los proyectos de un mismo dueño. Ver supabase/schema.sql.
export interface FontRow {
  id: string;
  owner_id: string;
  name: string;
  file_url: string;
  format: string;
  created_at: string;
}

export interface SavedThemeRow {
  id: string;
  owner_id: string;
  name: string;
  config: ThemeConfig;
  created_at: string;
}
