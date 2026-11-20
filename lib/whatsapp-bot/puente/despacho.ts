// Despacho de wa_salida (spec §7.6): un ítem por vez, por bot, con las
// medidas anti-bloqueo (marcar leído, "escribiendo…" proporcional al largo,
// pausa de 1–3 s entre ítems). El aviso al vendedor sale directo.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaAutor, WaSalida } from '@/types/whatsapp-bot';
import type * as Repo from '../repo';
import { MAX_INTENTOS_ENVIO } from '../repo';
import { msEscribiendo } from '../reglas';
import type { SesionBot } from './sesion';
import type { EnSerie } from './serie';
import { EnvioImposible, EnvioIncierto } from './tope';

const PAUSA_MIN_MS = 1000;
const PAUSA_MAX_MS = 3000;
/** Esperas entre intentos de registrar en la base algo que ya salió (4 intentos en total). */
const ESPERAS_REGISTRO_MS = [1000, 3000, 9000];

export type ResultadoDespacho = 'enviado' | 'vacio' | 'fallo' | 'descartado';

export type DepsDespacho = {
  sb: SupabaseClient;
  repo: Pick<typeof Repo, 'tomarSiguienteSalida' | 'registrarSalidaEnviada' | 'marcarFallo' | 'sumarMensajeDelDia'>;
  sesion: Pick<SesionBot, 'enviarTexto' | 'enviarImagen' | 'escribiendo' | 'marcarLeido'>;
  esperar(ms: number): Promise<void>;
  /** Número en [0, 1) (Math.random). */
  azar(): number;
  /** Recuerda el waId de lo que mandó la cola (recepción lo ignora). */
  registrarWaId(waId: string): void;
  /** Registro de envíos en curso: el eco de un envío puede llegar antes de saber su waId. */
  envios?: { empezar(destino: string, contenido: { cuerpo: string | null; adjunto: boolean }): () => void };
  /** Serializa las escrituras de una misma conversación. */
  enSerie?: EnSerie;
  log?: (m: string) => void;
};

const AUTOR: Record<WaSalida['origen'], WaAutor> = { bot: 'bot', vendedor: 'vendedor', aviso: 'bot' };

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Toma el próximo ítem de la cola del bot y lo manda.
 * - 'vacio': no había nada para mandar.
 * - 'descartado': nunca va a poder salir (EnvioImposible: un adjunto
 *   rechazado); pasa a 'error' sin reintentos y la cola sigue.
 * - 'fallo': WhatsApp no lo mandó; queda para reintentar (marcarFallo, hasta 5
 *   intentos). Si sendMessage no volvió a tiempo (EnvioIncierto) pudo haber
 *   salido: no se marca fallo y queda 'enviando'; a los 2 min tomarSiguienteSalida
 *   lo retoma como colgado (si no hay registro en wa_mensajes lo reenvía: se
 *   acepta un duplicado raro antes que perder la respuesta).
 * - 'enviado': salió. El registro en la base (registrarSalidaEnviada) se
 *   reintenta 3 veces más (1, 3 y 9 s); si aun así falla NO se marca fallo y el
 *   ítem queda 'enviando'. Ojo: tomarSiguienteSalida solo lo da por enviado si
 *   llegó a existir la fila en wa_mensajes; si no, a los 2 min lo reenvía.
 */
export async function despacharUno(deps: DepsDespacho, botId: string): Promise<ResultadoDespacho> {
  const log = deps.log ?? ((t: string) => console.error(t));
  const s = await deps.repo.tomarSiguienteSalida(deps.sb, botId);
  if (!s) return 'vacio';

  const destino = s.destino;
  const adjunto = Boolean(s.adjunto_url);
  let waId: string;
  let terminar: (() => void) | undefined;
  try {
    if (s.origen !== 'aviso') {
      await deps.sesion.marcarLeido(destino);
      await deps.sesion.escribiendo(destino, msEscribiendo(adjunto ? '' : (s.cuerpo ?? '')));
    }
    terminar = deps.envios?.empezar(destino, { cuerpo: adjunto ? null : s.cuerpo, adjunto });
    waId = s.adjunto_url
      ? await deps.sesion.enviarImagen(destino, s.adjunto_url)
      : await deps.sesion.enviarTexto(destino, s.cuerpo ?? '');
    // Antes de tocar la base: el eco del envío puede llegar en cualquier momento.
    if (waId) deps.registrarWaId(waId);
  } catch (e) {
    terminar?.();
    if (e instanceof EnvioIncierto) {
      log(`[despacho] no sé si el ítem ${s.id} salió (${e.message}): queda para el reclamo de colgados`);
      return 'fallo';
    }
    if (e instanceof EnvioImposible) {
      // Nunca va a salir (adjunto rechazado): a 'error' de una, sin reintentos.
      log(`[despacho] el ítem ${s.id} no se puede mandar: ${e.message}`);
      await deps.repo.marcarFallo(deps.sb, s.id, Math.max(MAX_INTENTOS_ENVIO, s.intentos + 1), mensajeDe(e));
      // No es que WhatsApp ande mal: la vuelta sigue con el próximo ítem.
      return 'descartado';
    }
    await deps.repo.marcarFallo(deps.sb, s.id, s.intentos + 1, mensajeDe(e));
    return 'fallo';
  }
  terminar?.();

  const registrar = () => deps.repo.registrarSalidaEnviada(deps.sb, s, waId || null, AUTOR[s.origen]);
  for (let intento = 0; ; intento++) {
    try {
      // Cada intento en la serie de la conversación (las esperas, afuera).
      await (s.conversacion_id && deps.enSerie ? deps.enSerie(s.conversacion_id, registrar) : registrar());
      break;
    } catch (e) {
      if (intento >= ESPERAS_REGISTRO_MS.length) {
        log(`[despacho] el ítem ${s.id} salió pero no se pudo registrar: ${mensajeDe(e)}`);
        break;
      }
      await deps.esperar(ESPERAS_REGISTRO_MS[intento]);
    }
  }
  if (s.origen === 'bot') {
    try {
      await deps.repo.sumarMensajeDelDia(deps.sb, { id: botId });
    } catch (e) {
      log(`[despacho] no pude sumar al contador diario del bot ${botId}: ${mensajeDe(e)}`);
    }
  }
  await deps.esperar(PAUSA_MIN_MS + Math.floor(deps.azar() * (PAUSA_MAX_MS - PAUSA_MIN_MS)));
  return 'enviado';
}

/**
 * Un despachador por bot: corre `ronda` (despacharUno) en serie hasta vaciar
 * la cola. Un pulso (Realtime, sondeo, conexión) durante una vuelta no abre
 * otra en paralelo: hace que se repita al terminar. Ante un 'fallo' corta la
 * vuelta (WhatsApp anda mal; el próximo pulso reintenta).
 */
export class Despachador {
  private vuelta: Promise<void> | null = null;
  private otraVez = false;

  constructor(
    private readonly ronda: () => Promise<ResultadoDespacho>,
    private readonly puede: () => boolean,
    private readonly log: (m: string) => void = (m) => console.error(m),
  ) {}

  pulsar(): Promise<void> {
    if (this.vuelta) {
      this.otraVez = true;
      return this.vuelta;
    }
    this.vuelta = this.correr().finally(() => {
      this.vuelta = null;
    });
    return this.vuelta;
  }

  private async correr(): Promise<void> {
    do {
      this.otraVez = false;
      try {
        while (this.puede()) {
          const r = await this.ronda();
          if (r !== 'enviado' && r !== 'descartado') break;
        }
      } catch (e) {
        this.log(`[despacho] falló una vuelta: ${mensajeDe(e)}`);
        return;
      }
    } while (this.otraVez && this.puede());
  }
}
