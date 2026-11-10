import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/api-validate';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { getDomainState, removeDomain, requestVerification, vercelDomainsConfigured } from '@/lib/vercel-domains';

type Ctx = { params: Promise<{ id: string; domainId: string }> };

async function loadDomain(access: NonNullable<Awaited<ReturnType<typeof requireProjectAccess>>>, projectId: string, domainId: string) {
  if (!uuidSchema.safeParse(domainId).success) return null;
  const { data } = await access.supabase
    .from('project_domains')
    .select('id, hostname, status')
    .eq('id', domainId)
    .eq('project_id', projectId) // que el dominio sea DE ESTE proyecto, no solo que exista
    .maybeSingle();
  return data as { id: string; hostname: string; status: string } | null;
}

// POST = "Verificar": consulta a Vercel y, si el dominio es del dueño y el DNS
// ya apunta bien, lo pasa a 'active' (a partir de ahí lo resuelve el proxy).
export async function POST(_request: Request, { params }: Ctx) {
  const { id, domainId } = await params;
  const access = await requireProjectAccess(id, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond(
    { key: `domains-verify:user:${access.user.id}`, windowSeconds: 60, max: 12 },
    'Verificaste muchas veces seguidas — esperá un minuto.'
  );
  if (limited) return limited;

  if (!vercelDomainsConfigured()) {
    return NextResponse.json({ error: 'La verificación automática no está configurada todavía.' }, { status: 503 });
  }
  const domain = await loadDomain(access, id, domainId);
  if (!domain) return NextResponse.json({ error: 'Dominio no encontrado' }, { status: 404 });

  try {
    let state = await getDomainState(domain.hostname);
    if (!state.verified) {
      await requestVerification(domain.hostname).catch(() => {}); // todavía puede no estar el TXT: no es un error
      state = await getDomainState(domain.hostname);
    }
    const status = state.verified && !state.misconfigured ? 'active' : state.verified ? 'verified' : 'pending';
    const verification = { records: state.verification, misconfigured: state.misconfigured };
    const { error } = await createAdminClient()
      .from('project_domains')
      .update({ status, vercel_verification: verification })
      .eq('id', domain.id);
    if (error) throw error;
    return NextResponse.json({ status, misconfigured: state.misconfigured, records: state.verification });
  } catch (err) {
    console.error('[domains] no se pudo verificar', domain.hostname, err);
    return NextResponse.json({ error: 'No se pudo verificar el dominio ahora. Probá de nuevo en un rato.' }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, domainId } = await params;
  const access = await requireProjectAccess(id, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const domain = await loadDomain(access, id, domainId);
  if (!domain) return NextResponse.json({ error: 'Dominio no encontrado' }, { status: 404 });

  // Primero Vercel: si falla, la fila queda y el dueño puede reintentar. Al
  // revés quedaría un dominio huérfano en Vercel que ya nadie administra.
  if (vercelDomainsConfigured()) {
    try {
      await removeDomain(domain.hostname);
    } catch (err) {
      console.error('[domains] Vercel no pudo quitar', domain.hostname, err);
      return NextResponse.json({ error: 'No se pudo quitar el dominio en el servidor. Probá de nuevo en un rato.' }, { status: 502 });
    }
  }
  const { error } = await createAdminClient().from('project_domains').delete().eq('id', domain.id);
  if (error) {
    console.error('[domains] no se pudo borrar', error);
    return NextResponse.json({ error: 'No se pudo quitar el dominio.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
