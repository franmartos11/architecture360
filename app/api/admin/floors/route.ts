import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (!body.buildingId || body.number === undefined || !body.label) {
    return NextResponse.json({ error: 'Faltan buildingId, number y/o label' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('floors')
    .insert({
      building_id: body.buildingId,
      number: body.number,
      label: body.label,
      plan_image: body.planImage ?? null,
      unit_dots: body.unitDots ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
