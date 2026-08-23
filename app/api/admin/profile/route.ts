import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { slugify, ensureUniqueSlug } from '@/lib/slug';

// GET   → el perfil de la cuenta logueada, o null si todavía no definió uno.
// PATCH → crea o actualiza el perfil (upsert por id = auth.uid()).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();

  // El handle se genera solo, una única vez, a partir del nombre — nunca
  // lo escribe el usuario. Es inmutable después: si ya existe una fila,
  // se ignora cualquier handle que venga en el body y se conserva el
  // asignado (así renombrarse después no rompe un link ya compartido).
  const { data: existing } = await supabase.from('profiles').select('handle').eq('id', user.id).maybeSingle();
  const handle = existing?.handle ?? await ensureUniqueSlug(supabase, {
    table: 'profiles', column: 'handle', base: slugify(body.displayName ?? ''),
  });

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      handle,
      display_name: body.displayName ?? '',
      account_type: body.accountType === 'company' ? 'company' : 'person',
      bio: body.bio ?? null,
      avatar_image: body.avatarImage ?? null,
      banner_image: body.bannerImage ?? null,
      location: body.location ?? null,
      contact_email: body.contactEmail ?? null,
      whatsapp: body.whatsapp ?? null,
      linkedin_url: body.linkedinUrl ?? null,
      instagram_url: body.instagramUrl ?? null,
      website_url: body.websiteUrl ?? null,
      skills: Array.isArray(body.skills) ? body.skills : [],
      experiences: Array.isArray(body.experiences) ? body.experiences : [],
      education: Array.isArray(body.education) ? body.education : [],
      certifications: Array.isArray(body.certifications) ? body.certifications : [],
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese handle ya está en uso.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
