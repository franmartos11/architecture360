import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseJsonBody } from '@/lib/api-validate';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { parseCustomHostname, MAX_DOMAINS_PER_PROJECT } from '@/lib/custom-domain';
import { addDomain, getDomainState, vercelDomainsConfigured } from '@/lib/vercel-domains';

// Dominios propios de un proyecto (ver project_domains en supabase/schema.sql).
// La tabla no tiene policy de escritura para el dueño a propósito: el alta y la
// activación pasan SIEMPRE por acá, con service-role, después de chequear la
// propiedad del proyecto y de verificar el DNS contra Vercel.

const bodySchema = z.object({ hostname: z.string().max(300) });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
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
  const access = await requireProjectAccess(id);
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
  const { data: row, error: insertError } = await admin
    .from('project_domains')
    .insert({ project_id: id, hostname: host.hostname })
    .select('id, hostname, status, vercel_verification, created_at')
    .single();
  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Ese dominio ya está en uso en otro proyecto.' }, { status: 409 });
    }
    console.error('[domains] no se pudo guardar', insertError);
    return NextResponse.json({ error: 'No se pudo agregar el dominio.' }, { status: 500 });
  }

  // 2) Recién ahora, Vercel. Si falla, se deshace la reserva.
  try {
    await addDomain(host.hostname);
    const state = await getDomainState(host.hostname);
    const verification = { records: state.verification, misconfigured: state.misconfigured };
    await admin.from('project_domains').update({ vercel_verification: verification }).eq('id', row.id);
    return NextResponse.json({ domain: { ...row, vercel_verification: verification } }, { status: 201 });
  } catch (err) {
    console.error('[domains] Vercel rechazó el alta', host.hostname, err);
    await admin.from('project_domains').delete().eq('id', row.id);
    return NextResponse.json({ error: 'No se pudo agregar el dominio en el servidor. Probá de nuevo en un rato.' }, { status: 502 });
  }
}
