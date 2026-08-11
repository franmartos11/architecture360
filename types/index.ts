// ─── Unit availability status ──────────────────────────────────────
export type UnitStatus = 'available' | 'reserved' | 'sold';

// ─── View tabs inside unit ─────────────────────────────────────────
export type UnitViewTab = 'planta3d' | 'tour360' | 'plano' | 'galeria';

// ─── Unit type ─────────────────────────────────────────────────────
export type UnitType = 'monoambiente' | '1 dormitorio' | '2 dormitorios' | '3 dormitorios' | 'penthouse';

// ─── Tour 360 Types ────────────────────────────────────────────────
export interface TourLinkHotspot {
  yaw: number;
  pitch: number;
  targetNodeId: string;
  targetYaw?: number;
  targetPitch?: number;
  label?: string;
}

export interface TourInfoHotspot {
  yaw: number;
  pitch: number;
  title: string;
  description?: string;
}

export interface TourNode {
  id: string;
  name: string;
  imageUrl: string;
  initialView?: { yaw: number; pitch: number; fov: number };
  linkHotspots?: TourLinkHotspot[];
  infoHotspots?: TourInfoHotspot[];
}

export interface TourData {
  initialNodeId: string;
  nodes: TourNode[];
}

// ─── Hotspot on an aerial image ────────────────────────────────────
export interface AerialHotspot {
  buildingId: string;
  /** Percentage position on the image (0–100) — centro/pin, siempre presente */
  x: number;
  y: number;
  /** Silueta de la torre en la foto (% sobre la imagen) — opcional */
  polygon?: { x: number; y: number }[];
}

// ─── Aerial view slide ─────────────────────────────────────────────
export interface AerialSlide {
  id: string;
  imageUrl: string; // poster/fallback — siempre presente
  videoUrl?: string; // opcional — si está, se reproduce en loop en vez de la foto fija
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

// ─── Room/ambiente dentro de una unidad ────────────────────────────
export interface Room {
  id: string;
  name: string;
  /** Polígono (% sobre el plano de ambientes de la unidad) */
  polygon: { x: number; y: number }[];
  /** Nodo del tour 360° al que salta al seleccionar este ambiente */
  tourNodeId?: string;
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
  orientation?: string; // N, S, E, O
  tourImageUrl?: string;       // 360 equirectangular (legacy, single node)
  tourData?: TourData;         // Multi-node 360 tour data
  floorPlan3dUrl?: string;     // render 3D del edificio/planta
  plan3dUrl?: string;          // esquema 3D técnico de la planta
  technicalPlanUrl?: string;   // plano arquitectónico 2D con rótulos
  interiorImageUrl?: string;   // thumbnail interior photo
  galleryImages?: string[];    // array of interior/exterior image URLs
  polygon?: { x: number; y: number }[]; // optional polygon for masterplan
  roomPlanImage?: string;      // plano de ambientes (para delimitar espacios internos)
  rooms?: Room[];              // ambientes delimitados dentro de la unidad
}

// ─── Building (tower) ──────────────────────────────────────────────
export interface Building {
  id: string;
  name: string;         // e.g. "Torre A", "TREVO"
  floors: Floor[];
  totalFloors: number;
  /** Recorrido 360° exclusivo de esta torre (además del commonAreasTour general) */
  amenitiesTour?: TourData;
}

// ─── Amenity (pileta, gym, SUM, etc.) ───────────────────────────────
export interface Amenity {
  id: string;
  name: string;
  description?: string;
  /** Galería de renders — se muestra como carrusel */
  images: string[];
  /** undefined = amenity de todo el complejo; con valor, exclusiva de esa torre (Building.id) */
  buildingId?: string;
  /**
   * Nodo dentro del tour correspondiente para el botón "Recorrer en 360°":
   * si buildingId está definido, es un nodo de Building.amenitiesTour;
   * si no, es un nodo de Project.commonAreasTour.
   */
  tourNodeId?: string;
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
  amenities: Amenity[];
  /** Recorrido 360° de espacios comunes: pasillos, pileta, parrilla, etc. */
  commonAreasTour?: TourData;
}

// ─── Filter state ──────────────────────────────────────────────────
export interface FloorFilterState {
  status: UnitStatus | 'all';
  type: UnitType | 'all';
}
