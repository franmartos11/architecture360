import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import { parseJsonBody, optionalUrlSchema } from '@/lib/api-validate';
import { sanitizeText, sanitizeMultiline } from '@/lib/sanitize';

// skills/experiences/education/certifications/awards son listas de objetos
// con forma propia (ej. { role, company, from, to }) — se cachea su longitud
// para que nadie mande un array de miles de entradas, pero no se valida
// el shape interno de cada objeto (fuera de alcance de este endurecimiento
// puntual, igual que sectionConfig/themeConfig en /api/admin/project).
const MAX_LIST_ITEMS = 50;
const MAX_TAG_ITEMS = 30;
const profilePatchSchema = z.object({
  displayName: z.string().max(150).optional(),
  accountType: z.enum(['person', 'company']).optional(),
  headline: z.string().max(90).nullable().optional(),
  license: z.string().max(60).nullable().optional(),
  availability: z.enum(['open', 'hiring', 'busy']).optional(),
  bio: z.string().max(2000).nullable().optional(),
  avatarImage: z.string().max(1000).nullable().optional(),
  bannerImage: z.string().max(1000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  contactEmail: z.union([z.email(), z.literal('')]).nullable().optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  linkedinUrl: optionalUrlSchema.nullable(),
  instagramUrl: optionalUrlSchema.nullable(),
  websiteUrl: optionalUrlSchema.nullable(),
  specialties: z.array(z.string()).max(MAX_TAG_ITEMS).optional(),
  languages: z.array(z.string()).max(MAX_TAG_ITEMS).optional(),
  skills: z.array(z.unknown()).max(MAX_LIST_ITEMS).optional(),
  experiences: z.array(z.unknown()).max(MAX_LIST_ITEMS).optional(),
  education: z.array(z.unknown()).max(MAX_LIST_ITEMS).optional(),
  certifications: z.array(z.unknown()).max(MAX_LIST_ITEMS).optional(),
  awards: z.array(z.unknown()).max(MAX_LIST_ITEMS).optional(),
  isPublic: z.boolean().optional(),
  showContact: z.boolean().optional(),
  isIndexed: z.boolean().optional(),
  featuredProjectId: z.uuid().nullable().optional(),
});

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

  const parsed = await parseJsonBody(request, profilePatchSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  // El handle se genera solo, una única vez, a partir del nombre — nunca
  // lo escribe el usuario. Es inmutable después: si ya existe una fila,
  // se ignora cualquier handle que venga en el body y se conserva el
  // asignado (así renombrarse después no rompe un link ya compartido).
  const { data: existing } = await supabase.from('profiles').select('handle').eq('id', user.id).maybeSingle();
  const handle = existing?.handle ?? await ensureUniqueSlug(supabase, {
    table: 'profiles', column: 'handle', base: slugify(sanitizeText(body.displayName, 150)),
  });

  // El proyecto destacado tiene que ser propio — sin esto, cualquiera
  // podría "destacar" el proyecto de otra cuenta en su propio portfolio.
  let featuredProjectId: string | null = null;
  if (body.featuredProjectId) {
    const { data: project } = await supabase.from('projects').select('id').eq('id', body.featuredProjectId).eq('owner_id', user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: 'Ese proyecto no te pertenece.' }, { status: 403 });
    featuredProjectId = project.id;
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      handle,
      display_name: sanitizeText(body.displayName, 150),
      account_type: body.accountType === 'company' ? 'company' : 'person',
      headline: sanitizeText(body.headline, 90) || null,
      license: sanitizeText(body.license, 60) || null,
      availability: body.availability ?? 'open',
      bio: sanitizeMultiline(body.bio, 2000) || null,
      avatar_image: body.avatarImage ?? null,
      banner_image: body.bannerImage ?? null,
      location: sanitizeText(body.location, 200) || null,
      contact_email: body.contactEmail || null,
      whatsapp: sanitizeText(body.whatsapp, 40) || null,
      linkedin_url: body.linkedinUrl || null,
      instagram_url: body.instagramUrl || null,
      website_url: body.websiteUrl || null,
      specialties: Array.isArray(body.specialties) ? body.specialties.map(s => sanitizeText(s, 60)).filter(Boolean) : [],
      languages: Array.isArray(body.languages) ? body.languages.map(s => sanitizeText(s, 40)).filter(Boolean) : [],
      skills: Array.isArray(body.skills) ? body.skills : [],
      experiences: Array.isArray(body.experiences) ? body.experiences : [],
      education: Array.isArray(body.education) ? body.education : [],
      certifications: Array.isArray(body.certifications) ? body.certifications : [],
      awards: Array.isArray(body.awards) ? body.awards : [],
      is_public: body.isPublic ?? true,
      show_contact: body.showContact ?? true,
      is_indexed: body.isIndexed ?? true,
      featured_project_id: featuredProjectId,
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
