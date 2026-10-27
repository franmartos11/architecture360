import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromUnit } from '@/lib/supabase/require-project-access';
import { isValidEnum, UNIT_STATUSES, UNIT_CATEGORIES } from '@/lib/validate';
import { sanitizeText } from '@/lib/sanitize';

// Longitud máxima de los campos de texto libre del FIELD_MAP de abajo —
// el resto (números, booleanos, jsonb de polígonos/tour) no pasa por acá.
const TEXT_FIELD_MAX_LENGTH: Record<string, number> = {
  code: 60,
  modelName: 150,
  currency: 3,
  orientation: 10,
  otherRoomsDescription: 200,
};

const FIELD_MAP: Record<string, string> = {
  code: 'code',
  modelName: 'model_name',
  type: 'type',
  category: 'category',
  totalArea: 'total_area',
  innerArea: 'inner_area',
  balconyArea: 'balcony_area',
  externalArea: 'external_area',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  hasServiceRoom: 'has_service_room',
  lotSize: 'lot_size',
  ceilingHeight: 'ceiling_height',
  garageSpaces: 'garage_spaces',
  garageType: 'garage_type',
  garageCovered: 'garage_covered',
  garageUncovered: 'garage_uncovered',
  condition: 'condition',
  features: 'features',
  livingRooms: 'living_rooms',
  kitchens: 'kitchens',
  otherRoomsCount: 'other_rooms_count',
  otherRoomsDescription: 'other_rooms_description',
  hoaFee: 'hoa_fee',
  floorsCount: 'floors_count',
  price: 'price',
  currency: 'currency',
  status: 'status',
  orientation: 'orientation',
  interiorImageUrl: 'interior_image_url',
  galleryImages: 'gallery_images',
  floorPlan3dUrl: 'floor_plan_3d_url',
  plan3dUrl: 'plan_3d_url',
  technicalPlanUrl: 'technical_plan_url',
  roomPlanImage: 'room_plan_image',
  polygon: 'polygon',
  // Cocheras marcadas en el plano del piso de cocheras — las manda la
  // pantalla de marcado masivo (components/admin/FloorParkingDelimiter.tsx),
  // siempre con la lista COMPLETA de la unidad (todos los pisos), no solo
  // las del piso que se está editando.
  parkingSpots: 'parking_spots',
  rooms: 'rooms',
  levels: 'levels',
  tourImageUrl: 'tour_image_url',
  tourData: 'tour_data',
};

// Claves del FIELD_MAP cuya columna es NOT NULL en supabase/schema.sql (CREATE
// TABLE units + los `alter table units add column ... not null`). Tiene que
// reflejar esas columnas: mandarlas en null revienta en Postgres con un 500
// crudo; se corta antes con un 400 legible. Las nullables (price, polygon,
// rooms, levels, tourData, urls, etc.) NO van acá.
const NOT_NULL_FIELDS = [
  'code', 'type', 'category', 'balconyArea', 'externalArea', 'bedrooms', 'bathrooms', 'hasServiceRoom',
  'garageSpaces', 'livingRooms', 'kitchens', 'otherRoomsCount', 'floorsCount',
  'currency', 'status', 'galleryImages', 'garageCovered', 'garageUncovered', 'features', 'parkingSpots',
];

const NOT_NULL_LABELS: Record<string, string> = {
  code: 'Código', type: 'Tipología', category: 'Categoría', bedrooms: 'Dormitorios', bathrooms: 'Baños',
  hasServiceRoom: 'Cuarto de servicio', balconyArea: 'Superficie de balcón', externalArea: 'Superficie exterior',
  currency: 'Moneda', status: 'Estado', galleryImages: 'Galería', garageSpaces: 'Cocheras',
  garageCovered: 'Cocheras cubiertas', garageUncovered: 'Cocheras descubiertas', livingRooms: 'Livings',
  kitchens: 'Cocinas', otherRoomsCount: 'Otros ambientes', floorsCount: 'Cantidad de plantas',
  features: 'Características', parkingSpots: 'Cocheras asignadas',
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromUnit(id);
  if (!projectId) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase.from('units').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromUnit(id);
  if (!projectId) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  const nullField = NOT_NULL_FIELDS.find(campo => body[campo] === null);
  if (nullField) {
    return NextResponse.json({ error: `${NOT_NULL_LABELS[nullField] ?? nullField} no puede quedar vacío.` }, { status: 400 });
  }

  if (body.status !== undefined && !isValidEnum(body.status, UNIT_STATUSES)) {
    return NextResponse.json({ error: `status debe ser uno de: ${UNIT_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (body.category !== undefined && !isValidEnum(body.category, UNIT_CATEGORIES)) {
    return NextResponse.json({ error: `category debe ser uno de: ${UNIT_CATEGORIES.join(', ')}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [camel, column] of Object.entries(FIELD_MAP)) {
    if (body[camel] === undefined) continue;
    const maxLength = TEXT_FIELD_MAX_LENGTH[camel];
    updates[column] = maxLength ? sanitizeText(body[camel], maxLength) : body[camel];
  }

  const { data, error } = await supabase.from('units').update(updates).eq('id', id).select().single();
  // 23505 = unique_violation: otra unidad del mismo piso ya usa ese código.
  if (error?.code === '23505') {
    return NextResponse.json({ error: `Ya existe una unidad con el código "${body.code ?? 'ese código'}" en este piso.` }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromUnit(id);
  if (!projectId) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { error } = await supabase.from('units').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
