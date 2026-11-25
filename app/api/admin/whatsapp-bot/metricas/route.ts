import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import {
  conversion,
  costoWebUsd,
  RANGOS_METRICAS,
  resumenCostoIa,
  type FilaUsoIa,
  serieDiaria,
  unidadesMasPedidas,
  type MetricasBot,
} from '@/lib/whatsapp-bot/metricas';

const MAX_FILAS = 5000;

/** Resultados del bot en los últimos N días (administrador en adelante). */
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const pedido = Number(new URL(request.url).searchParams.get('dias'));
  const dias = (RANGOS_METRICAS as readonly number[]).includes(pedido) ? pedido : 30;
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - dias * 24 * 3_600_000).toISOString();

  // Cada número por separado: si una tabla o columna todavía no existe
  // (schema.sql sin aplicar), ese número queda en null y el resto se muestra.
  const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> => {
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  };
  const cabeza = { count: 'exact' as const, head: true };

  const mensajes = (autor: string) =>
    contar(
      supabase
        .from('wa_mensajes')
        .select('id, wa_conversaciones!inner(project_id)', cabeza)
        .eq('wa_conversaciones.project_id', projectId)
        .eq('wa_conversaciones.canal', 'whatsapp')
        .eq('autor', autor)
        .gte('enviado_at', desde),
    );

  // Las métricas del bot son de WhatsApp; el chat del sitio va en su propio bloque.
  const [conversacionesRes, mensajesClientes, respuestasBot, leadsRes, leadsCalientes, visitasAgendadas, visitasRealizadas, preguntasPendientes, usoRes, charlasWeb, contactosWeb] =
    await Promise.all([
      supabase.from('wa_conversaciones').select('created_at').eq('project_id', projectId).eq('canal', 'whatsapp').gte('created_at', desde).limit(MAX_FILAS),
      mensajes('cliente'),
      mensajes('bot'),
      supabase.from('leads').select('unit_name').eq('project_id', projectId).eq('source', 'whatsapp_bot').gte('created_at', desde).limit(MAX_FILAS),
      contar(
        supabase
          .from('leads')
          .select('id', cabeza)
          .eq('project_id', projectId)
          .eq('source', 'whatsapp_bot')
          .eq('calificacion->>temperatura', 'caliente')
          .gte('created_at', desde),
      ),
      contar(supabase.from('wa_visitas').select('id', cabeza).eq('project_id', projectId).gte('created_at', desde)),
      contar(
        supabase.from('wa_visitas').select('id', cabeza).eq('project_id', projectId).eq('estado', 'realizada').gte('inicio', desde),
      ),
      contar(supabase.from('wa_preguntas').select('id', cabeza).eq('project_id', projectId).eq('estado', 'pendiente')),
      supabase
        .from('wa_uso_ia')
        .select('origen, conversacion_id, modelo, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
        .eq('project_id', projectId)
        .gte('created_at', desde)
        .limit(MAX_FILAS * 4),
      contar(supabase.from('wa_conversaciones').select('id', cabeza).eq('project_id', projectId).eq('canal', 'web').gte('created_at', desde)),
      contar(supabase.from('leads').select('id', cabeza).eq('project_id', projectId).eq('source', 'chat_web').gte('created_at', desde)),
    ]);

  const creadas = conversacionesRes.error ? null : ((conversacionesRes.data ?? []) as { created_at: string }[]).map((c) => c.created_at);
  const leads = leadsRes.error ? null : ((leadsRes.data ?? []) as { unit_name: string | null }[]);
  const conversaciones = creadas ? creadas.length : null;

  const m: MetricasBot = {
    dias,
    conversaciones,
    mensajesClientes,
    respuestasBot,
    leads: leads ? leads.length : null,
    leadsCalientes,
    visitasAgendadas,
    visitasRealizadas,
    preguntasPendientes,
    conversion: conversion(leads ? leads.length : null, conversaciones),
    porDia: serieDiaria(creadas ?? [], dias, ahora),
    unidades: unidadesMasPedidas((leads ?? []).map((l) => l.unit_name)),
    costoIa: usoRes.error ? null : resumenCostoIa((usoRes.data ?? []) as FilaUsoIa[]),
    web: {
      charlas: charlasWeb,
      contactos: contactosWeb,
      costoUsd: usoRes.error ? null : costoWebUsd((usoRes.data ?? []) as FilaUsoIa[]),
    },
  };
  return NextResponse.json(m);
}
