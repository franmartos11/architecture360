import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromUnit } from '@/lib/supabase/require-project-access';
import { isValidEnum, UNIT_STATUSES } from '@/lib/validate';

const FIELD_MAP: Record<string, string> = {
  code: 'code',
  modelName: 'model_name',
  type: 'type',
  totalArea: 'total_area',
  innerArea: 'inner_area',
  balconyArea: 'balcony_area',
  externalArea: 'external_area',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  hasServiceRoom: 'has_service_room',
  lotSize: 'lot_size',
  hasGarage: 'has_garage',
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
  rooms: 'rooms',
  levels: 'levels',
  tourImageUrl: 'tour_image_url',
  tourData: 'tour_data',
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

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (body.status !== undefined && !isValidEnum(body.status, UNIT_STATUSES)) {
    return NextResponse.json({ error: `status debe ser uno de: ${UNIT_STATUSES.join(', ')}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [camel, column] of Object.entries(FIELD_MAP)) {
    if (body[camel] !== undefined) updates[column] = body[camel];
  }

  const { data, error } = await supabase.from('units').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromUnit(id);
  if (!projectId) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { error } = await supabase.from('units').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
