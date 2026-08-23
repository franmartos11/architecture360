import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit') || '5';
  const limit = parseInt(limitParam, 10);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ suggestions: [] });
  }

  // 1. Obtener mi id de perfil
  const { data: myProfile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!myProfile) return NextResponse.json({ suggestions: [] });

  // 2. Obtener la gente a la que YA sigo
  const { data: followingRows } = await supabase.from('follows').select('following_id').eq('follower_id', myProfile.id);
  const followingIds = (followingRows ?? []).map(r => r.following_id);
  const excludedIds = [...followingIds, myProfile.id];

  // 3. Obtener perfiles que no estén en excluidos.
  // En un sistema real esto usaría mutual followers u otros factores.
  // Acá por ahora ordenamos random o por los más recientes/populares.
  // Hacemos una subconsulta simple: excluyendo a los que ya sigo.
  const { data: suggestions } = await supabase
    .from('profiles')
    .select('id, handle, display_name, avatar_image, account_type, bio')
    .not('id', 'in', `(${excludedIds.join(',')})`)
    .limit(limit);

  // Parsear a camelCase
  const parsed = (suggestions ?? []).map(p => ({
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    avatarImage: p.avatar_image,
    accountType: p.account_type,
    bio: p.bio
  }));

  return NextResponse.json({ suggestions: parsed });
}
