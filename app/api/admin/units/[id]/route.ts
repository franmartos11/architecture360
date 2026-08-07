import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

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
  price: 'price',
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
  tourImageUrl: 'tour_image_url',
  tourData: 'tour_data',
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin.from('units').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [camel, column] of Object.entries(FIELD_MAP)) {
    if (body[camel] !== undefined) updates[column] = body[camel];
  }

  const { data, error } = await admin.from('units').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from('units').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
