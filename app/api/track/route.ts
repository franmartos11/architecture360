import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseJsonBody } from '@/lib/api-validate';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request-ip';
import { trackSchema } from '@/lib/analytics/track-schema';
import { isBotUserAgent, deviceFromUserAgent } from '@/lib/analytics/user-agent';
import { unitOfProject } from '@/lib/analytics/project-unit';
import { normalizeRef } from '@/lib/analytics/ref';

// Eventos de analítica del sitio público (ver components/analytics/SiteTracker).
// "Disparar y olvidar": con un payload válido responde 204 SIEMPRE — aunque el
// proyecto no exista, sea un robot o falle la base —, así no sirve de oráculo
// y el sitio nunca se entera. La IP se usa solo para el rate limit; no se guarda.

const MAX_DURATION_SECONDS = 1800;
const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, trackSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const ua = request.headers.get('user-agent');
  if (isBotUserAgent(ua)) return noContent();

  const ip = clientIp(request);
  if (ip) {
    const limited = await rateLimitOrRespond(
      { key: `track:ip:${ip}`, windowSeconds: 600, max: 300 },
      'Demasiados eventos seguidos.'
    );
    if (limited) return limited;
  }

  const supabase = await createClient();
  const { data: project } = await supabase.from('projects').select('id').eq('slug', body.projectSlug).maybeSingle();
  if (!project) return noContent();

  const admin = createAdminClient();

  // Segundo envío de una vista de unidad: solo completa su duración, una vez,
  // y solo sobre un evento 'unit' de este mismo proyecto.
  if (body.durationSeconds !== undefined) {
    const { error } = await admin
      .from('site_events')
      .update({ duration_seconds: Math.min(body.durationSeconds, MAX_DURATION_SECONDS) })
      .eq('id', body.id)
      .eq('project_id', project.id)
      .eq('type', 'unit')
      .is('duration_seconds', null);
    if (error) console.error('[track] no se pudo guardar la duración', error);
    return noContent();
  }

  const unitId = await unitOfProject(body.unitId, project.id);

  const { error } = await admin.from('site_events').insert({
    id: body.id,
    project_id: project.id,
    visitor_id: body.visitorId,
    session_id: body.sessionId,
    type: body.type,
    path: body.path,
    unit_id: unitId,
    ref: normalizeRef(body.ref) || null,
    referrer_host: body.referrerHost?.toLowerCase() || null,
    device: deviceFromUserAgent(ua),
  });
  if (error) console.error('[track] no se pudo guardar el evento', error);
  return noContent();
}
