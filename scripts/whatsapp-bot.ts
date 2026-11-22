/**
 * Puente de WhatsApp del bot de ventas (spec §7.3): proceso siempre prendido
 * en el servidor propio. Abre una sesión de WhatsApp Web por bot tomado,
 * guarda lo que llega, corre la IA y despacha la cola wa_salida.
 *
 * Uso: pnpm bot   (tsx --env-file=.env.bot scripts/whatsapp-bot.ts)
 * Variables: ver .env.bot.example. Solo toma los bots con
 * host_permitido = BOT_HOST, así una notebook nunca toma un bot real.
 *
 * Es cableado: la lógica está en lib/whatsapp-bot (con tests). No importa
 * server-only, next/* ni react.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { WaBot, WaSalida } from '@/types/whatsapp-bot';
import { cargarDatosProyecto } from '@/lib/whatsapp-bot/datos';
import { crearClienteClaude } from '@/lib/whatsapp-bot/ia/cliente';
import { crearTranscriptor } from '@/lib/whatsapp-bot/transcripcion';
import { urlSitioProyecto } from '@/lib/whatsapp-bot/material';
import { responderTurno } from '@/lib/whatsapp-bot/ia/turno';
import { Agrupador } from '@/lib/whatsapp-bot/puente/agrupador';
import { cambiosAlConectar, debeTenerSesion, esperaReconexion, fusionarBot } from '@/lib/whatsapp-bot/puente/conexion';
import { despacharUno, Despachador } from '@/lib/whatsapp-bot/puente/despacho';
import { EnviosPropios } from '@/lib/whatsapp-bot/puente/envios-propios';
import type { MensajeEntrante } from '@/lib/whatsapp-bot/puente/mensaje';
import { borrarCarpetaSesion, cerrarNavegadoresHuerfanos, rutaSesion } from '@/lib/whatsapp-bot/puente/navegador';
import { procesarMensaje, rutaMedio, type DepsRecepcion } from '@/lib/whatsapp-bot/puente/recepcion';
import { crearSerie } from '@/lib/whatsapp-bot/puente/serie';
import { QR_VENCIDO, SesionBot } from '@/lib/whatsapp-bot/puente/sesion';
import { correrTurnoIA, type DepsTurnoBot } from '@/lib/whatsapp-bot/puente/turno-bot';
import { correrSeguimiento } from '@/lib/whatsapp-bot/puente/seguimiento-bot';
import { DIAS_MAX_SEGUIMIENTO, HORAS_SEGUIMIENTO_DEFAULT } from '@/lib/whatsapp-bot/seguimiento';
import { UnaALaVez } from '@/lib/whatsapp-bot/puente/una-a-la-vez';
import * as repo from '@/lib/whatsapp-bot/repo';
import { MS_AGRUPAR } from '@/lib/whatsapp-bot/reglas';

const TICK_MS = 5_000;
const SONDEO_MS = 10_000;
const LEASE_S = 90;
/** Cada cuánto revisa cada bot si hay seguimientos para mandar. */
const SEGUIMIENTO_CADA_MS = 10 * 60 * 1000;

// ─── Configuración ───────────────────────────────────────────────────

function salirPorConfig(mensaje: string): never {
  console.error(`✗ ${mensaje}\n  Copiá .env.bot.example a .env.bot y completalo.`);
  process.exit(1);
}

const BOT_HOST = process.env.BOT_HOST?.trim() ?? '';
if (!BOT_HOST) {
  salirPorConfig(
    'Falta BOT_HOST: el nombre de este servidor. El puente solo toma los bots cuyo host_permitido es ese nombre.',
  );
}
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL?.trim() ?? '';
if (!/^https?:\/\/\S+$/.test(ADMIN_BASE_URL)) {
  salirPorConfig('Falta ADMIN_BASE_URL (ej. https://tu-dominio.com): se usa para el link "Ver chat" del aviso al vendedor.');
}
for (const nombre of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'] as const) {
  if (!process.env[nombre]?.trim()) salirPorConfig(`Falta ${nombre}.`);
}

const sb = repo.createBotClient();
const anthropic = crearClienteClaude();
const enSerie = crearSerie();

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);
const logError = (m: string) => console.error(`${new Date().toISOString()} ${m}`);
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const depsTurno: DepsTurnoBot = {
  sb,
  repo,
  cargarDatosProyecto,
  responderTurno: (i) => responderTurno({ cliente: anthropic, ...i }),
  registrarUso: (r) => repo.registrarUsoIa(sb, r, logError),
  ahora: () => new Date(),
  urlAdmin: ADMIN_BASE_URL,
  urlSitio: (slug: string) => urlSitioProyecto(slug, ADMIN_BASE_URL, process.env.NEXT_PUBLIC_ROOT_DOMAIN),
  medios: {
    bajar: async (path: string) => {
      const { data, error } = await sb.storage.from('wa-medios').download(path);
      if (error || !data) return null;
      return { data: new Uint8Array(await data.arrayBuffer()), mime: data.type || null };
    },
    transcribir: crearTranscriptor() ?? undefined,
  },
  log: logError,
};

// ─── Un bot tomado por este puente ───────────────────────────────────

class BotVivo {
  bot: WaBot;
  private sesion: SesionBot | null = null;
  /** Generación de la sesión: los eventos de una sesión ya cerrada se ignoran. */
  private gen = 0;
  private conectado = false;
  private intentos = 0;
  private timerReconexion: ReturnType<typeof setTimeout> | null = null;
  /** vinculado_at fijado en memoria al conectar que todavía no se pudo guardar. */
  private vinculadoSinGuardar = false;
  /** Operaciones de ciclo de vida (pedidos, caídas, reconexiones) de a una. */
  private ops: Promise<void> = Promise.resolve();
  private readonly envios = new EnviosPropios();
  /** La atención de cada tick: sin esperarla ni apilarla (ver tick()). */
  readonly atencion = new UnaALaVez((m) => this.logError(m));
  /** La revisión de seguimientos: una a la vez, cada SEGUIMIENTO_CADA_MS. */
  private readonly seguimientos = new UnaALaVez((m) => this.logError(m));
  private ultimoSeguimiento = 0;
  readonly agrupador: Agrupador;
  readonly despachador: Despachador;

  constructor(bot: WaBot) {
    this.bot = bot;
    this.agrupador = new Agrupador(
      MS_AGRUPAR,
      async (convId) => {
        const r = await correrTurnoIA(depsTurno, this.bot.id, convId);
        if (r === 'respondido') void this.despachador.pulsar();
        else if (r === 'pausado') this.log(`la IA no respondió en ${convId} (queda marcado en la conversación)`);
      },
      (m) => this.logError(m),
    );
    this.despachador = new Despachador(
      () => this.ronda(),
      () => this.conectado && this.sesion !== null,
      (m) => this.logError(m),
    );
  }

  private log(m: string) {
    log(`[bot ${this.bot.id.slice(0, 8)}] ${m}`);
  }

  private logError(m: string) {
    logError(`[bot ${this.bot.id.slice(0, 8)}] ${m}`);
  }

  enOrden(fn: () => Promise<void>): Promise<void> {
    const p = this.ops.then(fn);
    this.ops = p.catch((e) => this.logError(`falló una operación de la sesión: ${mensajeDe(e)}`));
    return p;
  }

  private async guardarEstado(cambios: Parameters<typeof repo.guardarEstado>[2]) {
    try {
      await repo.guardarEstado(sb, this.bot.id, cambios);
    } catch (e) {
      this.logError(`no pude guardar el estado: ${mensajeDe(e)}`);
    }
  }

  private ronda() {
    const sesion = this.sesion;
    if (!sesion) return Promise.resolve('vacio' as const);
    return despacharUno(
      {
        sb,
        repo,
        sesion,
        esperar: dormir,
        azar: Math.random,
        registrarWaId: (w) => this.envios.registrarWaId(w),
        envios: this.envios,
        enSerie,
        log: (m) => this.logError(m),
      },
      this.bot.id,
    );
  }

  private depsRecepcion(): DepsRecepcion {
    return {
      repo,
      sb,
      // Leído en el momento: lleva el vinculado_at fijado al conectar.
      bot: this.bot,
      subirMedio: (convId, waId, m) => repo.subirMedio(sb, rutaMedio(this.bot.project_id, convId, waId, m.mime), m),
      esDeLaCola: (w) => this.envios.esDeLaCola(w),
      esEnvioEnCurso: (m) => this.envios.esEnvioEnCurso(m),
      agrupador: this.agrupador,
      // Spec §6: un contacto que ya charlaba con este número antes del vínculo
      // no lo atiende el bot. Solo se consulta al crear la conversación.
      historialPrevio: (wid, antesDe) => this.sesion?.tieneHistorialPrevio(wid, antesDe) ?? Promise.resolve(false),
      ahora: () => new Date(),
      enSerie,
      log: (m) => this.logError(m),
    };
  }

  // Abre una sesión nueva. No espera a initialize(): con QR puede tardar minutos
  // y un pedido de desconectar tiene que poder cortarla.
  private arrancar(): void {
    this.cancelarReconexion();
    const gen = ++this.gen;
    this.conectado = false;
    let marcarListo!: () => void;
    // Los mensajes esperan a que el bot tenga su vinculado_at (onListo).
    const listo = new Promise<void>((r) => {
      marcarListo = r;
    });
    const vigente = () => gen === this.gen;

    const sesion = new SesionBot(this.bot.id, {
      onQr: (qr) => {
        if (!vigente()) return;
        this.log('esperando que escaneen el QR');
        return this.guardarEstado({ estado: 'esperando_qr', qr, qr_at: new Date().toISOString() });
      },
      onListo: (numero) => {
        if (!vigente()) return;
        return this.alConectar(numero, marcarListo);
      },
      onCaida: (motivo) => {
        if (!vigente()) return;
        void this.enOrden(() => this.alCaer(gen, motivo));
      },
      onMensaje: (m: MensajeEntrante) => {
        if (!vigente()) return;
        void listo
          .then(() => procesarMensaje(this.depsRecepcion(), m))
          .catch((e) => this.logError(`no pude procesar un mensaje: ${mensajeDe(e)}`));
      },
      onAck: (waId, ack) => {
        void repo.guardarAck(sb, waId, ack).catch((e) => this.logError(`no pude guardar un ack: ${mensajeDe(e)}`));
      },
    });
    this.sesion = sesion;
    this.log('abriendo WhatsApp Web');
    sesion.iniciar().catch((e) => {
      if (vigente()) void this.enOrden(() => this.alCaer(gen, `No se pudo abrir WhatsApp Web: ${mensajeDe(e)}`));
    });
  }

  private async alConectar(numero: string, marcarListo: () => void): Promise<void> {
    const cambios = cambiosAlConectar(this.bot, numero, new Date());
    // Primero en memoria (lo usa la recepción), recién después se libera la cola de mensajes.
    this.bot = { ...this.bot, ...cambios };
    this.vinculadoSinGuardar = true;
    this.conectado = true;
    this.intentos = 0;
    marcarListo();
    this.log('conectado');
    try {
      await repo.guardarEstado(sb, this.bot.id, cambios);
      this.vinculadoSinGuardar = false;
    } catch (e) {
      this.logError(`no pude guardar la conexión (se reintenta): ${mensajeDe(e)}`);
    }
    void this.despachador.pulsar();
  }

  private async alCaer(gen: number, motivo: string): Promise<void> {
    if (gen !== this.gen) return;
    this.gen++;
    this.conectado = false;
    const sesion = this.sesion;
    this.sesion = null;
    this.log(`sesión caída: ${motivo}`);
    this.bot = { ...this.bot, estado: 'error', ultimo_error: motivo, qr: null };
    await this.guardarEstado({ estado: 'error', ultimo_error: motivo, qr: null });
    // SesionBot no se cierra sola: cerrar Chromium antes de volver a abrir.
    if (sesion) await sesion.cerrar();
    // Nadie escaneó el QR: espera a que lo pidan de nuevo desde el admin.
    if (motivo === QR_VENCIDO) return;
    const espera = esperaReconexion(this.intentos++);
    this.log(`reintento en ${Math.round(espera / 1000)} s`);
    this.timerReconexion = setTimeout(() => {
      this.timerReconexion = null;
      void this.enOrden(async () => {
        if (!this.sesion && !parando) this.arrancar();
      });
    }, espera);
  }

  private cancelarReconexion() {
    if (this.timerReconexion) clearTimeout(this.timerReconexion);
    this.timerReconexion = null;
  }

  /** Cierra la sesión. Con logout desvincula el número y borra el login guardado. */
  async cerrar(logout = false): Promise<void> {
    this.cancelarReconexion();
    this.gen++;
    this.conectado = false;
    const sesion = this.sesion;
    this.sesion = null;
    if (sesion) await (logout ? sesion.cerrarSesion() : sesion.cerrar());
    else if (logout) await borrarCarpetaSesion(rutaSesion(this.bot.id));
  }

  /** Cada tick: config fresca, pedidos del admin, sesión que debería estar abierta, latido. */
  async atender(fresco: WaBot): Promise<void> {
    this.bot = fusionarBot(this.bot, fresco);
    if (this.vinculadoSinGuardar) {
      try {
        await repo.guardarEstado(sb, this.bot.id, { vinculado_at: this.bot.vinculado_at, numero: this.bot.numero });
        this.vinculadoSinGuardar = false;
      } catch (e) {
        this.logError(`sigo sin poder guardar vinculado_at: ${mensajeDe(e)}`);
      }
    }

    const { pedido, pedido_at } = fresco;
    if (pedido) {
      this.log(`pedido: ${pedido}`);
      try {
        if (pedido === 'desconectar') {
          await this.cerrar(true);
          // Desvinculado: el próximo vínculo cuenta como el primero (vinculado_at nuevo).
          this.bot = { ...this.bot, estado: 'desconectado', qr: null, ultimo_error: null, vinculado_at: null };
          await this.guardarEstado({ estado: 'desconectado', qr: null, ultimo_error: null, vinculado_at: null });
        } else if (pedido === 'reiniciar' || !this.sesion) {
          // reiniciar, o conectar sin sesión abierta (o esperando reconexión).
          await this.cerrar(false);
          this.intentos = 0;
          this.arrancar();
        }
        // conectar con una sesión ya abierta (conectada o mostrando QR): nada que hacer.
      } finally {
        await repo
          .limpiarPedido(sb, this.bot.id, pedido_at)
          .catch((e) => this.logError(`no pude limpiar el pedido: ${mensajeDe(e)}`));
      }
    } else if (!this.sesion && !this.timerReconexion && debeTenerSesion(this.bot)) {
      this.arrancar();
    }

    await repo.latir(sb, this.bot.id).catch((e) => this.logError(`no pude latir: ${mensajeDe(e)}`));

    if (this.conectado && this.bot.activo && this.bot.seguimiento_activo && Date.now() - this.ultimoSeguimiento >= SEGUIMIENTO_CADA_MS) {
      this.ultimoSeguimiento = Date.now();
      this.seguimientos.correr(() => this.revisarSeguimientos());
    }
  }

  /** Manda los seguimientos que correspondan (de a uno; la cola espacia los envíos). */
  private async revisarSeguimientos(): Promise<void> {
    const ids = await repo.conversacionesParaSeguimiento(
      sb,
      this.bot.id,
      new Date(),
      this.bot.seguimiento_horas ?? HORAS_SEGUIMIENTO_DEFAULT,
      DIAS_MAX_SEGUIMIENTO,
    );
    for (const id of ids) {
      if (!this.conectado) return;
      try {
        const r = await correrSeguimiento({ ...depsTurno, repo }, this.bot.id, id);
        if (r === 'enviado') {
          this.log(`seguimiento enviado en ${id}`);
          void this.despachador.pulsar();
        }
      } catch (e) {
        this.logError(`falló el seguimiento de ${id}: ${mensajeDe(e)}`);
      }
    }
  }
}

// ─── Bucle principal ─────────────────────────────────────────────────

const bots = new Map<string, BotVivo>();
let parando = false;

async function tick(): Promise<void> {
  let tomados: WaBot[];
  try {
    tomados = await repo.tomarBots(sb, BOT_HOST, LEASE_S);
  } catch (e) {
    // Sin base no se suelta nada: el lease dura 90 s y el próximo tick reintenta.
    logError(`[puente] no pude tomar los bots: ${mensajeDe(e)}`);
    return;
  }
  const ids = new Set(tomados.map((b) => b.id));
  // Nada de esto se espera: una operación colgada de un bot (un logout que no
  // vuelve, Chromium trabado) no puede frenar el tick de los demás bots.
  for (const [id, vivo] of bots) {
    if (ids.has(id)) continue;
    log(`[bot ${id.slice(0, 8)}] ya no está asignado a este puente: cierro su sesión`);
    bots.delete(id);
    vivo.agrupador.detener();
    void vivo.enOrden(() => vivo.cerrar(false)).catch(() => {});
  }
  for (const b of tomados) {
    let vivo = bots.get(b.id);
    if (!vivo) {
      vivo = new BotVivo(b);
      bots.set(b.id, vivo);
      log(`[bot ${b.id.slice(0, 8)}] tomado por ${BOT_HOST}`);
    }
    const v = vivo;
    // Si la atención del tick anterior sigue en curso, este tick lo saltea.
    if (!v.atencion.correr(() => v.enOrden(() => v.atender(b)))) {
      log(`[bot ${b.id.slice(0, 8)}] sigue ocupado con el tick anterior: lo salteo`);
    }
  }
}

function suscribirCola(): RealtimeChannel {
  return sb
    .channel('wa-salida-puente')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_salida' }, (payload) => {
      const fila = payload.new as Partial<WaSalida>;
      if (fila.bot_id) void bots.get(fila.bot_id)?.despachador.pulsar();
    })
    .subscribe((estado, err) => {
      if (estado === 'SUBSCRIBED') log('[puente] escuchando la cola wa_salida (Realtime)');
      else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
        logError(`[puente] Realtime ${estado}${err ? `: ${err.message}` : ''} (sigue el sondeo cada 10 s)`);
      }
    });
}

async function main(): Promise<void> {
  log(`[puente] arrancando en ${BOT_HOST}`);
  await cerrarNavegadoresHuerfanos();
  const canal = suscribirCola();
  const sondeo = setInterval(() => {
    for (const vivo of bots.values()) void vivo.despachador.pulsar();
  }, SONDEO_MS);

  const parar = async (senal: string) => {
    if (parando) return;
    parando = true;
    log(`[puente] ${senal}: cierro las sesiones (sin desvincular)`);
    clearInterval(sondeo);
    for (const vivo of bots.values()) vivo.agrupador.detener();
    await sb.removeChannel(canal).catch(() => {});
    await Promise.all([...bots.values()].map((v) => v.cerrar(false).catch(() => {})));
    process.exit(0);
  };
  process.on('SIGTERM', () => void parar('SIGTERM'));
  process.on('SIGINT', () => void parar('SIGINT'));

  while (!parando) {
    await tick();
    await dormir(TICK_MS);
  }
}

// whatsapp-web.js/puppeteer a veces tiran errores sueltos (Chromium que se
// cierra, frames desconectados): se loguean y el puente sigue; las sesiones
// rotas las detecta el chequeo de salud.
process.on('unhandledRejection', (e) => logError(`[puente] promesa rechazada sin manejar: ${mensajeDe(e)}`));
process.on('uncaughtException', (e) => logError(`[puente] excepción sin manejar: ${mensajeDe(e)}`));

main().catch((e) => {
  logError(`[puente] se cayó el bucle principal: ${mensajeDe(e)}`);
  process.exit(1);
});
