// Un turno de la IA: bucle manual de herramientas contra la Messages API.
// Sin imports de next/react: corre con tsx fuera de Next.
import Anthropic from '@anthropic-ai/sdk';
import { ejecutarHerramienta, HERRAMIENTAS, type DepsHerramientas } from './herramientas';
import { sumarUso, USO_VACIO, type UsoTurno } from './uso';

export const MODELO = 'claude-opus-5-5';
/** Llamadas a la API por turno, como mucho. */
export const MAX_ITERACIONES = 6;

export type MotivoSinRespuesta = 'refusal' | 'error' | 'max_iteraciones';
export type ResultadoTurno = {
  texto: string | null;
  motivoSinRespuesta?: MotivoSinRespuesta;
  /** Tokens de todas las llamadas del turno (para medir el costo, ver uso.ts). */
  uso?: UsoTurno;
};

type Cliente = Pick<Anthropic, 'beta'>;

function llamar(
  cliente: Cliente,
  system: Anthropic.Beta.BetaTextBlockParam[],
  messages: Anthropic.Beta.BetaMessageParam[],
  tools: Anthropic.Beta.BetaToolUnion[],
  signal?: AbortSignal,
): Promise<Anthropic.Beta.BetaMessage> {
  return cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    tools,
    // Caché automática del historial: las iteraciones del bucle reusan el prefijo.
    cache_control: { type: 'ephemeral' },
    messages,
  }, signal ? { signal } : undefined);
}

/** Errores de la API (incluye rate limit, 5xx y conexión): 1 reintento. */
async function llamarConReintento(
  cliente: Cliente,
  system: Anthropic.Beta.BetaTextBlockParam[],
  messages: Anthropic.Beta.BetaMessageParam[],
  tools: Anthropic.Beta.BetaToolUnion[],
  signal?: AbortSignal,
): Promise<Anthropic.Beta.BetaMessage | null> {
  for (let intento = 0; intento < 2; intento++) {
    // Se acabó el tiempo del turno (ver `signal` en responderTurno): no reintentar.
    if (signal?.aborted) return null;
    try {
      return await llamar(cliente, system, messages, tools, signal);
    } catch (e) {
      if (signal?.aborted) return null;
      if (!(e instanceof Anthropic.APIError)) throw e;
      console.error(`[whatsapp-bot] error de la API de Claude (intento ${intento + 1}):`, e.message);
    }
  }
  return null;
}

export async function responderTurno(i: {
  cliente: Cliente;
  system: Anthropic.Beta.BetaTextBlockParam[];
  mensajes: Anthropic.Beta.BetaMessageParam[];
  deps: DepsHerramientas;
  /**
   * Límite del turno entero (todas las iteraciones). El simulador del panel lo
   * usa para terminar antes del maxDuration de la función en Vercel; al
   * vencer, el turno termina sin respuesta ('error').
   */
  signal?: AbortSignal;
  /** Herramientas del canal (el chat web usa HERRAMIENTAS_WEB); default, las de WhatsApp. */
  herramientas?: Anthropic.Beta.BetaToolUnion[];
}): Promise<ResultadoTurno> {
  const tools = i.herramientas ?? HERRAMIENTAS;
  const historial = [...i.mensajes];
  // Sin prefill en este modelo: el último mensaje tiene que ser del cliente.
  if (historial.length === 0 || historial[historial.length - 1].role !== 'user') {
    return { texto: null, motivoSinRespuesta: 'error' };
  }

  let uso: UsoTurno = USO_VACIO;
  for (let n = 0; n < MAX_ITERACIONES; n++) {
    const r = await llamarConReintento(i.cliente, i.system, [...historial], tools, i.signal);
    if (!r) return { texto: null, motivoSinRespuesta: 'error', uso };
    uso = sumarUso(uso, r);

    switch (r.stop_reason) {
      case 'refusal':
        return { texto: null, motivoSinRespuesta: 'refusal', uso };

      case 'end_turn':
      case 'stop_sequence':
      case 'max_tokens': {
        const texto = r.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map(b => b.text)
          .join('')
          .trim();
        return { texto: texto || null, uso };
      }

      case 'pause_turn':
        historial.push({ role: 'assistant', content: r.content });
        continue;

      case 'tool_use': {
        const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        if (usos.length === 0) return { texto: null, motivoSinRespuesta: 'error', uso };
        // Se reenvía el contenido completo (incluye los bloques thinking).
        historial.push({ role: 'assistant', content: r.content });
        // En orden: encolar imágenes y avisar tienen efectos que conviene no cruzar.
        const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const u of usos) {
          const res = await ejecutarHerramienta(u.name, u.input, i.deps);
          resultados.push({ type: 'tool_result', tool_use_id: u.id, content: res.texto, is_error: res.esError });
        }
        historial.push({ role: 'user', content: resultados });
        continue;
      }

      default:
        return { texto: null, motivoSinRespuesta: 'error', uso };
    }
  }
  return { texto: null, motivoSinRespuesta: 'max_iteraciones', uso };
}
