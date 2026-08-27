import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidEnum } from '@/lib/validate';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE, isValidTypeCombo, getProjectTypeConfig } from '@/lib/project-types';
import { resolveActiveProjectId } from '@/lib/supabase/require-project-access';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import { sanitizeText } from '@/lib/sanitize';
import { provisionSingleUnitStructure } from '@/lib/provision-structure';

const PROJECT_TYPE_KEYS = Object.keys(PROJECT_STRUCTURES) as (keyof typeof PROJECT_STRUCTURES)[];
const SALE_MODE_KEYS = Object.keys(PROJECT_SALE_MODES) as (keyof typeof PROJECT_SALE_MODES)[];

// GET  → los proyectos de la cuenta logueada (para "Mis proyectos"), más
//        cuál está activo — para poder marcarlo en la grilla y no hacer
//        que el usuario adivine en cuál está parado.
// POST → crea un proyecto nuevo con esa cuenta como dueña.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, description, masterplan_image, project_type, sale_mode, show_in_portfolio, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projectIds = (data ?? []).map(p => p.id);
  const pendingLeadsByProject = new Map<string, number>();
  const commentsByProject = new Map<string, number>();

  if (projectIds.length > 0) {
    const [{ data: pendingLeads }, { data: comments }] = await Promise.all([
      supabase.from('leads').select('project_id').in('project_id', projectIds).eq('status', 'nuevo'),
      supabase.from('project_comments').select('project_id').in('project_id', projectIds),
    ]);
    for (const l of (pendingLeads ?? [])) {
      if (l.project_id) pendingLeadsByProject.set(l.project_id, (pendingLeadsByProject.get(l.project_id) ?? 0) + 1);
    }
    for (const c of (comments ?? [])) {
      commentsByProject.set(c.project_id, (commentsByProject.get(c.project_id) ?? 0) + 1);
    }
  }

  const projects = (data ?? []).map(p => ({
    ...p,
    pendingLeadsCount: pendingLeadsByProject.get(p.id) ?? 0,
    commentsCount: commentsByProject.get(p.id) ?? 0,
  }));

  const activeProjectId = await resolveActiveProjectId();
  return NextResponse.json({ projects, activeProjectId });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const name = sanitizeText(body.name, 150);
  if (!name) {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }
  if (body.projectType !== undefined && !isValidEnum(body.projectType, PROJECT_TYPE_KEYS)) {
    return NextResponse.json({ error: `projectType debe ser uno de: ${PROJECT_TYPE_KEYS.join(', ')}` }, { status: 400 });
  }
  if (body.saleMode !== undefined && !isValidEnum(body.saleMode, SALE_MODE_KEYS)) {
    return NextResponse.json({ error: `saleMode debe ser uno de: ${SALE_MODE_KEYS.join(', ')}` }, { status: 400 });
  }
  const projectType = body.projectType ?? DEFAULT_PROJECT_TYPE;
  const saleMode = body.saleMode ?? DEFAULT_SALE_MODE;
  if (!isValidTypeCombo(projectType, saleMode)) {
    return NextResponse.json({ error: `La forma "${projectType}" no admite el propósito "${saleMode}".` }, { status: 400 });
  }

  // El slug se genera solo a partir del nombre — el admin nunca lo escribe
  // ni puede pisarlo con uno repetido (ver lib/slug.ts).
  const slug = await ensureUniqueSlug(supabase, { table: 'projects', column: 'slug', base: slugify(name) });

  const { data, error } = await supabase
    .from('projects')
    .insert({
      slug,
      name,
      owner_id: user.id,
      project_type: projectType,
      sale_mode: saleMode,
    })
    .select('id, slug, name, project_type, sale_mode')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese slug ya está en uso.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Formas "de una sola cosa" (casa): la casa ES el proyecto, así que se
  // arma sola acá mismo con el nombre del proyecto — el usuario no pasa
  // por un paso de "crear la casa". Si algo falla, el proyecto igual queda
  // creado y el wizard la provisiona como red de seguridad.
  if (!getProjectTypeConfig(projectType, saleMode).hasUnitStep) {
    try {
      await provisionSingleUnitStructure(supabase, { projectId: data.id, name });
    } catch (e) {
      console.error('No se pudo auto-provisionar la casa del proyecto', data.id, e);
    }
  }

  return NextResponse.json(data, { status: 201 });
}
