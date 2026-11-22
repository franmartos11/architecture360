import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/sanitize';
import { validateTransferTarget } from '@/lib/transfer';
import { parseJsonBody } from '@/lib/api-validate';
import { rateLimitOrRespond } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT_MAX_TRANSFERS = 5;

const transferSchema = z.object({
  handle: z.string().trim().min(1, 'Falta el handle de la persona').max(100),
});

// Transferencia pendiente del proyecto (a lo sumo una: índice único parcial).
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { minRole: 'dueño' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase
    .from('project_ownership_transfers')
    .select('id, created_at, to:profiles!project_ownership_transfers_to_user_fkey(handle, display_name)')
    .eq('project_id', id)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ pending: null });

  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  return NextResponse.json({ pending: { id: data.id, to, created_at: data.created_at } });
}

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseJsonBody(request, transferSchema);
  if ('error' in parsed) return parsed.error;
  const { handle } = parsed.data;

  const access = await requireProjectAccess(id, { minRole: 'dueño' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  // Sin tope, una dueña podría spamear a alguien con crear → cancelar → crear.
  const limited = await rateLimitOrRespond(
    { key: `transfer:user:${user.id}`, windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX_TRANSFERS },
    'Demasiados intentos de transferencia — esperá unos minutos e intentá de nuevo.'
  );
  if (limited) return limited;

  const [projectRes, ownerRes, targetRes, pendingRes] = await Promise.all([
    supabase.from('projects').select('name').eq('id', id).maybeSingle(),
    supabase.from('profiles').select('handle').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('id').eq('handle', handle).maybeSingle(),
    supabase.from('project_ownership_transfers').select('id').eq('project_id', id).eq('status', 'pending').maybeSingle(),
  ]);
  // Un error de lectura no es "no existe" ni "no hay pendiente": se corta con 500.
  const lookupError = projectRes.error ?? ownerRes.error ?? targetRes.error ?? pendingRes.error;
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const project = projectRes.data;
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const invalid = validateTransferTarget({
    ownerId: user.id,
    ownerHasHandle: !!ownerRes.data?.handle,
    targetId: targetRes.data?.id ?? null,
    hasPending: !!pendingRes.data,
  });
  if (invalid) return NextResponse.json({ error: invalid.error }, { status: invalid.status });
  const targetId = targetRes.data!.id;

  const { data, error } = await supabase
    .from('project_ownership_transfers')
    .insert({ project_id: id, from_user: user.id, to_user: targetId, status: 'pending' })
    .select('id, created_at')
    .single();
  if (error) {
    // Carrera con otra pestaña: el índice único parcial frena la 2ª pendiente.
    if (error.code === '23505') return NextResponse.json({ error: 'Ya hay una transferencia pendiente: cancelala primero' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dos canales, cada uno best-effort por separado.
  await notify({ recipientId: targetId, actorId: user.id, type: 'ownership_transfer', entityId: id });
  try {
    const { data: { user: recipient } } = await createAdminClient().auth.admin.getUserById(targetId);
    if (recipient?.email) {
      await sendEmail({
        to: recipient.email,
        subject: `Te quieren transferir "${project.name}"`,
        html: `<p>Te quieren transferir la propiedad de <strong>${escapeHtml(project.name)}</strong>.</p>
          <p>Entrá a tus proyectos (/admin/proyectos) para aceptar o rechazar la transferencia.</p>`,
      });
    }
  } catch (err) {
    console.error('[transfer] no se pudo enviar el email', err);
  }

  return NextResponse.json({ pending: { id: data.id, created_at: data.created_at } }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { minRole: 'dueño' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  // updated_at no lo mantiene un trigger: se setea acá. from_user = yo porque
  // la RLS también lo exige (y evita tocar una transferencia de otra dueña).
  const { data, error } = await supabase
    .from('project_ownership_transfers')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('project_id', id)
    .eq('from_user', user.id)
    .eq('status', 'pending')
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'No hay una transferencia pendiente' }, { status: 404 });
  return NextResponse.json({ success: true });
}
