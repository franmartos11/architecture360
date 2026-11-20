// Una sesión de WhatsApp Web (el número de un bot) dentro del puente: el ciclo
// de vida del Client de whatsapp-web.js, su salud y los envíos. No toca la
// base: avisa lo que pasa por los handlers y el bucle del puente decide.
// Reducida de aspa-software (lib/whatsapp/bridge/session.ts): sin índice de
// contactos, tandas, verificación, propuestas ni voz.
import QRCode from 'qrcode';
import pkg from 'whatsapp-web.js';
import { aMensajeEntrante, serializarMsgId, tipoDeWid, widToString, type MensajeEntrante, type MensajeWA } from './mensaje';
import { borrarCarpetaSesion, cerrarNavegadoresDeSesion, DATA_PATH, entornoParaNavegador, rutaSesion } from './navegador';
import { conTope, EnvioIncierto } from './tope';
import { bajarAdjunto } from './url-segura';
import { bajarMedio, estadoDeChat, parcharMsgKey, type ClienteWA } from './whatsapp-web';

export type { MensajeEntrante } from './mensaje';

const { Client, LocalAuth, MessageMedia } = pkg;

// whatsapp-web.js renueva el QR sin fin (cada ~20 s). Pasados estos QR (~6 min)
// sin que lo escaneen, la librería corta ('disconnected') y cierra Chromium.
export const QR_MAX = 15;
export const QR_VENCIDO = 'Nadie escaneó el QR a tiempo: reiniciá la conexión para ver uno nuevo';
// Cada cuánto se chequea que WhatsApp Web siga respondiendo aunque no pase
// nada: una sesión zombie (frame de Chromium desconectado) no tira ningún
// evento propio.
export const CHEQUEO_SALUD_MS = 60_000;
const CHEQUEO_SALUD_TIMEOUT_MS = 10_000;
// La compu estuvo dormida (o el proceso congelado): entre dos chequeos pasó
// mucho más que su intervalo. Al despertar, la conexión de Puppeteer con
// Chromium suele quedar rota aunque WhatsApp Web parezca vivo.
export const DORMIDA_MS = 2 * 60_000;
// Escanearon el QR pero WhatsApp Web nunca terminó de cargar.
const VINCULANDO_MAX_MS = 5 * 60_000;
// Cuánto se espera a que client.destroy() cierre Chromium antes de matarlo:
// con la conexión rota (al despertar la compu) puede no volver nunca.
const CIERRE_NAVEGADOR_MS = 10_000;
// ¿El chat tiene mensajes previos al vínculo? Se consulta al crear una
// conversación; si WhatsApp Web no contesta a tiempo se toma como que no.
export const HISTORIAL_PREVIO_MS = 10_000;
const HISTORIAL_PREVIO_LIMITE = 20;
// Medios entrantes: tope de tamaño, cuánto se espera a WhatsApp Web y, si el
// primer intento falla (recién llegado, WhatsApp todavía puede estar
// bajándolo), cuánto antes del segundo.
const MEDIO_TOPE_BYTES = 16 * 1024 * 1024;
const MEDIO_TOPE_MS = 120_000;
const MEDIO_REINTENTO_MS = 3_000;
// Un @lid resuelto se recuerda un día; uno sin resolver se reintenta a los 10 min.
const LID_OK_MS = 24 * 60 * 60_000;
const LID_FALLA_MS = 10 * 60_000;

export function estuvoDormida(ultimo: number, ahora: number): boolean {
  return ultimo > 0 && ahora - ultimo > DORMIDA_MS;
}

// Envíos: lo previo a mandar (buscar el chat de un número, bajar la imagen)
// no puede trabar al despacho del bot; si se vence no salió nada y se puede
// reintentar. sendMessage tiene un tope más largo y, si se vence, el mensaje
// pudo haber salido: tira EnvioIncierto.
export const PREPARAR_ENVIO_MS = 45_000;
export const ENVIO_MS = 90_000;
// "Escribiendo…" y tildes azules: cosméticos, nunca pueden trabar un envío.
const COSMETICO_MS = 10_000;

export type HandlersSesion = {
  onQr(dataUrl: string): void;
  onListo(numero: string): void;
  onCaida(motivo: string): void;
  onMensaje(m: MensajeEntrante): void;
  onAck(waId: string, ack: number): void;
};

type Medio = InstanceType<typeof MessageMedia>;

export type DepsSesion = {
  crearCliente(botId: string): ClienteWA;
  medioDesdeUrl(url: string): Promise<Medio>;
  cerrarNavegadores(botId: string): Promise<number>;
  borrarCarpeta(ruta: string): Promise<void>;
  ahora(): number;
  esperar(ms: number): Promise<void>;
  log(m: string): void;
};

function clienteReal(botId: string): ClienteWA {
  return new Client({
    authStrategy: new LocalAuth({ clientId: botId, dataPath: DATA_PATH }),
    // --no-sandbox solo en Linux (servidor/contenedor); en macOS el sandbox de Chromium anda.
    puppeteer: { headless: true, args: process.platform === 'linux' ? ['--no-sandbox'] : [], env: entornoParaNavegador() },
    // Al pasarlo, la librería emite 'disconnected' ('Max qrcode retries reached') y cierra Chromium.
    qrMaxRetries: QR_MAX,
    // Cuánto espera a que cargue WhatsApp Web (30 s por defecto no alcanza en una compu lenta).
    authTimeoutMs: 90_000,
  });
}

const DEPS: DepsSesion = {
  crearCliente: clienteReal,
  // Nada de MessageMedia.fromUrl: las URLs las edita el dueño del proyecto.
  // bajarAdjunto valida el host (SSRF), no sigue redirecciones y topea tiempo y tamaño.
  medioDesdeUrl: async (url) => {
    const a = await bajarAdjunto(url);
    return new MessageMedia(a.mime, a.base64, a.nombre);
  },
  cerrarNavegadores: cerrarNavegadoresDeSesion,
  borrarCarpeta: borrarCarpetaSesion,
  ahora: () => Date.now(),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (m) => console.log(m),
};

export class SesionBot {
  readonly botId: string;
  private readonly h: HandlersSesion;
  private readonly deps: DepsSesion;
  private client: ClienteWA | null = null;
  private timerSalud: ReturnType<typeof setInterval> | null = null;
  private ultimoChequeoAt = 0;
  private vinculandoDesde: number | null = null;
  private listo = false;
  private qrs = 0;
  private caidaMotivo: string | null = null;
  private lids = new Map<string, { numero: Promise<string | null>; hasta: number }>();

  constructor(botId: string, h: HandlersSesion, deps: Partial<DepsSesion> = {}) {
    // Valida el id (LocalAuth y la carpeta de sesión).
    rutaSesion(botId);
    this.botId = botId;
    this.h = h;
    this.deps = { ...DEPS, ...deps };
  }

  // Se cayó (desvinculada, sin respuesta, dormida): quien la maneja la cierra
  // y, si corresponde, la vuelve a iniciar.
  get caida(): boolean {
    return this.caidaMotivo !== null;
  }

  private log(m: string) {
    this.deps.log(`[bot ${this.botId.slice(0, 8)}] ${m}`);
  }

  // Un handler que tira (o rechaza) no puede tirar abajo la sesión.
  private avisar(que: string, fn: () => unknown) {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => this.log(`falló ${que}: ${e}`));
    } catch (e) {
      this.log(`falló ${que}: ${e}`);
    }
  }

  private caer(motivo: string) {
    if (this.caidaMotivo !== null) return;
    this.caidaMotivo = motivo;
    this.listo = false;
    this.pararSalud();
    this.log(`caída: ${motivo}`);
    this.avisar('onCaida', () => this.h.onCaida(motivo));
  }

  private pararSalud() {
    if (this.timerSalud) clearInterval(this.timerSalud);
    this.timerSalud = null;
  }

  // Abre WhatsApp Web con el login guardado del bot (o pide QR). Si rechaza
  // (Chromium no arrancó), quien llamó cierra con cerrar() y reintenta.
  async iniciar(): Promise<void> {
    if (this.client) throw new Error('La sesión ya está iniciada: cerrala antes de volver a iniciarla');
    const client = this.deps.crearCliente(this.botId);
    this.client = client;
    this.listo = false;
    this.qrs = 0;
    this.caidaMotivo = null;
    this.vinculandoDesde = null;
    this.ultimoChequeoAt = this.deps.ahora();
    // Al reiniciar se cierra este cliente y se arranca otro: un evento tardío
    // del Chromium viejo no puede pisar el estado del nuevo.
    const vigente = () => this.client === client;

    client.on('qr', async (qr: string) => {
      // El último QR (el que pasa QR_MAX) llega junto con el corte: no se publica.
      if (!vigente() || ++this.qrs > QR_MAX) return;
      try {
        const imagen = await QRCode.toDataURL(qr);
        if (!vigente() || this.caida) return;
        this.avisar('onQr', () => this.h.onQr(imagen));
      } catch (e) {
        this.log(`no pude generar el QR: ${e}`);
      }
    });
    client.on('authenticated', () => {
      if (!vigente()) return;
      this.log('vinculado, cargando WhatsApp…');
      this.vinculandoDesde = this.deps.ahora();
    });
    client.on('ready', async () => {
      if (!vigente()) return;
      this.vinculandoDesde = null;
      try {
        await parcharMsgKey(client);
      } catch (e) {
        this.log(`no pude parchar MsgKey (los envíos pueden volver sin id): ${e}`);
      }
      if (!vigente()) return;
      this.listo = true;
      const numero = client.info?.wid?.user ?? '';
      this.log('conectado');
      this.avisar('onListo', () => this.h.onListo(numero));
    });
    client.on('disconnected', (reason: unknown) => {
      if (!vigente()) return;
      // Nadie escaneó el QR.
      if (this.qrs > QR_MAX) this.caer(QR_VENCIDO);
      else this.caer(`WhatsApp se desconectó: ${String(reason)}`);
    });
    client.on('auth_failure', (msg: unknown) => {
      if (!vigente()) return;
      this.caer(`Falló la autenticación: ${String(msg)}`);
    });
    client.on('message_create', (msg: MensajeWA) => {
      if (!vigente()) return;
      aMensajeEntrante(msg, {
        resolverLid: (lid) => this.resolverLid(client, lid),
        descargar: (waId) => this.descargar(client, waId),
      })
        .then((m) => {
          if (m && vigente()) this.avisar('onMensaje', () => this.h.onMensaje(m));
        })
        .catch((e) => this.log(`error leyendo un mensaje: ${e}`));
    });
    // Entregado / leído de nuestros mensajes.
    client.on('message_ack', (msg: MensajeWA, ack: number) => {
      if (!vigente()) return;
      const waId = serializarMsgId(msg?.id);
      if (!waId || !msg.fromMe || !(ack > 0)) return;
      this.avisar('onAck', () => this.h.onAck(waId, ack));
    });

    this.timerSalud = setInterval(() => void this.chequearSalud(), CHEQUEO_SALUD_MS);
    try {
      await client.initialize();
    } catch (e) {
      if (vigente()) this.pararSalud();
      throw e;
    }
  }

  // Corre cada CHEQUEO_SALUD_MS (pública para los tests). Detecta que la compu
  // estuvo dormida, una vinculación que no termina y una página que no
  // responde o quedó desvinculada.
  async chequearSalud(): Promise<void> {
    const client = this.client;
    if (!client || this.caida) return;
    const ahora = this.deps.ahora();
    const dormida = estuvoDormida(this.ultimoChequeoAt, ahora);
    const anterior = this.ultimoChequeoAt;
    this.ultimoChequeoAt = ahora;
    if (dormida) {
      this.caer(`La compu estuvo dormida (${Math.round((ahora - anterior) / 60_000)} min): hay que reconectar`);
      return;
    }
    if (this.vinculandoDesde !== null && ahora - this.vinculandoDesde > VINCULANDO_MAX_MS) {
      this.caer('WhatsApp Web no terminó de cargar después de escanear el QR');
      return;
    }
    if (!this.listo) return;
    try {
      const estado = await conTope(client.getState(), CHEQUEO_SALUD_TIMEOUT_MS, 'WhatsApp Web');
      if (this.client !== client) return;
      // La página responde pero WhatsApp la desvinculó (cerraron la sesión
      // desde el celular sin que llegara el evento).
      if (estado === 'UNPAIRED' || estado === 'UNPAIRED_IDLE') this.caer(`WhatsApp desvinculó el número (${estado})`);
    } catch (e) {
      if (this.client !== client) return;
      this.caer(`WhatsApp Web no respondió al chequeo de salud: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Conectada y respondiendo ahora mismo.
  async estaViva(): Promise<boolean> {
    const client = this.client;
    if (!client || !this.listo || this.caida) return false;
    try {
      const estado = await conTope(client.getState(), CHEQUEO_SALUD_TIMEOUT_MS, 'WhatsApp Web');
      return estado !== 'UNPAIRED' && estado !== 'UNPAIRED_IDLE';
    } catch {
      return false;
    }
  }

  // Cierra Chromium sin desvincular: el login queda guardado para la próxima.
  async cerrar(): Promise<void> {
    await this.soltar(false);
  }

  // Desvincula el número (logout) y borra el login guardado en esta compu.
  async cerrarSesion(): Promise<void> {
    await this.soltar(true);
    await this.deps.borrarCarpeta(rutaSesion(this.botId));
  }

  private async soltar(logout: boolean): Promise<void> {
    const client = this.client;
    this.client = null;
    this.listo = false;
    this.vinculandoDesde = null;
    this.pararSalud();
    if (client) {
      if (logout) {
        try {
          // Con la conexión rota logout() puede no volver nunca: mismo tope que destroy().
          await conTope(client.logout(), CIERRE_NAVEGADOR_MS, 'WhatsApp Web (al desvincular)');
        } catch (e) {
          this.log(`logout falló (ya estaba desconectado?): ${e}`);
        }
      }
      // Los handlers ya ignoran a un cliente que no es el actual; además se
      // sueltan, para que el Chromium que se cierra no dispare nada más.
      client.removeAllListeners();
      try {
        await Promise.race([client.destroy(), new Promise((r) => setTimeout(r, CIERRE_NAVEGADOR_MS))]);
      } catch {
        /* ya estaba cerrado */
      }
    }
    // destroy() no cierra Chromium si perdió la conexión con él: quedaba vivo
    // con el lock y el próximo arranque fallaba o abría un segundo WhatsApp Web
    // con el mismo login.
    try {
      const cerrados = await this.deps.cerrarNavegadores(this.botId);
      if (cerrados > 0) this.log(`cerré ${cerrados} Chromium que había quedado abierto`);
    } catch (e) {
      this.log(`no pude cerrar los Chromium de la sesión: ${e}`);
    }
  }

  private conectado(): ClienteWA {
    if (!this.client) throw new Error('La sesión de WhatsApp no está iniciada');
    return this.client;
  }

  // El chat de un destino: un wid tal cual, o un teléfono suelto (el aviso al
  // vendedor) que se busca en WhatsApp.
  private async widDe(client: ClienteWA, destino: string): Promise<string> {
    if (destino.includes('@')) return destino;
    const digitos = destino.replace(/\D/g, '');
    if (!digitos) throw new Error(`Destino inválido: ${JSON.stringify(destino)}`);
    const id = await client.getNumberId(digitos);
    const wid = widToString(id);
    if (!wid) throw new Error(`El número ${digitos} no tiene WhatsApp`);
    return wid;
  }

  // El id del mensaje enviado. Si WhatsApp Web no lo devuelve (sin el parche de
  // MsgKey), el mensaje igual salió: '' en vez de tirar, para no reenviarlo.
  private idEnviado(msg: unknown): string {
    const id = serializarMsgId((msg as { id?: Parameters<typeof serializarMsgId>[0] } | undefined)?.id);
    if (!id) this.log('el mensaje salió pero WhatsApp Web no devolvió su id');
    return id ?? '';
  }

  // sendSeen: false en los envíos: marcar como leído lo decide quien despacha (marcarLeido).
  private async mandar(client: ClienteWA, chat: string, contenido: string | Medio): Promise<string> {
    const msg = await conTope(
      client.sendMessage(chat, contenido, { sendSeen: false }),
      ENVIO_MS,
      'WhatsApp Web (al mandar)',
      (m) => new EnvioIncierto(m),
    );
    return this.idEnviado(msg);
  }

  async enviarTexto(wid: string, texto: string): Promise<string> {
    const client = this.conectado();
    const chat = await conTope(this.widDe(client, wid), PREPARAR_ENVIO_MS, 'Buscar el chat en WhatsApp');
    return this.mandar(client, chat, texto);
  }

  async enviarImagen(wid: string, url: string): Promise<string> {
    const client = this.conectado();
    const preparar = async () => ({ chat: await this.widDe(client, wid), medio: await this.deps.medioDesdeUrl(url) });
    const { chat, medio } = await conTope(preparar(), PREPARAR_ENVIO_MS, 'Preparar la imagen');
    return this.mandar(client, chat, medio);
  }

  // "Escribiendo…" durante ms y después nada. Es cosmético: si WhatsApp Web
  // falla, igual espera y no tira.
  async escribiendo(wid: string, ms: number): Promise<void> {
    const client = this.conectado();
    try {
      await conTope(estadoDeChat(client, wid, 'typing'), COSMETICO_MS, 'WhatsApp Web');
    } catch (e) {
      this.log(`no pude mostrar "escribiendo": ${e}`);
    }
    await this.deps.esperar(ms);
    try {
      await conTope(estadoDeChat(client, wid, 'stop'), COSMETICO_MS, 'WhatsApp Web');
    } catch (e) {
      this.log(`no pude sacar "escribiendo": ${e}`);
    }
  }

  // Tildes azules en el chat. Cosmético: si falla, no tira.
  async marcarLeido(wid: string): Promise<void> {
    const client = this.conectado();
    try {
      await conTope(client.sendSeen(wid), COSMETICO_MS, 'WhatsApp Web');
    } catch (e) {
      this.log(`no pude marcar el chat como leído: ${e}`);
    }
  }

  /**
   * ¿WhatsApp Web tiene mensajes de este chat anteriores a `antesDe` (el
   * vínculo)? Mira los últimos 20. Ante cualquier error o demora (10 s)
   * devuelve false: el chat se trata como nuevo.
   */
  async tieneHistorialPrevio(wid: string, antesDe: Date): Promise<boolean> {
    const client = this.client;
    if (!client || !this.listo) return false;
    const corte = antesDe.getTime() / 1000;
    try {
      return await conTope(
        (async () => {
          const chat = await client.getChatById(wid);
          const msgs = await chat.fetchMessages({ limit: HISTORIAL_PREVIO_LIMITE });
          return msgs.some((m) => typeof m.timestamp === 'number' && m.timestamp > 0 && m.timestamp < corte);
        })(),
        HISTORIAL_PREVIO_MS,
        'WhatsApp Web (historial del chat)',
      );
    } catch (e) {
      this.log(`no pude ver el historial previo de un chat: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  // Teléfono (dígitos) de un @lid, o null si WhatsApp no lo da todavía.
  // Una ráfaga de mensajes del mismo @lid comparte la misma consulta.
  private resolverLid(client: ClienteWA, lid: string): Promise<string | null> {
    const guardado = this.lids.get(lid);
    if (guardado && guardado.hasta > this.deps.ahora()) return guardado.numero;
    const numero = client
      .getContactLidAndPhone([lid])
      .then(([res]) => {
        const pn = res?.pn ? tipoDeWid(res.pn) : null;
        return pn?.kind === 'telefono' ? pn.digitos : null;
      })
      .catch(() => null)
      .then((n) => {
        // Sin teléfono todavía (WhatsApp a veces lo resuelve más tarde): se vuelve a probar en un rato.
        this.lids.set(lid, { numero: Promise.resolve(n), hasta: this.deps.ahora() + (n ? LID_OK_MS : LID_FALLA_MS) });
        return n;
      });
    this.lids.set(lid, { numero, hasta: Number.POSITIVE_INFINITY });
    return numero;
  }

  // Un medio entrante desde la caché de WhatsApp Web; null si es muy grande,
  // de ver una vez o WhatsApp no lo da (el motivo queda en el log).
  private async descargar(client: ClienteWA, waId: string): Promise<{ mime: string; data: Buffer } | null> {
    for (let intento = 1; intento <= 2; intento++) {
      if (this.client !== client) return null;
      try {
        const r = await conTope(bajarMedio(client, waId, MEDIO_TOPE_BYTES), MEDIO_TOPE_MS, 'WhatsApp Web');
        if ('grande' in r) {
          this.log(`medio ${waId} pasa el tope de ${MEDIO_TOPE_BYTES / 1024 / 1024} MB: no se baja`);
          return null;
        }
        if ('verUnaVez' in r) return null;
        return r;
      } catch (e) {
        this.log(`no pude bajar el medio (intento ${intento}/2): ${e instanceof Error ? e.message : e}`);
        if (intento < 2) await this.deps.esperar(MEDIO_REINTENTO_MS);
      }
    }
    return null;
  }
}
