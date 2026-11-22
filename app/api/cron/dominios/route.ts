import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PENDING_TTL_DAYS } from '@/lib/custom-domain';
import { getDomainState, removeDomain, vercelDomainsConfigured } from '@/lib/vercel-domains';

// Revisión diaria de los dominios propios (vercel.json → crons). Vercel la
// llama con "Authorization: Bearer <CRON_SECRET>" cuando esa variable está
// configurada; sin ella la ruta no hace nada, para que nadie de afuera pueda
// dispararla.
//
// 1. Reservas 'pending' vencidas (PENDING_TTL_DAYS): se quitan de Vercel y de
//    la base, así nadie deja tomado un dominio ajeno para siempre.
// 2. Dominios 'active': se vuelven a consultar en Vercel. Si el DNS dejó de
//    apuntar acá, pasan a 'verified' (dejan de servirse y de valer como origen
//    del CORS); si Vercel ya no los da por verificados, a 'pending'. Un error
//    de la API de Vercel no cambia nada: solo cuenta una respuesta concreta.
export const maxDuration = 60;

const MAX_POR_CORRIDA = 100;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!vercelDomainsConfigured()) return NextResponse.json({ omitido: 'Vercel no configurado' });

  const admin = createAdminClient();
  const resultado = { vencidos: 0, desactivados: 0, revisados: 0, errores: 0 };

  const limite = new Date(Date.now() - PENDING_TTL_DAYS * 86_400_000).toISOString();
  const { data: vencidos, error: errVencidos } = await admin
    .from('project_domains')
    .select('id, hostname')
    .eq('status', 'pending')
    .lt('created_at', limite)
    .limit(MAX_POR_CORRIDA);
  if (errVencidos) console.error('[cron dominios] no se pudieron leer los pendientes', errVencidos);
  for (const d of (vencidos ?? []) as { id: string; hostname: string }[]) {
    try {
      await removeDomain(d.hostname);
      const { error } = await admin.from('project_domains').delete().eq('id', d.id).eq('status', 'pending');
      if (error) throw error;
      resultado.vencidos++;
    } catch (err) {
      resultado.errores++;
      console.error('[cron dominios] no se pudo liberar', d.hostname, err);
    }
  }

  const { data: activos, error: errActivos } = await admin
    .from('project_domains')
    .select('id, hostname')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(MAX_POR_CORRIDA);
  if (errActivos) console.error('[cron dominios] no se pudieron leer los activos', errActivos);
  for (const d of (activos ?? []) as { id: string; hostname: string }[]) {
    try {
      const estado = await getDomainState(d.hostname);
      resultado.revisados++;
      const nuevo = !estado.verified ? 'pending' : estado.misconfigured ? 'verified' : null;
      if (!nuevo) continue;
      const { error } = await admin
        .from('project_domains')
        .update({ status: nuevo, vercel_verification: { records: estado.verification, misconfigured: estado.misconfigured } })
        .eq('id', d.id)
        .eq('status', 'active');
      if (error) throw error;
      resultado.desactivados++;
      console.warn(`[cron dominios] ${d.hostname} dejó de estar activo (${nuevo})`);
    } catch (err) {
      resultado.errores++;
      console.error('[cron dominios] no se pudo revisar', d.hostname, err);
    }
  }

  return NextResponse.json(resultado);
}
