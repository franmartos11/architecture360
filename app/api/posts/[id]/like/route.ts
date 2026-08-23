import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { error } = await supabase.from('post_likes').insert({ post_id: id, profile_id: user.id });
  // 23505 = ya lo tenía likeado (unique constraint) — no es un error real, es idempotente.
  if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });

  if (!error) {
    const { data: post } = await supabase.from('posts').select('author_id').eq('id', id).maybeSingle();
    if (post) await notify(supabase, { recipientId: post.author_id, actorId: user.id, type: 'like', entityId: id });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { error } = await supabase.from('post_likes').delete().eq('post_id', id).eq('profile_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
