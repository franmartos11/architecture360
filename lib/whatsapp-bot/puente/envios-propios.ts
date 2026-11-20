// Qué mensajes "deMi" mandó el propio puente (la cola) y cuáles se escribieron
// desde el celular del número. whatsapp-web.js puede emitir message_create del
// envío ANTES de que resuelva sendMessage (todavía no se sabe su waId), así que
// además de los waId conocidos se recuerdan los envíos en curso: destino y
// contenido. Un deMi que coincide con uno de ellos es el eco de la cola.
// Solo memoria (por bot); un reinicio del puente a mitad de un envío puede, en
// el peor caso, guardar un eco como 'telefono'.
import { normalizarTelefono } from '../reglas';
import type { MensajeEntrante } from './mensaje';

/** Cuánto se espera el eco de un envío ya terminado (sin waId, o el evento llega tarde). */
const GRACIA_MS = 2 * 60_000;
/** Cuánto se recuerda un waId mandado por la cola. */
const WAID_MS = 60 * 60_000;

type EnvioEnCurso = {
  destino: string;
  numero: string | null;
  cuerpo: string | null;
  adjunto: boolean;
  /** null mientras sendMessage no resolvió. */
  terminadoAt: number | null;
};

export class EnviosPropios {
  private readonly waIds = new Map<string, number>();
  private readonly enCurso = new Set<EnvioEnCurso>();

  constructor(private readonly ahora: () => number = () => Date.now()) {}

  registrarWaId(waId: string): void {
    if (!waId) return;
    const t = this.ahora();
    this.waIds.set(waId, t);
    for (const [w, at] of this.waIds) {
      if (t - at > WAID_MS) this.waIds.delete(w);
    }
  }

  esDeLaCola(waId: string): boolean {
    return Boolean(waId) && this.waIds.has(waId);
  }

  /** Antes de mandar. Devuelve la función que se llama al terminar (haya salido o no). */
  empezar(destino: string, contenido: { cuerpo: string | null; adjunto: boolean }): () => void {
    const e: EnvioEnCurso = {
      destino,
      numero: normalizarTelefono(destino),
      cuerpo: contenido.cuerpo?.trim() ?? null,
      adjunto: contenido.adjunto,
      terminadoAt: null,
    };
    this.enCurso.add(e);
    return () => {
      e.terminadoAt = this.ahora();
    };
  }

  /** ¿Este deMi es el eco de un envío de la cola? Cada envío reconoce un solo eco. */
  esEnvioEnCurso(m: MensajeEntrante): boolean {
    const t = this.ahora();
    const numero = m.numero ? normalizarTelefono(m.numero) : null;
    for (const e of this.enCurso) {
      if (e.terminadoAt !== null && t - e.terminadoAt > GRACIA_MS) {
        this.enCurso.delete(e);
        continue;
      }
      const mismoChat = e.destino === m.wid || (e.numero !== null && e.numero === numero);
      if (!mismoChat) continue;
      // Una imagen (o un plano en PDF) llega como medio: imagen, documento u otro.
      const mismoContenido = e.adjunto ? m.tipo !== 'texto' : m.tipo === 'texto' && m.cuerpo === e.cuerpo;
      if (!mismoContenido) continue;
      this.enCurso.delete(e);
      return true;
    }
    return false;
  }
}
