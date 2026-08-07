import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (!body.slideId || !body.buildingId || body.x === undefined || body.y === undefined) {
    return NextResponse.json({ error: 'Faltan slideId, buildingId, x y/o y' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('aerial_hotspots')
    .insert({
      slide_id: body.slideId,
      building_id: body.buildingId,
      x: body.x,
      y: body.y,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
