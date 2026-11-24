import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api-validate';
import { serverError } from '@/lib/api-errors';
import { sanitizeText } from '@/lib/sanitize';
import { channelSlug, CHANNEL_COLUMNS, type Channel } from '@/lib/analytics/channels';
import { requireChannelsAccess, refsWithTraffic } from '@/lib/analytics/channels-server';

// Inmobiliarias y campañas del proyecto activo. Gestor en adelante (igual que leads).

const createChannelSchema = z.object({
  name: z.string().trim().min(1, 'Falta el nombre').max(120),
  kind: z.enum(['inmobiliaria', 'campaña']),
  slug: z.string().max(100).optional(),
});

export async function GET(request: Request) {
  const ctx = await requireChannelsAccess(request);
  if (!ctx.ok) return ctx.error;
  const { projectId, supabase } = ctx;

  const { data, error } = await supabase
    .from('project_channels')
    .select(CHANNEL_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) return serverError(error);

  try {
    const traffic = await refsWithTraffic(supabase, projectId);
    const channels: Channel[] = (data ?? []).map(c => ({ ...(c as Omit<Channel, 'has_traffic'>), has_traffic: traffic.has(c.slug) }));
    return NextResponse.json(channels);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, createChannelSchema);
  if ('error' in parsed) return parsed.error;
  const ctx = await requireChannelsAccess(request);
  if (!ctx.ok) return ctx.error;
  const { projectId, supabase } = ctx;

  const name = sanitizeText(parsed.data.name, 120);
  const slug = channelSlug(parsed.data.slug || name);
  if (!slug) return NextResponse.json({ error: 'El link necesita al menos una letra o número.' }, { status: 400 });

  const { data, error } = await supabase
    .from('project_channels')
    .insert({ project_id: projectId, name, slug, kind: parsed.data.kind })
    .select(CHANNEL_COLUMNS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya hay un canal con ese link.' }, { status: 409 });
    }
    return serverError(error);
  }
  // Puede que el ref ya haya llegado antes de registrarlo ("links sin registrar").
  try {
    const traffic = await refsWithTraffic(supabase, projectId);
    return NextResponse.json({ ...data, has_traffic: traffic.has(slug) }, { status: 201 });
  } catch {
    return NextResponse.json({ ...data, has_traffic: false }, { status: 201 });
  }
}
