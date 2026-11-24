import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api-validate';
import { serverError } from '@/lib/api-errors';
import { sanitizeText } from '@/lib/sanitize';
import { channelSlug, CHANNEL_COLUMNS } from '@/lib/analytics/channels';
import { requireChannelsAccess, refsWithTraffic } from '@/lib/analytics/channels-server';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().max(100).optional(),
  archived: z.boolean().optional(),
});

// Editar o archivar un canal. El slug se bloquea apenas el link tuvo tráfico:
// cambiarlo rompería los links ya repartidos (cartel de obra, flyers).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJsonBody(request, patchSchema);
  if ('error' in parsed) return parsed.error;
  const ctx = await requireChannelsAccess(request);
  if (!ctx.ok) return ctx.error;
  const { projectId, supabase } = ctx;

  const { data: current, error: readError } = await supabase
    .from('project_channels')
    .select(CHANNEL_COLUMNS)
    .eq('id', id)
    .eq('project_id', projectId)
    .maybeSingle();
  if (readError) return serverError(readError);
  if (!current) return NextResponse.json({ error: 'Canal no encontrado' }, { status: 404 });

  let traffic: Set<string>;
  try {
    traffic = await refsWithTraffic(supabase, projectId);
  } catch (e) {
    return serverError(e);
  }

  const changes: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) changes.name = sanitizeText(parsed.data.name, 120);
  if (parsed.data.slug !== undefined) {
    const slug = channelSlug(parsed.data.slug);
    if (!slug) return NextResponse.json({ error: 'El link necesita al menos una letra o número.' }, { status: 400 });
    if (slug !== current.slug) {
      if (traffic.has(current.slug)) {
        return NextResponse.json({ error: 'Este link ya tiene visitas: no se puede cambiar.' }, { status: 409 });
      }
      changes.slug = slug;
    }
  }
  if (parsed.data.archived !== undefined) changes.archived_at = parsed.data.archived ? new Date().toISOString() : null;
  if (Object.keys(changes).length === 0) return NextResponse.json({ ...current, has_traffic: traffic.has(current.slug) });

  const { data, error } = await supabase
    .from('project_channels')
    .update(changes)
    .eq('id', id)
    .eq('project_id', projectId)
    .select(CHANNEL_COLUMNS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya hay un canal con ese link.' }, { status: 409 });
    }
    return serverError(error);
  }
  return NextResponse.json({ ...data, has_traffic: traffic.has(data.slug) });
}
