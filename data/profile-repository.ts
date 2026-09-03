import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { DirectoryProfile, Profile, PortfolioProjectSummary } from '@/types';
import type { ProfileRow, ProjectRow } from '@/types/database';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface PortfolioCollaboration extends PortfolioProjectSummary {
  contribution: string;
}

export interface PortfolioTeamMember {
  handle: string;
  displayName: string;
  avatarImage?: string;
  projectCount: number;
}

export interface Portfolio extends Profile {
  /** profiles.id (= auth.uid() de esa cuenta) — para que la página pueda saber si el visitante es el dueño. */
  id: string;
  /** profiles.created_at — para mostrar "Miembro desde <año>" en el header del perfil. */
  createdAt: string;
  projects: PortfolioProjectSummary[];
  /** Proyectos ajenos donde esta cuenta tiene un crédito confirmado. */
  collaborations: PortfolioCollaboration[];
  /** Solo para account_type='company' — gente con crédito confirmado en sus proyectos. */
  team?: PortfolioTeamMember[];
}

interface CollaborationJoinRow {
  contribution: string;
  project: Pick<ProjectRow, 'slug' | 'name' | 'description' | 'masterplan_image' | 'project_type' | 'academic_year'> | null;
}

interface TeamJoinRow {
  profile: { handle: string; display_name: string; avatar_image: string | null } | null;
}

// Página pública de portfolio (/portfolio/[handle]) — perfil + los
// proyectos que su dueño marcó explícitamente como "mostrar en mi
// portfolio" (ver show_in_portfolio en supabase/schema.sql). Sin mock
// de fallback como getProjectBySlug: los perfiles son opt-in, así que
// mientras no haya Supabase configurado, ninguno existe.
export const getPortfolioByHandle = cache(async (handle: string): Promise<Portfolio | undefined> => {
  if (!SUPABASE_CONFIGURED) return undefined;

  const supabase = await createClient();

  const { data: profile } = await supabase.from('profiles').select('*').eq('handle', handle).maybeSingle();
  if (!profile) return undefined;
  const row = profile as ProfileRow;

  const { data: projectRows } = await supabase
    .from('projects')
    .select('slug, name, description, masterplan_image, project_type, academic_year, created_at')
    .eq('owner_id', row.id)
    .eq('show_in_portfolio', true)
    .eq('published', true)
    .order('created_at', { ascending: false });

  const projects: PortfolioProjectSummary[] = ((projectRows ?? []) as Pick<ProjectRow,
    'slug' | 'name' | 'description' | 'masterplan_image' | 'project_type' | 'academic_year'
  >[]).map(p => ({
    slug: p.slug,
    name: p.name,
    description: p.description ?? '',
    masterplanImage: p.masterplan_image ?? '',
    projectType: p.project_type,
    academicYear: p.academic_year ?? undefined,
  }));

  // Proyectos ajenos donde esta cuenta tiene un crédito CONFIRMADO — la
  // policy "public read accepted collaborators" ya filtra por status en
  // la base, pero se repite acá para no depender solo de RLS.
  const { data: collaborationRows } = await supabase
    .from('project_collaborators')
    .select('contribution, project:projects(slug, name, description, masterplan_image, project_type, academic_year)')
    .eq('profile_id', row.id)
    .eq('status', 'accepted');

  const collaborations: PortfolioCollaboration[] = ((collaborationRows ?? []) as unknown as CollaborationJoinRow[])
    .filter(c => c.project)
    .map(c => ({
      slug: c.project!.slug,
      name: c.project!.name,
      description: c.project!.description ?? '',
      masterplanImage: c.project!.masterplan_image ?? '',
      projectType: c.project!.project_type,
      academicYear: c.project!.academic_year ?? undefined,
      contribution: c.contribution,
    }));

  // "Equipo" de una empresa: no es una tabla propia — es la gente con
  // crédito confirmado en ALGUNO de sus proyectos, deduplicada acá.
  let team: PortfolioTeamMember[] | undefined;
  if (row.account_type === 'company') {
    const { data: teamRows } = await supabase
      .from('project_collaborators')
      .select('profile:profiles(handle, display_name, avatar_image), project:projects!inner(owner_id)')
      .eq('project.owner_id', row.id)
      .eq('status', 'accepted');

    const countByHandle = new Map<string, PortfolioTeamMember>();
    for (const r of ((teamRows ?? []) as unknown as TeamJoinRow[])) {
      if (!r.profile) continue;
      const existing = countByHandle.get(r.profile.handle);
      if (existing) {
        existing.projectCount += 1;
      } else {
        countByHandle.set(r.profile.handle, {
          handle: r.profile.handle,
          displayName: r.profile.display_name,
          avatarImage: r.profile.avatar_image ?? undefined,
          projectCount: 1,
        });
      }
    }
    team = Array.from(countByHandle.values()).sort((a, b) => b.projectCount - a.projectCount);
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    handle: row.handle,
    displayName: row.display_name,
    accountType: row.account_type,
    bio: row.bio ?? null,
    avatarImage: row.avatar_image ?? null,
    bannerImage: row.banner_image ?? null,
    location: row.location ?? null,
    contactEmail: row.contact_email ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    instagramUrl: row.instagram_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    skills: row.skills?.length ? row.skills : undefined,
    experiences: row.experiences?.length ? row.experiences : undefined,
    education: row.education?.length ? row.education : undefined,
    certifications: row.certifications?.length ? row.certifications : undefined,
    projects,
    collaborations,
    team,
  };
});

// /directorio — todos los perfiles públicos, para descubrir gente más
// allá de un link directo. Se cuenta solo lo que cada uno publicó en su
// portfolio (show_in_portfolio=true), no colaboraciones ajenas — es la
// señal de "cuánto trabajo propio tiene mostrado", no de actividad total.
export const getPortfolioDirectory = cache(async (): Promise<DirectoryProfile[]> => {
  if (!SUPABASE_CONFIGURED) return [];

  const supabase = await createClient();

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, handle, display_name, account_type, avatar_image, bio, location')
    .order('display_name');
  const profiles = (profileRows ?? []) as Pick<ProfileRow, 'id' | 'handle' | 'display_name' | 'account_type' | 'avatar_image' | 'bio' | 'location'>[];
  if (profiles.length === 0) return [];

  const { data: projectRows } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('show_in_portfolio', true)
    .eq('published', true)
    .in('owner_id', profiles.map(p => p.id));

  const countByOwner = new Map<string, number>();
  for (const p of (projectRows ?? [])) {
    countByOwner.set(p.owner_id, (countByOwner.get(p.owner_id) ?? 0) + 1);
  }

  return profiles.map(p => ({
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    accountType: p.account_type,
    avatarImage: p.avatar_image ?? undefined,
    bio: p.bio ?? undefined,
    location: p.location ?? undefined,
    projectCount: countByOwner.get(p.id) ?? 0,
  }));
});

type ProfileJoinRow = Pick<ProfileRow, 'id' | 'handle' | 'display_name' | 'account_type' | 'avatar_image' | 'bio' | 'location'>;

async function toDirectoryProfiles(profiles: ProfileJoinRow[]): Promise<DirectoryProfile[]> {
  if (profiles.length === 0) return [];
  const supabase = await createClient();
  const { data: projectRows } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('show_in_portfolio', true)
    .eq('published', true)
    .in('owner_id', profiles.map(p => p.id));

  const countByOwner = new Map<string, number>();
  for (const p of (projectRows ?? [])) {
    countByOwner.set(p.owner_id, (countByOwner.get(p.owner_id) ?? 0) + 1);
  }

  return profiles.map(p => ({
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    accountType: p.account_type,
    avatarImage: p.avatar_image ?? undefined,
    bio: p.bio ?? undefined,
    location: p.location ?? undefined,
    projectCount: countByOwner.get(p.id) ?? 0,
  }));
}

// A quién sigue el visitante logueado — para pintar el estado inicial
// correcto de FollowButton en listas (directorio, seguidores, siguiendo)
// sin que cada card tenga que pedirlo por separado.
export async function getFollowingSet(viewerId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from('follows').select('following_id').eq('follower_id', viewerId);
  return new Set((rows ?? []).map(r => r.following_id));
}

// /portfolio/[handle]/seguidores y /siguiendo — listas clickeables en vez
// de solo el contador plano que había antes en el hero del perfil.
export const getFollowers = cache(async (profileId: string): Promise<DirectoryProfile[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('follows')
    .select('follower:profiles!follows_follower_id_fkey(id, handle, display_name, account_type, avatar_image, bio, location)')
    .eq('following_id', profileId);
  const profiles = ((rows ?? []) as unknown as { follower: ProfileJoinRow | null }[])
    .map(r => r.follower).filter((p): p is ProfileJoinRow => !!p);
  return toDirectoryProfiles(profiles);
});

export const getFollowing = cache(async (profileId: string): Promise<DirectoryProfile[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('follows')
    .select('following:profiles!follows_following_id_fkey(id, handle, display_name, account_type, avatar_image, bio, location)')
    .eq('follower_id', profileId);
  const profiles = ((rows ?? []) as unknown as { following: ProfileJoinRow | null }[])
    .map(r => r.following).filter((p): p is ProfileJoinRow => !!p);
  return toDirectoryProfiles(profiles);
});
