import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, resolveRequestedProjectId, type ProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseJsonBody } from '@/lib/api-validate';
import { parseConstructionProgress, stampConstructionProgress } from '@/lib/construction-progress-sanitize';
import { isPublishedUpdate } from '@/lib/construction-progress';
import { sendEmail } from '@/lib/email';
import { buildProgressEmail } from '@/lib/progress-email';
import { unsubscribeUrl } from '@/lib/unsubscribe-token';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { revalidateProjectById } from '@/lib/revalidate-project';
import { serverError } from '@/lib/api-errors';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';

// Un envío masivo no debería poder pasar de acá: Resend limita por segundo y
// un panel con miles de interesados necesita otro mecanismo (cola), no un
// request HTTP. 20 en paralelo mantiene el tiempo de la respuesta acotado.
const MAX_RECIPIENTS = 500;
const BATCH_SIZE = 20;
const RATE_LIMIT = { windowSeconds: 60 * 60, max: 5 };

const bodySchema = z.object({ updateId: z.string().min(1).max(64) });

interface Loaded {
  projectId: string;
  project: { name: string; slug: string; updated_at: string | null };
  progress: ConstructionProgress;
  update: ConstructionUpdate;
}

// Carga el blob con el cliente de sesión (ya sabemos que es del dueño) y deja
// la entrada lista, o la respuesta de error que corresponda.
async function loadUpdate(
  access: ProjectAccess,
  projectId: string,
  updateId: string
): Promise<{ loaded: Loaded } | { error: NextResponse }> {
  const { data: row, error } = await access.supabase
    .from('projects')
    .select('name, slug, construction_progress, updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (error) return { error: serverError(error) };
  if (!row) return { error: NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 }) };

  const progress = parseConstructionProgress(row.construction_progress);
  const update = progress?.updates.find(u => u.id === updateId);
  if (!progress || !update || !isPublishedUpdate(update)) {
    return { error: NextResponse.json({ error: 'Esa entrada no existe o todavía no está publicada (con foto o clip).' }, { status: 400 }) };
  }
  return { loaded: { projectId, project: { name: row.name, slug: row.slug, updated_at: row.updated_at ?? null }, progress, update } };
}

// Interesados que pidieron novedades de ESTE proyecto, no se dieron de baja y
// tienen correo. Una persona que dejó varios contactos recibe un solo correo.
async function findRecipients(projectId: string): Promise<{ id: string; email: string }[] | { error: unknown }> {
  const { data, error } = await createAdminClient()
    .from('leads')
    .select('id, email')
    .eq('project_id', projectId)
    .eq('wants_updates', true)
    .not('email', 'is', null)
    .is('updates_unsubscribed_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_RECIPIENTS);
  if (error) return { error };
  const seen = new Set<string>();
  const out: { id: string; email: string }[] = [];
  for (const r of (data ?? []) as { id: string; email: string | null }[]) {
    const email = r.email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.id, email });
  }
  return out;
}

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const updateId = new URL(request.url).searchParams.get('updateId');
  if (!updateId) return NextResponse.json({ error: 'Falta updateId' }, { status: 400 });

  const result = await loadUpdate(access, projectId, updateId);
  if ('error' in result) return result.error;

  const recipients = await findRecipients(projectId);
  if ('error' in recipients) return serverError(recipients.error);
  return NextResponse.json({ recipients: recipients.length, notifiedAt: result.loaded.update.notifiedAt ?? null });
}

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = await parseJsonBody(request, bodySchema);
  if ('error' in parsed) return parsed.error;

  const result = await loadUpdate(access, projectId, parsed.data.updateId);
  if ('error' in result) return result.error;
  const { project, progress, update } = result.loaded;

  if (update.notifiedAt) {
    return NextResponse.json({ error: 'Esa entrada ya se mandó por correo.' }, { status: 409 });
  }

  const limited = await rateLimitOrRespond(
    { key: `progress-notify:project:${projectId}`, ...RATE_LIMIT },
    'Ya mandaste varias novedades en la última hora — esperá un rato antes de enviar otra.'
  );
  if (limited) return limited;

  const recipients = await findRecipients(projectId);
  if ('error' in recipients) return serverError(recipients.error);
  // Sin nadie a quien avisar no se marca: la entrada queda disponible para
  // cuando alguien pida novedades.
  if (recipients.length === 0) return NextResponse.json({ sent: 0, skipped: 0 });

  // Se marca ANTES de mandar, no después: con dos clics seguidos (o dos
  // pestañas) el segundo veía la entrada sin marcar y todos los interesados
  // recibían el correo doble. El update va condicionado al updated_at que
  // leímos, así que solo uno de los dos gana. Si el envío se corta a la mitad
  // queda "enviada" sin haber llegado a todos — se prefiere eso a duplicar.
  const notifiedAt = new Date().toISOString();
  const stamped = stampConstructionProgress({
    ...progress,
    updates: progress.updates.map(u => (u.id === update.id ? { ...u, notifiedAt } : u)),
  });
  const claim = access.supabase.from('projects').update({ construction_progress: stamped, updated_at: stamped.updatedAt });
  const { data: claimed, error: claimError } = await (project.updated_at === null
    ? claim.eq('id', projectId).is('updated_at', null)
    : claim.eq('id', projectId).eq('updated_at', project.updated_at)
  ).select('id');
  if (claimError) return serverError(claimError);
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'El avance cambió mientras se preparaba el envío. Recargá y probá de nuevo.' }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const { data: domain } = await createAdminClient()
    .from('project_domains')
    .select('hostname')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  const projectUrl = getProjectDisplayUrl(project.slug, origin, domain?.hostname ?? null);

  let sent = 0;
  let skipped = 0;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const outcomes = await Promise.allSettled(
      batch.map(r => {
        const { subject, html } = buildProgressEmail({
          projectName: project.name,
          update,
          progress,
          projectUrl,
          unsubscribeUrl: unsubscribeUrl(origin, r.id),
        });
        return sendEmail({ to: r.email, subject, html });
      })
    );
    for (const o of outcomes) {
      if (o.status === 'fulfilled') sent++;
      else {
        skipped++;
        console.error('[progress-notify] no se pudo mandar un correo', o.reason);
      }
    }
  }

  await revalidateProjectById(projectId);
  // notifiedAt y updatedAt vuelven para que el panel actualice su copia sin
  // recargar: sin la marca nueva, el próximo "Guardar cambios" chocaría con
  // el 409 del PATCH (este envío ya cambió updatedAt en la base).
  return NextResponse.json({ sent, skipped, notifiedAt, updatedAt: stamped.updatedAt });
}
