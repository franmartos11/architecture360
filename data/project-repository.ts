import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { demoProject } from './mockData';
import type { AerialSlide, Amenity, Building, Floor, PointOfInterest, Project, ProjectCollaborator, Unit } from '@/types';
import { hasRoomProgram, roomCounts, allProgramRooms, parseOrientation } from '@/lib/units';
import { getProjectTypeConfig } from '@/lib/project-types';
import type {
  ProjectRow, BuildingRow, FloorRow, UnitRow, AerialSlideRow, AerialHotspotRow, AmenityRow, PointOfInterestRow,
} from '@/types/database';

interface CollaboratorJoinRow {
  contribution: string;
  profile: { handle: string; display_name: string; avatar_image: string | null } | null;
}

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ─── Mapea las filas de Supabase a los tipos que ya consume el sitio ─
function mapProject(
  project: ProjectRow,
  buildingRows: BuildingRow[],
  floorRows: FloorRow[],
  unitRows: UnitRow[],
  slideRows: AerialSlideRow[],
  hotspotRows: AerialHotspotRow[],
  amenityRows: AmenityRow[],
  poiRows: PointOfInterestRow[],
  collaboratorRows: CollaboratorJoinRow[]
): Project {
  const buildingSlugById = new Map(buildingRows.map(b => [b.id, b.slug]));

  // Tipo "casa": el edificio y la unidad SON el proyecto — su nombre real
  // de cara al público es el del proyecto, sin importar con qué nombre se
  // hayan creado en la base (evita "Casa CASA" en migas, títulos, etc.).
  const isSingleUnit = !getProjectTypeConfig(project.project_type, project.sale_mode).hasUnitStep;

  const units: Unit[] = unitRows.map(u => {
    const floor = floorRows.find(f => f.id === u.floor_id)!;
    const building = buildingRows.find(b => b.id === floor.building_id)!;
    // Cuando la unidad tiene un programa de ambientes cargado (rooms con
    // `kind`), esa lista es la fuente de verdad de los conteos — los
    // contadores planos de la fila quedan como dato viejo/de respaldo.
    // Suma todas las plantas (planta baja + levels) para casas de 2+ pisos.
    const allRooms = allProgramRooms(u.rooms, u.levels);
    const program = hasRoomProgram(allRooms);
    const counts = roomCounts(allRooms);
    return {
      id: u.code,
      name: isSingleUnit ? project.name : u.code,
      modelName: u.model_name ?? '',
      buildingId: building.slug,
      floor: floor.number,
      type: u.type,
      totalArea: Number(u.total_area ?? 0),
      innerArea: Number(u.inner_area ?? 0),
      balconyArea: Number(u.balcony_area ?? 0),
      externalArea: Number(u.external_area ?? 0),
      bedrooms: program ? counts.bedrooms : u.bedrooms,
      bathrooms: program ? counts.bathrooms : Number(u.bathrooms),
      hasServiceRoom: u.has_service_room,
      lotSize: u.lot_size != null ? Number(u.lot_size) : undefined,
      ceilingHeight: u.ceiling_height != null ? Number(u.ceiling_height) : undefined,
      garageSpaces: u.garage_spaces,
      garageType: u.garage_type ?? undefined,
      garageCovered: u.garage_covered ?? undefined,
      garageUncovered: u.garage_uncovered ?? undefined,
      condition: u.condition ?? undefined,
      features: u.features?.length ? u.features : undefined,
      livingRooms: program ? counts.living : u.living_rooms,
      kitchens: program ? counts.kitchen : u.kitchens,
      otherRoomsCount: program ? counts.other : u.other_rooms_count,
      otherRoomsDescription: u.other_rooms_description ?? undefined,
      hoaFee: u.hoa_fee != null ? Number(u.hoa_fee) : undefined,
      floorsCount: u.floors_count ?? 1,
      price: u.price != null ? Number(u.price) : undefined,
      currency: u.currency ?? undefined,
      status: u.status,
      orientation: parseOrientation(u.orientation).cardinal,
      orientationDegrees: parseOrientation(u.orientation).degrees,
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
      levels: u.levels ?? undefined,
    };
  });

  const buildings: Building[] = buildingRows.map(b => ({
    id: b.slug,
    name: isSingleUnit ? project.name : b.name,
    totalFloors: b.total_floors,
    amenitiesTour: b.amenities_tour ?? undefined,
    coverImage: b.cover_image ?? undefined,
    tourOrientationDegrees: b.tour_orientation_degrees ?? undefined,
    floors: floorRows
      .filter(f => f.building_id === b.id)
      .sort((a, c) => a.number - c.number)
      .map((f): Floor => ({
        number: f.number,
        label: f.label,
        planImage: f.plan_image ?? '',
        unitDots: f.unit_dots ?? [],
        floorKind: f.floor_kind ?? 'units',
        floorKindDescription: f.floor_kind_description ?? undefined,
      })),
  }));

  const amenities: Amenity[] = amenityRows
    .filter(a => a.visible)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(a => ({
      id: a.id,
      name: a.name,
      description: a.description ?? undefined,
      images: a.images ?? [],
      buildingId: a.building_id ? buildingSlugById.get(a.building_id) : undefined,
      tourNodeId: a.tour_node_id ?? undefined,
      tour3dUrl: a.tour_3d_url ?? undefined,
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

  const collaborators: ProjectCollaborator[] = collaboratorRows
    .filter(c => c.profile)
    .map(c => ({
      handle: c.profile!.handle,
      displayName: c.profile!.display_name,
      avatarImage: c.profile!.avatar_image ?? undefined,
      contribution: c.contribution,
    }));

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? '',
    tagline: project.tagline ?? undefined,
    sectionConfig: project.section_config ?? undefined,
    themeConfig: project.theme_config ?? undefined,
    location: project.location ?? '',
    latitude: project.latitude != null ? Number(project.latitude) : undefined,
    longitude: project.longitude != null ? Number(project.longitude) : undefined,
    masterplanImage: project.masterplan_image ?? '',
    projectType: project.project_type,
    saleMode: project.sale_mode,
    academicInstitution: project.academic_institution ?? undefined,
    academicCareer: project.academic_career ?? undefined,
    academicTutor: project.academic_tutor ?? undefined,
    academicYear: project.academic_year ?? undefined,
    academicTeam: project.academic_team ?? undefined,
    processGallery: project.process_gallery ?? [],
    beforeAfter: project.before_after ?? [],
    collaborators,
    aerialSlides,
    buildings,
    units,
    amenities,
    pointsOfInterest,
    commonAreasTour: project.common_areas_tour ?? undefined,
    tourOrientationDegrees: project.tour_orientation_degrees ?? undefined,
  };
}

export const getProjectBySlug = cache(async (slug: string): Promise<Project | undefined> => {
  if (!SUPABASE_CONFIGURED) {
    return slug === demoProject.slug ? demoProject : undefined;
  }

  const supabase = await createClient();

  const { data: project } = await supabase.from('projects').select('*').eq('slug', slug).maybeSingle();
  if (!project) return undefined;

  // Todo lo que solo depende de project.id se pide en paralelo — buildings→floors→units
  // y slides→hotspots son las únicas cadenas de dependencia reales acá adentro.
  const [buildingsResult, { slides, hotspots }, amenities, pointsOfInterest, collaborators] = await Promise.all([
    supabase.from('buildings').select('*').eq('project_id', project.id),
    (async () => {
      const { data: slideRows } = await supabase
        .from('aerial_slides')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order');
      const slides = (slideRows ?? []) as AerialSlideRow[];

      const { data: hotspotRows } = slides.length
        ? await supabase.from('aerial_hotspots').select('*').in('slide_id', slides.map(s => s.id))
        : { data: [] };
      return { slides, hotspots: (hotspotRows ?? []) as AerialHotspotRow[] };
    })(),
    supabase
      .from('amenities')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order')
      .then(({ data }) => (data ?? []) as AmenityRow[]),
    supabase
      .from('points_of_interest')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order')
      .then(({ data }) => (data ?? []) as PointOfInterestRow[]),
    supabase
      .from('project_collaborators')
      .select('contribution, profile:profiles(handle, display_name, avatar_image)')
      .eq('project_id', project.id)
      .eq('status', 'accepted')
      .then(({ data }) => (data ?? []) as unknown as CollaboratorJoinRow[]),
  ]);
  const buildings = (buildingsResult.data ?? []) as BuildingRow[];

  const { data: floorRows } = buildings.length
    ? await supabase.from('floors').select('*').in('building_id', buildings.map(b => b.id))
    : { data: [] };
  const floors = (floorRows ?? []) as FloorRow[];

  const { data: unitRows } = floors.length
    ? await supabase.from('units').select('*').in('floor_id', floors.map(f => f.id))
    : { data: [] };
  const units = (unitRows ?? []) as UnitRow[];

  return mapProject(project as ProjectRow, buildings, floors, units, slides, hotspots, amenities, pointsOfInterest, collaborators);
});

export const getBuildingById = cache(async (slug: string, buildingId: string): Promise<Building | undefined> => {
  const project = await getProjectBySlug(slug);
  return project?.buildings.find(b => b.id === buildingId);
});

export const getUnitById = cache(async (slug: string, unitId: string): Promise<Unit | undefined> => {
  const project = await getProjectBySlug(slug);
  return project?.units.find(u => u.id === unitId);
});
