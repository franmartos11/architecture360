import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseJsonBody } from '@/lib/api-validate';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { parseCustomHostname, MAX_DOMAINS_PER_PROJECT, isExpiredPending } from '@/lib/custom-domain';
import { addDomain, getDomainState, removeDomain, vercelDomainsConfigured, VercelDomainError, DOMAIN_TAKEN_CODES } from '@/lib/vercel-domains';

// Dominios propios de un proyecto (ver project_domains en supabase/schema.sql).
// La tabla no tiene policy de escritura para el dueño a propósito: el alta y la
// activación pasan SIEMPRE por acá, con service-role, después de chequear la
// propiedad del proyecto y de verificar el DNS contra Vercel.

const bodySchema = z.object({ hostname: z.string().max(300) });

/**
 * Si el hostname está tomado por una reserva pendiente vencida, la borra (y
 * quita el dominio de Vercel, que lo agregó esa alta) para que otro pueda
 * usarlo. Devuelve si liberó algo.
 */
async function liberarSiVencido(admin: ReturnType<typeof createAdminClient>, hostname: string): Promise<boolean> {
  const { data } = await admin.from('project_domains').select('id, status, created_at').eq('hostname', hostname).maybeSingle();
  const previo = data as { id: string; status: string; created_at: string } | null;
  if (!previo || !isExpiredPending(previo)) return false;
  // Primero Vercel: si falla, la reserva queda y el dominio no se pierde a medias.
  try {
    await removeDomain(hostname);
  } catch (err) {
    console.error('[domains] no se pudo quitar de Vercel el pendiente vencido', hostname, err);
    return false;
  }
  const { error } = await admin.from('project_domains').delete().eq('id', previo.id).eq('status', 'pending');
  return !error;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { minRole: 'dueño' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await access.supabase
    .from('project_domains')
    .select('id, hostname, status, vercel_verification, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[domains] no se pudo listar', error);
    return NextResponse.json({ error: 'No se pudieron cargar los dominios.' }, { status: 500 });
  }
  return NextResponse.json({ domains: data ?? [], automatic: vercelDomainsConfigured() });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { minRole: 'dueño' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond(
    { key: `domains:user:${access.user.id}`, windowSeconds: 3600, max: 20 },
    'Agregaste muchos dominios seguidos — probá de nuevo en un rato.'
  );
  if (limited) return limited;

  if (!vercelDomainsConfigured()) {
    return NextResponse.json({ error: 'El alta automática de dominios no está configurada todavía.' }, { status: 503 });
  }

  const parsed = await parseJsonBody(request, bodySchema);
  if ('error' in parsed) return parsed.error;
  const host = parseCustomHostname(parsed.data.hostname);
  if ('error' in host) return NextResponse.json({ error: host.error }, { status: 400 });

  const { count } = await access.supabase
    .from('project_domains')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id);
  if ((count ?? 0) >= MAX_DOMAINS_PER_PROJECT) {
    return NextResponse.json({ error: `Un proyecto puede tener hasta ${MAX_DOMAINS_PER_PROJECT} dominios.` }, { status: 400 });
  }

  // 1) Reservar el hostname en la base: la unicidad la impone la tabla, así que
  //    dos proyectos no pueden quedarse con el mismo dominio aunque pidan a la vez.
  const admin = createAdminClient();
  const reservar = () =>
    admin
      .from('project_domains')
      .insert({ project_id: id, hostname: host.hostname })
      .select('id, hostname, status, vercel_verification, created_at')
      .single();
  let { data: row, error: insertError } = await reservar();
  // Ya reservado: si es una reserva pendiente vencida (ver PENDING_TTL_DAYS), se
  // libera acá mismo y se reintenta una vez; si no, está en uso de verdad.
  if (insertError?.code === '23505' && (await liberarSiVencido(admin, host.hostname))) {
    ({ data: row, error: insertError } = await reservar());
  }
  if (insertError || !row) {
    if (insertError?.code === '23505') {
      return NextResponse.json({ error: 'Ese dominio ya está en uso en otro proyecto.' }, { status: 409 });
    }
    console.error('[domains] no se pudo guardar', insertError);
    return NextResponse.json({ error: 'No se pudo agregar el dominio.' }, { status: 500 });
  }

  // 2) Recién ahora, Vercel. Si falla, se deshace la reserva, y si Vercel ya lo
  //    había aceptado, también se lo quita de ahí (si no, queda colgado en el
  //    proyecto de Vercel y un reintento lo tomaría por un dominio ajeno).
  let added = false;
  try {
    await addDomain(host.hostname);
    added = true;
    const state = await getDomainState(host.hostname);
    const verification = { records: state.verification, misconfigured: state.misconfigured };
    await admin.from('project_domains').update({ vercel_verification: verification }).eq('id', row.id);
    return NextResponse.json({ domain: { ...row, vercel_verification: verification } }, { status: 201 });
  } catch (err) {
    console.error('[domains] Vercel rechazó el alta', host.hostname, err);
    await admin.from('project_domains').delete().eq('id', row.id);
    if (added) await removeDomain(host.hostname).catch(e => console.error('[domains] no se pudo deshacer el alta en Vercel', host.hostname, e));
    if (err instanceof VercelDomainError && (DOMAIN_TAKEN_CODES as readonly string[]).includes(err.code ?? '')) {
      return NextResponse.json({ error: 'Ese dominio ya está configurado en otro sitio. Si es tuyo, escribinos para liberarlo.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo agregar el dominio en el servidor. Probá de nuevo en un rato.' }, { status: 502 });
  }
}
