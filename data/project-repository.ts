import { createClient } from '@/lib/supabase/server';
import { demoProject } from './mockData';
import type { AerialHotspot, AerialSlide, Amenity, Building, Floor, PointOfInterest, Project, Unit } from '@/types';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ─── Filas crudas de Supabase (snake_case) ─────────────────────────
interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  masterplan_image: string | null;
  common_areas_tour: Project['commonAreasTour'] | null;
}
interface BuildingRow {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  total_floors: number;
  amenities_tour: Building['amenitiesTour'] | null;
  cover_image: string | null;
}
interface AmenityRow {
  id: string;
  project_id: string;
  building_id: string | null;
  name: string;
  description: string | null;
  images: string[] | null;
  tour_node_id: string | null;
  sort_order: number;
}
interface PointOfInterestRow {
  id: string;
  project_id: string;
  name: string;
  category: PointOfInterest['category'];
  description: string | null;
  distance_label: string | null;
  image: string | null;
  latitude: number | null;
  longitude: number | null;
  walk_minutes: number | null;
  drive_minutes: number | null;
  bike_minutes: number | null;
  sort_order: number;
}
interface FloorRow {
  id: string;
  building_id: string;
  number: number;
  label: string;
  plan_image: string | null;
  unit_dots: Floor['unitDots'] | null;
}
interface UnitRow {
  id: string;
  floor_id: string;
  code: string;
  model_name: string | null;
  type: Unit['type'];
  total_area: number | null;
  inner_area: number | null;
  balcony_area: number;
  external_area: number;
  bedrooms: number;
  bathrooms: number;
  has_service_room: boolean;
  price: number | null;
  status: Unit['status'];
  orientation: string | null;
  interior_image_url: string | null;
  gallery_images: string[] | null;
  floor_plan_3d_url: string | null;
  plan_3d_url: string | null;
  technical_plan_url: string | null;
  room_plan_image: string | null;
  polygon: Unit['polygon'] | null;
  rooms: Unit['rooms'] | null;
  tour_image_url: string | null;
  tour_data: Unit['tourData'] | null;
}
interface AerialSlideRow {
  id: string;
  project_id: string;
  image_url: string;
  video_url: string | null;
  label: string;
  sort_order: number;
}
interface AerialHotspotRow {
  id: string;
  slide_id: string;
  building_id: string;
  x: number;
  y: number;
  polygon: AerialHotspot['polygon'] | null;
}

// ─── Mapea las filas de Supabase a los tipos que ya consume el sitio ─
function mapProject(
  project: ProjectRow,
  buildingRows: BuildingRow[],
  floorRows: FloorRow[],
  unitRows: UnitRow[],
  slideRows: AerialSlideRow[],
  hotspotRows: AerialHotspotRow[],
  amenityRows: AmenityRow[],
  poiRows: PointOfInterestRow[]
): Project {
  const buildingSlugById = new Map(buildingRows.map(b => [b.id, b.slug]));

  const units: Unit[] = unitRows.map(u => {
    const floor = floorRows.find(f => f.id === u.floor_id)!;
    const building = buildingRows.find(b => b.id === floor.building_id)!;
    return {
      id: u.code,
      name: u.code,
      modelName: u.model_name ?? '',
      buildingId: building.slug,
      floor: floor.number,
      type: u.type,
      totalArea: Number(u.total_area ?? 0),
      innerArea: Number(u.inner_area ?? 0),
      balconyArea: Number(u.balcony_area ?? 0),
      externalArea: Number(u.external_area ?? 0),
      bedrooms: u.bedrooms,
      bathrooms: Number(u.bathrooms),
      hasServiceRoom: u.has_service_room,
      price: u.price != null ? Number(u.price) : undefined,
      status: u.status,
      orientation: u.orientation ?? undefined,
      tourImageUrl: u.tour_image_url ?? undefined,
      tourData: u.tour_data ?? undefined,
      floorPlan3dUrl: u.floor_plan_3d_url ?? undefined,
      plan3dUrl: u.plan_3d_url ?? undefined,
      technicalPlanUrl: u.technical_plan_url ?? undefined,
      interiorImageUrl: u.interior_image_url ?? undefined,
      galleryImages: u.gallery_images ?? undefined,
      polygon: u.polygon ?? undefined,
      roomPlanImage: u.room_plan_image ?? undefined,
      rooms: u.rooms ?? undefined,
    };
  });

  const buildings: Building[] = buildingRows.map(b => ({
    id: b.slug,
    name: b.name,
    totalFloors: b.total_floors,
    amenitiesTour: b.amenities_tour ?? undefined,
    coverImage: b.cover_image ?? undefined,
    floors: floorRows
      .filter(f => f.building_id === b.id)
      .sort((a, c) => a.number - c.number)
      .map((f): Floor => ({
        number: f.number,
        label: f.label,
        planImage: f.plan_image ?? '',
        unitDots: f.unit_dots ?? [],
      })),
  }));

  const amenities: Amenity[] = amenityRows
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(a => ({
      id: a.id,
      name: a.name,
      description: a.description ?? undefined,
      images: a.images ?? [],
      buildingId: a.building_id ? buildingSlugById.get(a.building_id) : undefined,
      tourNodeId: a.tour_node_id ?? undefined,
    }));

  const aerialSlides: AerialSlide[] = slideRows
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({
      id: s.id,
      imageUrl: s.image_url,
      videoUrl: s.video_url ?? undefined,
      label: s.label,
      hotspots: hotspotRows
        .filter(h => h.slide_id === s.id)
        .map(h => ({
          buildingId: buildingSlugById.get(h.building_id) ?? '',
          x: Number(h.x),
          y: Number(h.y),
          polygon: h.polygon ?? undefined,
        })),
    }));

  const pointsOfInterest: PointOfInterest[] = poiRows
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description ?? undefined,
      distanceLabel: p.distance_label ?? undefined,
      image: p.image ?? undefined,
      latitude: p.latitude != null ? Number(p.latitude) : undefined,
      longitude: p.longitude != null ? Number(p.longitude) : undefined,
      walkMinutes: p.walk_minutes != null ? Number(p.walk_minutes) : undefined,
      driveMinutes: p.drive_minutes != null ? Number(p.drive_minutes) : undefined,
      bikeMinutes: p.bike_minutes != null ? Number(p.bike_minutes) : undefined,
    }));

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? '',
    location: project.location ?? '',
    latitude: project.latitude != null ? Number(project.latitude) : undefined,
    longitude: project.longitude != null ? Number(project.longitude) : undefined,
    masterplanImage: project.masterplan_image ?? '',
    aerialSlides,
    buildings,
    units,
    amenities,
    pointsOfInterest,
    commonAreasTour: project.common_areas_tour ?? undefined,
  };
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  if (!SUPABASE_CONFIGURED) {
    return slug === demoProject.slug ? demoProject : undefined;
  }

  const supabase = await createClient();

  const { data: project } = await supabase.from('projects').select('*').eq('slug', slug).maybeSingle();
  if (!project) return undefined;

  const { data: buildingRows } = await supabase.from('buildings').select('*').eq('project_id', project.id);
  const buildings = (buildingRows ?? []) as BuildingRow[];

  const { data: floorRows } = buildings.length
    ? await supabase.from('floors').select('*').in('building_id', buildings.map(b => b.id))
    : { data: [] };
  const floors = (floorRows ?? []) as FloorRow[];

  const { data: unitRows } = floors.length
    ? await supabase.from('units').select('*').in('floor_id', floors.map(f => f.id))
    : { data: [] };
  const units = (unitRows ?? []) as UnitRow[];

  const { data: slideRows } = await supabase
    .from('aerial_slides')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');
  const slides = (slideRows ?? []) as AerialSlideRow[];

  const { data: hotspotRows } = slides.length
    ? await supabase.from('aerial_hotspots').select('*').in('slide_id', slides.map(s => s.id))
    : { data: [] };
  const hotspots = (hotspotRows ?? []) as AerialHotspotRow[];

  const { data: amenityRows } = await supabase
    .from('amenities')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');
  const amenities = (amenityRows ?? []) as AmenityRow[];

  const { data: poiRows } = await supabase
    .from('points_of_interest')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order');
  const pointsOfInterest = (poiRows ?? []) as PointOfInterestRow[];

  return mapProject(project as ProjectRow, buildings, floors, units, slides, hotspots, amenities, pointsOfInterest);
}

export async function getBuildingById(slug: string, buildingId: string): Promise<Building | undefined> {
  const project = await getProjectBySlug(slug);
  return project?.buildings.find(b => b.id === buildingId);
}

export async function getUnitById(unitId: string): Promise<Unit | undefined> {
  // Hoy el sitio solo sirve un proyecto ('demo'), igual que en el resto
  // de la app (ver Navbar/homepage, que también lo hardcodean).
  const project = await getProjectBySlug('demo');
  return project?.units.find(u => u.id === unitId);
}
