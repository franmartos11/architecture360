// Preguntas que el bot no supo responder (tabla wa_preguntas): el puente las
// anota agrupadas por tema y las respondidas vuelven a la ficha como
// preguntas frecuentes. Cliente inyectado (service role en el puente).
// Sin imports de next/react: corre con tsx fuera de Next.
import type { SupabaseClient } from '@supabase/supabase-js';

export type PreguntaFrecuente = { pregunta: string; respuesta: string };

/** Tope de pendientes por proyecto: que un cliente insistente no llene la lista. */
export const MAX_PENDIENTES = 200;
/** Preguntas frecuentes que entran a la ficha, como mucho. */
export const MAX_FAQ = 100;

/** Clave del tema: sin tildes, minúsculas, sin signos y con espacios simples. */
export function temaClave(tema: string): string {
  return tema
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * La tabla todavía no existe (schema.sql sin aplicar): el bot sigue andando
 * sin preguntas frecuentes en vez de caerse. Así el código y la base se
 * pueden desplegar en cualquier orden.
 */
export function esTablaFaltante(
  e: { code?: string; message?: string } | null | undefined,
  tabla = 'wa_preguntas',
): boolean {
  if (!e) return false;
  const msg = e.message ?? '';
  return e.code === '42P01' || e.code === 'PGRST205' || (msg.includes(tabla) && /does not exist|schema cache/i.test(msg));
}

export async function cargarFaq(sb: SupabaseClient, projectId: string): Promise<PreguntaFrecuente[]> {
  const { data, error } = await sb
    .from('wa_preguntas')
    .select('pregunta, respuesta')
    .eq('project_id', projectId)
    .eq('estado', 'respondida')
    .order('created_at')
    .limit(MAX_FAQ);
  if (error) {
    if (esTablaFaltante(error)) return [];
    throw new Error(`No se pudieron leer las preguntas frecuentes: ${error.message}`);
  }
  return (data ?? [])
    .filter((f): f is PreguntaFrecuente => !!f.pregunta && !!f.respuesta?.trim())
    .map(f => ({ pregunta: f.pregunta, respuesta: f.respuesta.trim() }));
}

export type PreguntaNueva = { projectId: string; conversacionId: string | null; tema: string; pregunta: string };

/** Anota una pregunta sin respuesta. Si el tema ya estaba, suma una vez y guarda la última forma. */
export async function registrarPregunta(
  sb: SupabaseClient,
  d: PreguntaNueva,
  ahora: () => Date = () => new Date(),
): Promise<'nueva' | 'repetida' | 'omitida'> {
  const tema = d.tema.trim().slice(0, 120);
  const clave = temaClave(tema);
  const pregunta = d.pregunta.trim().slice(0, 1000);
  if (!clave || !pregunta) return 'omitida';

  const sumar = async (): Promise<boolean> => {
    const { data: ex, error } = await sb
      .from('wa_preguntas')
      .select('id, veces')
      .eq('project_id', d.projectId)
      .eq('tema_clave', clave)
      .maybeSingle();
    if (error) throw error;
    if (!ex) return false;
    const { error: e2 } = await sb
      .from('wa_preguntas')
      .update({ veces: ex.veces + 1, pregunta, ultima_at: ahora().toISOString(), conversacion_id: d.conversacionId })
      .eq('id', ex.id);
    if (e2) throw e2;
    return true;
  };

  try {
    if (await sumar()) return 'repetida';
    const { count, error: eCount } = await sb
      .from('wa_preguntas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', d.projectId)
      .eq('estado', 'pendiente');
    if (eCount) throw eCount;
    if ((count ?? 0) >= MAX_PENDIENTES) return 'omitida';
    const { error: eIns } = await sb.from('wa_preguntas').insert({
      project_id: d.projectId,
      tema,
      tema_clave: clave,
      pregunta,
      conversacion_id: d.conversacionId,
    });
    if (!eIns) return 'nueva';
    // Otro turno la creó recién: se suma a esa.
    if (eIns.code === '23505' && (await sumar())) return 'repetida';
    throw eIns;
  } catch (e) {
    if (esTablaFaltante(e as { code?: string; message?: string })) return 'omitida';
    throw new Error(`No se pudo anotar la pregunta: ${(e as { message?: string }).message ?? String(e)}`);
  }
}
