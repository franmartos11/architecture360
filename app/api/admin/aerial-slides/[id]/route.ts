import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;
  if (body.label !== undefined) updates.label = body.label;
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;

  const { data, error } = await admin.from('aerial_slides').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  // Cascade se lleva los hotspots de este slide.
  const { error } = await admin.from('aerial_slides').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
