import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { rateLimitOrRespond } from '@/lib/rate-limit';

// GET /api/follows/[handle]
// → { handle, displayName, avatarImage, bio, accountType, followerCount, followingCount, isFollowedByMe }
// Usado tanto por ProfileHoverCard (mini-tarjeta al pasar el mouse) como por
// cualquier lugar que necesite los contadores de un perfil puntual.
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Resolver handle → perfil
  const { data: target } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_image, bio, account_type')
    .eq('handle', handle)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });

  // Contadores en paralelo
  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', target.id),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', target.id),
  ]);

  // ¿El usuario logueado ya sigue a este perfil?
  let isFollowedByMe = false;
  if (user) {
    const { data: myProfile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (myProfile) {
      const { data: row } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', myProfile.id)
        .eq('following_id', target.id)
        .maybeSingle();
      isFollowedByMe = !!row;
    }
  }

  return NextResponse.json({
    handle,
    displayName: target.display_name,
    avatarImage: target.avatar_image,
    bio: target.bio,
    accountType: target.account_type,
    followerCount: followerCount ?? 0,
    followingCount: followingCount ?? 0,
    isFollowedByMe,
  });
}

// POST /api/follows/[handle] → Seguir
export async function POST(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond({ key: `follows:user:${user.id}`, windowSeconds: 60, max: 30 });
  if (limited) return limited;

  // Quién sigue (debe tener perfil)
  const { data: me } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: 'Creá tu portfolio antes de seguir a alguien.' }, { status: 400 });

  // A quién sigue
  const { data: target } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });

  if (me.id === target.id) return NextResponse.json({ error: 'No podés seguirte a vos mismo.' }, { status: 400 });

  // INSERT idempotente — 23505 (unique violation) significa que ya lo seguía, no es error real.
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: me.id, following_id: target.id });

  if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });

  await notify(supabase, { recipientId: target.id, actorId: me.id, type: 'follow' });

  const { count } = await supabase
    .from('follows').select('*', { count: 'exact', head: true }).eq('following_id', target.id);

  return NextResponse.json({ followerCount: count ?? 0, isFollowedByMe: true });
}

// DELETE /api/follows/[handle] → Dejar de seguir
export async function DELETE(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [{ data: me }, { data: target }] = await Promise.all([
    supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('id').eq('handle', handle).maybeSingle(),
  ]);

  if (!me || !target) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  await supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', target.id);

  const { count } = await supabase
    .from('follows').select('*', { count: 'exact', head: true }).eq('following_id', target.id);

  return NextResponse.json({ followerCount: count ?? 0, isFollowedByMe: false });
}
