// ─── Unit availability status ──────────────────────────────────────
export type UnitStatus = 'available' | 'reserved' | 'sold';

// ─── Tipo de proyecto: forma + propósito ─────────────────────────────
// Dos preguntas independientes, no una — ver comentario largo en
// lib/project-types.ts. ProjectType es la FORMA del desarrollo (define
// la jerarquía y cómo se llama todo); ProjectSaleMode es para QUÉ es
// (define qué secciones de venta se muestran). Cualquier forma puede
// combinarse con cualquier propósito — un loteo puramente ilustrativo
// es tan válido como un edificio en venta.
export type ProjectType = 'edificio' | 'loteo' | 'duplex' | 'casa' | 'unico';
export type ProjectSaleMode = 'venta' | 'showcase';

// ─── View tabs inside unit ─────────────────────────────────────────
export type UnitViewTab = 'planta3d' | 'tour360' | 'plano' | 'galeria' | 'amenities' | 'ubicacion';

// ─── Unit type ─────────────────────────────────────────────────────
// Categorías estándar de aviso — las que ofrece el dropdown para
// departamentos.
export type KnownUnitType = 'monoambiente' | '1 dormitorio' | '2 dormitorios' | '3 dormitorios' | 'penthouse';
// El valor guardado es texto libre: una casa NO elige de una lista, deriva
// su tipología de la cantidad de dormitorios (ver deriveUnitType en
// lib/units.ts) y puede tener 4, 5, 6+. El union laxo mantiene el
// autocompletado de las categorías conocidas sin cerrar la puerta al resto.
export type UnitType = KnownUnitType | (string & {});

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
  /** Cartel corto opcional que aparece en el visor público al entrar a este ambiente. */
  note?: string;
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
  /** Color del marcador — si no está, se usa el color de estado (disponible/reservado/vendido) */
  color?: string;
  /** "pill" (pastilla con el nombre, default) o "dot" (punto simple sin texto) */
  style?: 'pill' | 'dot';
}

// ─── Room/ambiente dentro de una unidad ────────────────────────────
// Un ambiente puede existir SIN polígono: el "programa de ambientes" de una
// casa (nombre + tipo + m² + orientación + características de cada uno) se
// carga en el form de datos, sin plano. El paso de delimitación le agrega
// el polígono después, sobre la misma lista.
export type RoomKind =
  | 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining'
  | 'studio' | 'laundry' | 'storage' | 'other';

export interface Room {
  id: string;
  name: string;
  /** Polígono (% sobre el plano de ambientes de la unidad) — ausente/vacío = ambiente sin delimitar. */
  polygon?: { x: number; y: number }[];
  /** Nodo del tour 360° al que salta al seleccionar este ambiente */
  tourNodeId?: string;
  /** Qué tipo de ambiente es — de acá se derivan los conteos (dormitorios, baños). */
  kind?: RoomKind;
  /** Superficie del ambiente en m². */
  area?: number;
  /** Características, según el tipo de ambiente — ver ROOM_FEATURES_BY_KIND. */
  features?: string[];
  /** Nota libre sobre el ambiente. */
  notes?: string;
  /** Foto principal del ambiente (la que se ve chica en la lista). */
  imageUrl?: string;
  /** Fotos adicionales del ambiente — se ven en el visor al abrir la foto grande. */
  images?: string[];
}

// ─── Nivel adicional de una casa de 2+ plantas ──────────────────────
// La planta baja de una unidad sigue viviendo en roomPlanImage/rooms (igual
// que siempre, para no migrar datos existentes) — "levels" solo guarda las
// plantas de más, una por cada nivel arriba de floorsCount - 1.
export interface UnitLevel {
  id: string;
  label: string;                          // ej. "Piso 1", "Piso 2"
  planImage: string | null;
  /** Render / planta 3D de esta planta. El de la planta baja vive en
   *  unit.floorPlan3dUrl (no se migra el dato existente). */
  plan3dImage?: string | null;
  rooms: Room[];
}

// ─── Floor ─────────────────────────────────────────────────────────
export type FloorKind = 'units' | 'amenity' | 'offices' | 'technical' | 'parking' | 'other';

export interface Floor {
  number: number;
  label: string;        // e.g. "Planta 1", "L" for lobby
  planImage: string;    // floor plan image URL
  unitDots: UnitDot[];
  /** Vocación del piso — ausente o 'units' es un piso residencial normal. */
  floorKind?: FloorKind;
  /** Texto libre para floorKind !== 'units', ej. "Pileta y solárium". */
  floorKindDescription?: string;
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
  lotSize?: number;      // superficie de terreno (m²) — solo aplica a casa
  ceilingHeight?: number;      // altura de techo (m) — solo aplica a casa
  garageSpaces?: number;       // total de cocheras (= cubiertas + descubiertas) — undefined/0 = sin cochera
  garageType?: 'cubierta' | 'descubierta';
  garageCovered?: number;      // cocheras cubiertas — solo casa
  garageUncovered?: number;    // cocheras descubiertas — solo casa
  condition?: 'a_estrenar' | 'en_construccion' | 'en_pozo' | 'usada';  // estado/antigüedad — solo casa
  features?: string[];         // comodidades (pileta, quincho, losa radiante, amoblada, apto crédito…) — solo casa
  livingRooms?: number;        // cantidad de livings — solo aplica a casa
  kitchens?: number;           // cantidad de cocinas — solo aplica a casa
  otherRoomsCount?: number;    // otros ambientes (lavadero, depósito, etc.) — solo casa
  otherRoomsDescription?: string;
  hoaFee?: number;       // expensas mensuales — solo aplica a casa en barrio privado
  floorsCount?: number;  // cantidad de plantas de la casa — undefined se trata como 1
  price?: number;        // undefined means "consultar precio"
  currency?: string;     // ISO 4217, ej. "USD" — undefined se trata como "USD"
  status: UnitStatus;
  /** Cardinal hacia donde mira la unidad (derivado de orientationDegrees), ej. "NE". */
  orientation?: string;
  /** Grados (0-359) hacia donde mira la unidad — se carga con la brújula del paso Datos. */
  orientationDegrees?: number;
  tourImageUrl?: string;       // 360 equirectangular (legacy, single node)
  tourData?: TourData;         // Multi-node 360 tour data
  floorPlan3dUrl?: string;     // render 3D del edificio/planta
  plan3dUrl?: string;          // esquema 3D técnico de la planta
  technicalPlanUrl?: string;   // plano arquitectónico 2D con rótulos
  interiorImageUrl?: string;   // thumbnail interior photo
  galleryImages?: string[];    // array of interior/exterior image URLs
  polygon?: { x: number; y: number }[]; // optional polygon for masterplan
  roomPlanImage?: string;      // plano de ambientes de la planta baja/única
  rooms?: Room[];              // ambientes delimitados de la planta baja/única
  levels?: UnitLevel[];        // plantas adicionales (casa de 2+ niveles) — ver floorsCount
}

// ─── Building (tower) ──────────────────────────────────────────────
export interface Building {
  id: string;
  name: string;         // e.g. "Torre A", "TREVO"
  floors: Floor[];
  totalFloors: number;
  /** Recorrido 360° exclusivo de esta torre (además del commonAreasTour general) */
  amenitiesTour?: TourData;
  coverImage?: string;
  /** Grados (0-359, horario) desde el norte real hacia donde apunta yaw=0 de amenitiesTour — undefined = sin calibrar */
  tourOrientationDegrees?: number;
}

// ─── Amenity (pileta, gym, SUM, etc.) ───────────────────────────────
export interface Amenity {
  id: string;
  name: string;
  description?: string;
  /** Galería de renders — la primera es la foto de la fila en la landing */
  images: string[];
  /** undefined = amenity de todo el complejo; con valor, exclusiva de esa torre (Building.id) */
  buildingId?: string;
  /**
   * Nodo dentro del tour correspondiente para el botón "Recorrer en 360°":
   * si buildingId está definido, es un nodo de Building.amenitiesTour;
   * si no, es un nodo de Project.commonAreasTour.
   */
  tourNodeId?: string;
  /** Link a un recorrido 3D externo (ej. Matterport) para el botón "Ver recorrido 3D". */
  tour3dUrl?: string;
}

// ─── Point of interest (colegio, salud, comercio, etc.) ─────────────
export type PoiCategory = 'colegio' | 'salud' | 'comercio' | 'transporte' | 'entretenimiento' | 'otro';

export interface PointOfInterest {
  id: string;
  name: string;
  category: PoiCategory;
  description?: string;
  distanceLabel?: string; // ej. "5 min caminando"
  image?: string;
  latitude?: number;
  longitude?: number;
  /** Tiempos de viaje calculados via Distance Matrix API (en minutos) */
  walkMinutes?: number;
  driveMinutes?: number;
  bikeMinutes?: number;
}

// ─── Antes / Después (reciclaje, rehabilitación) ─────────────────────
export interface BeforeAfterPair {
  label: string;
  beforeImage: string;
  afterImage: string;
}

// Overrides de color puntuales sobre los tokens del preset elegido — ver
// ThemePreset['tokens'] en lib/theme-presets.ts (mismas keys, todas
// opcionales acá: lo que no se pisa sigue viniendo del preset).
export interface ThemeColorOverrides {
  bg?: string;
  bgAlt?: string;
  bgAccent?: string;
  surface?: string;
  text?: string;
  textOnDark?: string;
  accent?: string;
}

// Tema visual de la landing — ver lib/theme-presets.ts. Vacío/sin
// presetKey = preset "natural" (el look de siempre). headingFont/bodyFont
// son una key de lib/fonts.ts (curada) o "custom:<fontId>" (ver tabla
// `fonts`, cuenta-scoped — reusable entre proyectos del mismo dueño).
// customColors pisa colores puntuales del preset; backgroundImageUrl es
// el fondo de pantalla general del sitio (no confundir con la foto de
// fondo del hero, que es aparte — ver PortadaEditor).
export interface ThemeConfig {
  presetKey?: string;
  headingFont?: string;
  bodyFont?: string;
  customColors?: ThemeColorOverrides;
  backgroundImageUrl?: string;
  /** Pisa el radio de esquinas del preset — mismo formato que ThemePreset.tokens.radius (valor CSS, ej. '0px'). */
  radius?: string;
}

export interface CustomFont {
  id: string;
  name: string;
  fileUrl: string;
  format: string;
}

export interface SavedTheme {
  id: string;
  name: string;
  config: ThemeConfig;
}

// ─── Colaborador acreditado en un proyecto (crédito confirmado) ──────
export interface ProjectCollaborator {
  handle: string;
  displayName: string;
  avatarImage?: string;
  contribution: string;
}

// ─── Post del feed ────────────────────────────────────────────────────
// Publicar requiere tener perfil — por eso el autor siempre tiene
// handle/displayName, a diferencia de un comentario de proyecto.
export interface Post {
  id: string;
  body: string;
  imageUrl?: string;
  createdAt: string;
  author: {
    handle: string;
    displayName: string;
    avatarImage?: string;
  };
}

export type ProfileAccountType = 'person' | 'company';

// ─── Secciones de perfil profesional ─────────────────────────────────
export interface ProfileExperience {
  company: string;
  role: string;
  startYear: string;
  /** Vacío o undefined = "Presente" */
  endYear?: string;
  description?: string;
}

export interface ProfileEducation {
  institution: string;
  career: string;
  startYear: string;
  endYear?: string;
}

export interface ProfileCertification {
  name: string;
  issuer: string;
  year: string;
  url?: string;
  imageUrl?: string;
}

// ─── Perfil público (portfolio con varios proyectos agrupados) ───────
// Opt-in — no toda cuenta tiene uno. Se crea recién cuando el usuario
// define su handle en /admin/portfolio.
export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  accountType: 'person' | 'company';
  bio: string | null;
  avatarImage: string | null;
  bannerImage: string | null;
  location: string | null;
  contactEmail?: string;
  whatsapp?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  /** Aptitudes / habilidades — badges en el perfil público */
  skills?: string[];
  /** Solo para account_type='person' */
  experiences?: ProfileExperience[];
  /** Solo para account_type='person' */
  education?: ProfileEducation[];
  /** Solo para account_type='person' */
  certifications?: ProfileCertification[];
}

// Fila liviana para /directorio — no la ficha completa de Profile,
// solo lo que hace falta para una tarjeta de búsqueda.
export interface DirectoryProfile {
  id: string;
  handle: string;
  displayName: string;
  accountType: ProfileAccountType;
  avatarImage?: string;
  bio?: string;
  location?: string;
  projectCount: number;
}

// Proyecto tal como aparece listado dentro de un portfolio — un
// subconjunto liviano de Project, no la ficha completa (no hace falta
// nada de edificios/unidades/tours para una tarjeta en una grilla).
export interface PortfolioProjectSummary {
  slug: string;
  name: string;
  description: string;
  masterplanImage: string;
  projectType: ProjectType;
  academicYear?: string;
}

// ─── Project ───────────────────────────────────────────────────────
export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Bajada corta del hero — distinta de `description` (el texto largo de "Sobre el proyecto"). */
  tagline?: string;
  /** Orden/habilitación de las secciones de la landing — ver lib/project-sections.ts. Vacío = orden por defecto. */
  sectionConfig?: { key: string; enabled: boolean }[];
  /** Paleta/tipografía de la landing — ver lib/theme-presets.ts. Vacío = preset "natural". */
  themeConfig?: ThemeConfig;
  location: string;
  /** Coordenadas para centrar el mapa de la sección Ubicación */
  latitude?: number;
  longitude?: number;
  masterplanImage: string;
  projectType: ProjectType;
  saleMode: ProjectSaleMode;
  /** Ficha académica — solo tiene sentido (y solo se completa) en proyectos showcase. */
  academicInstitution?: string;
  academicCareer?: string;
  academicTutor?: string;
  academicYear?: string;
  academicTeam?: string;
  /** Bocetos, maquetas, diagramas — aparte de las fotos finales. */
  processGallery: string[];
  /** Pares antes/después — para reciclaje o rehabilitación. */
  beforeAfter: BeforeAfterPair[];
  /** Créditos confirmados — quién trabajó en el proyecto, más allá del dueño. */
  collaborators: ProjectCollaborator[];
  aerialSlides: AerialSlide[];
  buildings: Building[];
  units: Unit[];
  amenities: Amenity[];
  pointsOfInterest: PointOfInterest[];
  /** Recorrido 360° de espacios comunes: pasillos, pileta, parrilla, etc. */
  commonAreasTour?: TourData;
  /** Grados (0-359, horario) desde el norte real hacia donde apunta yaw=0 de commonAreasTour — undefined = sin calibrar */
  tourOrientationDegrees?: number;
}

// ─── Filter state ──────────────────────────────────────────────────
export interface FloorFilterState {
  status: UnitStatus | 'all';
  type: UnitType | 'all';
}

// ─── Lead (contacto capturado desde el sitio público) ───────────────
// Fila cruda de la tabla `leads` de Supabase (snake_case), tal como la
// devuelven /api/admin/leads y /api/admin/leads/[id].
export interface Lead {
  id: string;
  project_id: string | null;
  unit_id: string | null;
  unit_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  method: string | null;
  message: string | null;
  source: string | null;
  status: string;
  created_at: string;
}
