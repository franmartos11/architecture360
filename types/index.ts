// ─── Unit availability status ──────────────────────────────────────
export type UnitStatus = 'available' | 'reserved' | 'sold';

// ─── View tabs inside unit ─────────────────────────────────────────
export type UnitViewTab = 'planta3d' | 'tour360' | 'plano' | 'galeria';

// ─── Unit type ─────────────────────────────────────────────────────
export type UnitType = 'monoambiente' | '1 dormitorio' | '2 dormitorios' | '3 dormitorios' | 'penthouse';

// ─── Hotspot on an aerial image ────────────────────────────────────
export interface AerialHotspot {
  buildingId: string;
  /** Percentage position on the image (0–100) */
  x: number;
  y: number;
}

// ─── Aerial view slide ─────────────────────────────────────────────
export interface AerialSlide {
  id: string;
  imageUrl: string;
  label: string; // e.g. "Vista Norte"
  hotspots: AerialHotspot[];
}

// ─── Unit dot on a floor plan ──────────────────────────────────────
export interface UnitDot {
  unitId: string;
  /** Percentage position on the floor plan image */
  x: number;
  y: number;
}

// ─── Floor ─────────────────────────────────────────────────────────
export interface Floor {
  number: number;
  label: string;        // e.g. "Planta 1", "L" for lobby
  planImage: string;    // floor plan image URL
  unitDots: UnitDot[];
}

// ─── Real estate unit ──────────────────────────────────────────────
export interface Unit {
  id: string;
  name: string;         // e.g. "N01-07"
  modelName: string;    // e.g. "DUET 106 JARDIN"
  buildingId: string;
  floor: number;
  type: UnitType;
  totalArea: number;    // m²
  innerArea: number;    // m²
  balconyArea: number;  // m²
  externalArea: number; // m²
  bedrooms: number;
  bathrooms: number;
  hasServiceRoom: boolean;
  price?: number;       // USD — undefined means "consultar precio"
  status: UnitStatus;
  tourImageUrl?: string;       // 360 equirectangular
  floorPlan3dUrl?: string;     // 3D floor plan render
  technicalPlanUrl?: string;   // architectural plan image
  interiorImageUrl?: string;   // thumbnail interior photo
  galleryImages?: string[];    // array of interior/exterior image URLs
  polygon?: { x: number; y: number }[]; // optional polygon for masterplan
}

// ─── Building (tower) ──────────────────────────────────────────────
export interface Building {
  id: string;
  name: string;         // e.g. "Torre A", "TREVO"
  floors: Floor[];
  totalFloors: number;
}

// ─── Project ───────────────────────────────────────────────────────
export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  location: string;
  masterplanImage: string;
  aerialSlides: AerialSlide[];
  buildings: Building[];
  units: Unit[];
  amenities: string[];
}

// ─── Filter state ──────────────────────────────────────────────────
export interface FloorFilterState {
  status: UnitStatus | 'all';
  type: UnitType | 'all';
}
