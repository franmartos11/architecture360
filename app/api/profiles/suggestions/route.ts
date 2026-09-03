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

  const suggestedIds = (suggestions ?? []).map(p => p.id);

  // "Contactos en común": de la gente sugerida, cuántos de mis propios
  // seguidos ya siguen a esa persona — no es una recomendación real
  // (eso sigue siendo el TODO de arriba), solo la métrica que se muestra
  // junto a cada sugerencia.
  const mutualCountById = new Map<string, number>();
  if (followingIds.length > 0 && suggestedIds.length > 0) {
    const { data: mutualRows } = await supabase
      .from('follows')
      .select('following_id')
      .in('follower_id', followingIds)
      .in('following_id', suggestedIds);
    for (const row of (mutualRows ?? []) as { following_id: string }[]) {
      mutualCountById.set(row.following_id, (mutualCountById.get(row.following_id) ?? 0) + 1);
    }
  }

  // Parsear a camelCase
  const parsed = (suggestions ?? []).map(p => ({
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    avatarImage: p.avatar_image,
    accountType: p.account_type,
    bio: p.bio,
    mutualCount: mutualCountById.get(p.id) ?? 0,
  }));

  return NextResponse.json({ suggestions: parsed });
}
