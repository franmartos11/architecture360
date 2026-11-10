import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { serverError } from '@/lib/api-errors';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from('saved_themes').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
