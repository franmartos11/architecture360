import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { serverError } from '@/lib/api-errors';
import { parseLocales } from '@/lib/i18n/project-locales';

// "Sitio en inglés": activa /en en el sitio público del proyecto. De
// administrador en adelante (más adelante dispara traducciones pagas con IA).
// Spec: docs/superpowers/specs/2026-11-25-multi-idioma-design.md
const Pedido = z.object({ ingles: z.boolean() });

export async function PATCH(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  // revalidate: el sitio público está cacheado; el selector y /en aparecen al guardar.
  const access = await requireProjectAccess(projectId, { minRole: 'administrador', revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = Pedido.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const locales = parsed.data.ingles ? ['es', 'en'] : ['es'];
  const { data, error } = await access.supabase
    .from('projects')
    .update({ locales })
    .eq('id', projectId)
    .select('locales')
    .single();
  if (error) return serverError(error);
  return NextResponse.json({ locales: parseLocales((data as { locales: unknown } | null)?.locales) });
}
