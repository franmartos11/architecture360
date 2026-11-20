import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { estuvoDormida, QR_MAX, QR_VENCIDO, SesionBot, type DepsSesion } from './sesion';
import type { ClienteWA } from './whatsapp-web';
import { EnvioImposible, EnvioIncierto } from './tope';

// SesionBot con un Client falso (un EventEmitter): no se abre Chromium.

const BOT = '3f2b9c1e-0000-4000-8000-000000000001';

class ClienteFalso extends EventEmitter {
  info = { wid: { user: '5491100000000', server: 'c.us', _serialized: '5491100000000@c.us' } };
  evaluados: unknown[][] = [];
  pupPage = {
    evaluate: vi.fn(async (_fn: unknown, ...args: unknown[]) => {
      this.evaluados.push(args);
      return this.respuestaPagina;
    }),
  };
  respuestaPagina: unknown = undefined;
  initialize = vi.fn(async () => {});
  getState = vi.fn(async (): Promise<string | null> => 'CONNECTED');
  sendMessage = vi.fn(async (...args: [chatId: string, contenido?: unknown, opciones?: unknown]) => ({
    id: { _serialized: `true_${args[0]}_3EB0NUEVO`, fromMe: true },
  }));
  sendSeen = vi.fn(async () => true);
  getNumberId = vi.fn(async (n: string): Promise<{ user: string; server: string; _serialized: string } | null> => ({
    user: n,
    server: 'c.us',
    _serialized: `${n}@c.us`,
  }));
  getContactLidAndPhone = vi.fn(async (ids: string[]) => ids.map((lid) => ({ lid, pn: '5491155551234@c.us' })));
  logout = vi.fn(async () => {});
  destroy = vi.fn(async () => {});
  historial: { timestamp: number }[] = [];
  fetchMessages = vi.fn(async (...a: [{ limit: number }]) => (void a, this.historial));
  getChatById = vi.fn(async (...a: [string]) => (void a, { fetchMessages: this.fetchMessages }));
}

function armar(over: Partial<DepsSesion> = {}) {
  const cliente = new ClienteFalso();
  const h = {
    onQr: vi.fn(),
    onListo: vi.fn(),
    onCaida: vi.fn(),
    onMensaje: vi.fn(),
    onAck: vi.fn(),
  };
  let ahora = 1_000_000;
  const deps: Partial<DepsSesion> = {
    crearCliente: vi.fn(() => cliente as unknown as ClienteWA),
    medioDesdeUrl: vi.fn(async (url: string) => ({ mimetype: 'image/jpeg', data: 'QUJD', filename: url }) as never),
    cerrarNavegadores: vi.fn(async () => 0),
    borrarCarpeta: vi.fn(async () => {}),
    ahora: () => ahora,
    esperar: vi.fn(async () => {}),
    log: () => {},
    ...over,
  };
  const sesion = new SesionBot(BOT, h, deps);
  return { sesion, cliente, h, deps, avanzar: (ms: number) => (ahora += ms) };
}

const tick = () => new Promise((r) => setImmediate(r));

const mensaje = (p: Record<string, unknown> = {}) => ({
  id: { _serialized: 'false_5491155551234@c.us_ABC', fromMe: false, remote: '5491155551234@c.us', id: 'ABC' },
  fromMe: false,
  from: '5491155551234@c.us',
  to: '5491100000000@c.us',
  type: 'chat',
  body: 'Hola',
  timestamp: 1_763_640_000,
  hasMedia: false,
  isStatus: false,
  _data: { notifyName: 'Juan' },
  ...p,
});

describe('SesionBot: eventos', () => {
  let s: ReturnType<typeof armar>;
  afterEach(async () => {
    await s?.sesion.cerrar();
  });

  it('iniciar crea el cliente para el bot e inicializa', async () => {
    s = armar();
    await s.sesion.iniciar();
    expect(s.deps.crearCliente).toHaveBeenCalledWith(BOT);
    expect(s.cliente.initialize).toHaveBeenCalled();
  });

  it('qr → onQr con la imagen (data URL)', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('qr', 'codigo-del-qr');
    await vi.waitFor(() => expect(s.h.onQr).toHaveBeenCalled());
    expect(s.h.onQr.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/);
  });

  it(`después de ${QR_MAX} QR no publica más; al cortarse avisa que venció`, async () => {
    s = armar();
    await s.sesion.iniciar();
    for (let i = 0; i <= QR_MAX; i++) s.cliente.emit('qr', `qr-${i}`);
    await vi.waitFor(() => expect(s.h.onQr).toHaveBeenCalledTimes(QR_MAX));
    s.cliente.emit('disconnected', 'Max qrcode retries reached');
    expect(s.h.onCaida).toHaveBeenCalledWith(QR_VENCIDO);
  });

  it('ready → parcha MsgKey en la página y onListo con el número', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalledWith('5491100000000'));
    expect(s.cliente.pupPage.evaluate).toHaveBeenCalled();
  });

  it('message_create → onMensaje con el MensajeEntrante', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('message_create', mensaje());
    await vi.waitFor(() => expect(s.h.onMensaje).toHaveBeenCalled());
    expect(s.h.onMensaje.mock.calls[0][0]).toMatchObject({
      waId: 'false_5491155551234@c.us_ABC',
      wid: '5491155551234@c.us',
      numero: '5491155551234',
      nombre: 'Juan',
      tipo: 'texto',
      cuerpo: 'Hola',
    });
  });

  it('message_create de un @lid: resuelve el número (y lo recuerda)', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('message_create', mensaje({ from: '999@lid' }));
    s.cliente.emit('message_create', mensaje({ from: '999@lid', id: { _serialized: 'false_999@lid_B', fromMe: false } }));
    await vi.waitFor(() => expect(s.h.onMensaje).toHaveBeenCalledTimes(2));
    expect(s.h.onMensaje.mock.calls[0][0]).toMatchObject({ wid: '999@lid', numero: '5491155551234' });
    expect(s.cliente.getContactLidAndPhone).toHaveBeenCalledTimes(1);
    expect(s.cliente.getContactLidAndPhone).toHaveBeenCalledWith(['999@lid']);
  });

  it('message_create de un @lid que WhatsApp no resuelve: numero null', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.getContactLidAndPhone.mockRejectedValueOnce(new Error('falló'));
    s.cliente.emit('message_create', mensaje({ from: '999@lid' }));
    await vi.waitFor(() => expect(s.h.onMensaje).toHaveBeenCalled());
    expect(s.h.onMensaje.mock.calls[0][0]).toMatchObject({ wid: '999@lid', numero: null });
  });

  it('message_create de sistema: no llama a onMensaje', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('message_create', mensaje({ type: 'e2e_notification' }));
    await tick();
    expect(s.h.onMensaje).not.toHaveBeenCalled();
  });

  it('descargarMedio del mensaje: baja de la caché de WhatsApp Web', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.respuestaPagina = { data: Buffer.from('JPEG').toString('base64'), mimetype: 'image/jpeg' };
    s.cliente.emit('message_create', mensaje({ type: 'image', hasMedia: true, body: '' }));
    await vi.waitFor(() => expect(s.h.onMensaje).toHaveBeenCalled());
    expect(await s.h.onMensaje.mock.calls[0][0].descargarMedio()).toEqual({ mime: 'image/jpeg', data: Buffer.from('JPEG') });
  });

  it('descargarMedio: si WhatsApp no lo da (ni al reintentar) → null', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.respuestaPagina = { motivo: 'WhatsApp no dio el archivo (ERROR_MISSING)' };
    s.cliente.emit('message_create', mensaje({ type: 'image', hasMedia: true, body: '' }));
    await vi.waitFor(() => expect(s.h.onMensaje).toHaveBeenCalled());
    expect(await s.h.onMensaje.mock.calls[0][0].descargarMedio()).toBeNull();
    expect(s.deps.esperar).toHaveBeenCalled();
  });

  it('message_ack de un mensaje nuestro → onAck; de uno ajeno o ack 0, nada', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('message_ack', { id: { _serialized: 'true_549@c.us_X' }, fromMe: true }, 3);
    s.cliente.emit('message_ack', { id: { _serialized: 'false_549@c.us_Y' }, fromMe: false }, 3);
    s.cliente.emit('message_ack', { id: { _serialized: 'true_549@c.us_Z' }, fromMe: true }, 0);
    expect(s.h.onAck).toHaveBeenCalledTimes(1);
    expect(s.h.onAck).toHaveBeenCalledWith('true_549@c.us_X', 3);
  });

  it('disconnected y auth_failure → onCaida una sola vez', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('disconnected', 'LOGOUT');
    s.cliente.emit('auth_failure', 'x');
    expect(s.h.onCaida).toHaveBeenCalledTimes(1);
    expect(s.h.onCaida.mock.calls[0][0]).toContain('LOGOUT');
    expect(s.sesion.caida).toBe(true);
  });

  it('auth_failure → onCaida', async () => {
    s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('auth_failure', 'credenciales viejas');
    expect(s.h.onCaida.mock.calls[0][0]).toContain('credenciales viejas');
  });

  it('un cliente ya cerrado no dispara nada', async () => {
    s = armar();
    await s.sesion.iniciar();
    const viejo = s.cliente;
    await s.sesion.cerrar();
    viejo.emit('disconnected', 'tarde');
    viejo.emit('message_create', mensaje());
    await tick();
    expect(s.h.onCaida).not.toHaveBeenCalled();
    expect(s.h.onMensaje).not.toHaveBeenCalled();
  });

  it('un handler que tira no rompe la sesión', async () => {
    s = armar();
    s.h.onAck.mockImplementation(() => {
      throw new Error('falló la base');
    });
    await s.sesion.iniciar();
    expect(() => s.cliente.emit('message_ack', { id: { _serialized: 'true_549@c.us_X' }, fromMe: true }, 2)).not.toThrow();
  });
});

describe('SesionBot: salud', () => {
  it('getState que falla → onCaida', async () => {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    s.cliente.getState.mockRejectedValueOnce(new Error('Session closed'));
    s.avanzar(60_000);
    await s.sesion.chequearSalud();
    expect(s.h.onCaida).toHaveBeenCalledTimes(1);
    expect(s.h.onCaida.mock.calls[0][0]).toContain('Session closed');
    await s.sesion.cerrar();
  });

  it('UNPAIRED → onCaida; CONNECTED → nada', async () => {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    s.avanzar(60_000);
    await s.sesion.chequearSalud();
    expect(s.h.onCaida).not.toHaveBeenCalled();
    s.cliente.getState.mockResolvedValueOnce('UNPAIRED');
    s.avanzar(60_000);
    await s.sesion.chequearSalud();
    expect(s.h.onCaida.mock.calls[0][0]).toContain('UNPAIRED');
    await s.sesion.cerrar();
  });

  it('la compu estuvo dormida (más de 2 min entre chequeos) → onCaida', async () => {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    s.avanzar(60_000);
    await s.sesion.chequearSalud();
    s.avanzar(10 * 60_000);
    await s.sesion.chequearSalud();
    expect(s.h.onCaida).toHaveBeenCalledTimes(1);
    expect(s.h.onCaida.mock.calls[0][0]).toMatch(/dormida/);
    await s.sesion.cerrar();
  });

  it('escanearon el QR pero WhatsApp Web no termina de cargar en 5 min → onCaida', async () => {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('authenticated');
    s.avanzar(60_000);
    await s.sesion.chequearSalud();
    expect(s.h.onCaida).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) {
      s.avanzar(60_000);
      await s.sesion.chequearSalud();
    }
    expect(s.h.onCaida).toHaveBeenCalledTimes(1);
    await s.sesion.cerrar();
  });

  it('el chequeo corre solo cada 60 s', async () => {
    vi.useFakeTimers();
    try {
      const s = armar();
      await s.sesion.iniciar();
      s.cliente.emit('ready');
      await vi.advanceTimersByTimeAsync(0);
      expect(s.cliente.getState).not.toHaveBeenCalled();
      s.avanzar(60_000);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(s.cliente.getState).toHaveBeenCalledTimes(1);
      await s.sesion.cerrar();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(s.cliente.getState).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('estaViva', async () => {
    const s = armar();
    expect(await s.sesion.estaViva()).toBe(false);
    await s.sesion.iniciar();
    expect(await s.sesion.estaViva()).toBe(false);
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    expect(await s.sesion.estaViva()).toBe(true);
    s.cliente.getState.mockRejectedValueOnce(new Error('Target closed'));
    expect(await s.sesion.estaViva()).toBe(false);
    await s.sesion.cerrar();
  });

  it('estuvoDormida', () => {
    expect(estuvoDormida(0, 10 * 60_000)).toBe(false);
    expect(estuvoDormida(1000, 1000 + 2 * 60_000)).toBe(false);
    expect(estuvoDormida(1000, 1000 + 2 * 60_000 + 1)).toBe(true);
  });
});

describe('SesionBot: envíos', () => {
  async function conectada() {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    return s;
  }

  it('enviarTexto devuelve el id serializado del mensaje', async () => {
    const s = await conectada();
    expect(await s.sesion.enviarTexto('999@lid', 'Hola!')).toBe('true_999@lid_3EB0NUEVO');
    expect(s.cliente.sendMessage).toHaveBeenCalledWith('999@lid', 'Hola!', { sendSeen: false });
    await s.sesion.cerrar();
  });

  it('enviarTexto a un número suelto: busca su wid en WhatsApp', async () => {
    const s = await conectada();
    await s.sesion.enviarTexto('+54 9 11 5555-1234', 'Nuevo lead');
    expect(s.cliente.getNumberId).toHaveBeenCalledWith('5491155551234');
    expect(s.cliente.sendMessage.mock.calls[0][0]).toBe('5491155551234@c.us');
    s.cliente.getNumberId.mockResolvedValueOnce(null);
    await expect(s.sesion.enviarTexto('5491100001111', 'x')).rejects.toThrow(/no tiene WhatsApp/);
    await s.sesion.cerrar();
  });

  it('enviarTexto sin el id de vuelta (salió igual): devuelve "" sin tirar', async () => {
    const s = await conectada();
    s.cliente.sendMessage.mockResolvedValueOnce(undefined as never);
    expect(await s.sesion.enviarTexto('999@lid', 'Hola!')).toBe('');
    await s.sesion.cerrar();
  });

  it('enviarTexto sin sesión iniciada tira', async () => {
    const s = armar();
    await expect(s.sesion.enviarTexto('999@lid', 'x')).rejects.toThrow();
  });

  it('enviarImagen arma el medio desde la URL y lo manda', async () => {
    const s = await conectada();
    const id = await s.sesion.enviarImagen('999@lid', 'https://x.supabase.co/storage/v1/object/public/a.jpg');
    expect(s.deps.medioDesdeUrl).toHaveBeenCalledWith('https://x.supabase.co/storage/v1/object/public/a.jpg');
    expect(s.cliente.sendMessage.mock.calls[0][1]).toMatchObject({ mimetype: 'image/jpeg' });
    expect(id).toBe('true_999@lid_3EB0NUEVO');
    await s.sesion.cerrar();
  });

  it('escribiendo: typing, espera, stop', async () => {
    const s = await conectada();
    s.cliente.evaluados.length = 0;
    await s.sesion.escribiendo('999@lid', 3500);
    expect(s.deps.esperar).toHaveBeenCalledWith(3500);
    expect(s.cliente.evaluados).toEqual([
      ['999@lid', 'typing'],
      ['999@lid', 'stop'],
    ]);
    await s.sesion.cerrar();
  });

  it('escribiendo y marcarLeido no tiran si WhatsApp Web falla (son cosméticos)', async () => {
    const s = await conectada();
    s.cliente.pupPage.evaluate.mockRejectedValue(new Error('x'));
    s.cliente.sendSeen.mockRejectedValue(new Error('x'));
    await expect(s.sesion.escribiendo('999@lid', 10)).resolves.toBeUndefined();
    await expect(s.sesion.marcarLeido('999@lid')).resolves.toBeUndefined();
    await s.sesion.cerrar();
  });

  it('marcarLeido usa sendSeen del chat', async () => {
    const s = await conectada();
    await s.sesion.marcarLeido('999@lid');
    expect(s.cliente.sendSeen).toHaveBeenCalledWith('999@lid');
    await s.sesion.cerrar();
  });
});

describe('SesionBot: cierre', () => {
  it('cerrar destruye el cliente y cierra su Chromium, sin logout ni borrar el login', async () => {
    const s = armar();
    await s.sesion.iniciar();
    await s.sesion.cerrar();
    expect(s.cliente.destroy).toHaveBeenCalled();
    expect(s.cliente.logout).not.toHaveBeenCalled();
    expect(s.deps.cerrarNavegadores).toHaveBeenCalledWith(BOT);
    expect(s.deps.borrarCarpeta).not.toHaveBeenCalled();
    expect(s.cliente.listenerCount('message_create')).toBe(0);
  });

  it('cerrarSesion: logout antes de destruir y borra .wwebjs_auth/session-<botId>', async () => {
    const s = armar();
    await s.sesion.iniciar();
    await s.sesion.cerrarSesion();
    expect(s.cliente.logout).toHaveBeenCalled();
    expect(s.cliente.logout.mock.invocationCallOrder[0]).toBeLessThan(s.cliente.destroy.mock.invocationCallOrder[0]);
    expect(s.deps.borrarCarpeta).toHaveBeenCalledWith(path.resolve(process.cwd(), '.wwebjs_auth', `session-${BOT}`));
  });

  it('cerrarSesion sin sesión iniciada igual borra el login guardado', async () => {
    const s = armar();
    await s.sesion.cerrarSesion();
    expect(s.deps.borrarCarpeta).toHaveBeenCalledWith(path.resolve(process.cwd(), '.wwebjs_auth', `session-${BOT}`));
  });

  it('un logout que falla no impide borrar el login', async () => {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.logout.mockRejectedValueOnce(new Error('ya desconectado'));
    await s.sesion.cerrarSesion();
    expect(s.deps.borrarCarpeta).toHaveBeenCalled();
  });

  it('un logout colgado no traba el cierre: a los 10 s sigue con destroy y borra el login', async () => {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.logout.mockImplementationOnce(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let listo = false;
      const p = s.sesion.cerrarSesion().then(() => (listo = true));
      await vi.advanceTimersByTimeAsync(9_999);
      expect(listo).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(s.cliente.destroy).toHaveBeenCalled();
      expect(s.deps.borrarCarpeta).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('un botId inseguro no se acepta', () => {
    const h = { onQr() {}, onListo() {}, onCaida() {}, onMensaje() {}, onAck() {} };
    expect(() => new SesionBot('../otro', h)).toThrow();
  });
});

describe('SesionBot: topes de tiempo en los envíos', () => {
  async function conectada(over: Partial<DepsSesion> = {}) {
    const s = armar(over);
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    // Recién ahora: armar/conectar usan setImmediate y waitFor reales.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return s;
  }
  const nunca = <T>() => new Promise<T>(() => {});
  afterEach(() => {
    vi.useRealTimers();
  });

  it('buscar el chat de un número que no responde → falla a los 45 s (no salió nada: se puede reintentar)', async () => {
    const s = await conectada();
    s.cliente.getNumberId.mockImplementationOnce(() => nunca());
    const r = s.sesion.enviarTexto('5491166667777', 'aviso').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(44_999);
    await vi.advanceTimersByTimeAsync(1);
    const e = await r;
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(EnvioIncierto);
    expect(s.cliente.sendMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
    await s.sesion.cerrar();
  });

  it('bajar la imagen que no responde → falla a los 45 s sin mandar', async () => {
    const s = await conectada({ medioDesdeUrl: vi.fn(() => nunca<never>()) });
    const r = s.sesion.enviarImagen('999@lid', 'https://cdn/x.jpg').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(45_000);
    const e = await r;
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(EnvioIncierto);
    expect(s.cliente.sendMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
    await s.sesion.cerrar();
  });

  it('sendMessage que no vuelve → a los 90 s falla con EnvioIncierto (pudo haber salido)', async () => {
    const s = await conectada();
    s.cliente.sendMessage.mockImplementationOnce(() => nunca());
    let resultado: unknown = 'pendiente';
    const r = s.sesion.enviarTexto('999@lid', 'Hola').catch((e: unknown) => (resultado = e));
    await vi.advanceTimersByTimeAsync(89_999);
    expect(resultado).toBe('pendiente');
    await vi.advanceTimersByTimeAsync(1);
    await r;
    expect(resultado).toBeInstanceOf(EnvioIncierto);
    vi.useRealTimers();
    await s.sesion.cerrar();
  });

  it('marcarLeido y escribiendo que no responden no traban el envío (tope de 10 s)', async () => {
    const s = await conectada();
    s.cliente.sendSeen.mockImplementationOnce(() => nunca());
    s.cliente.pupPage.evaluate.mockImplementation(() => nunca());
    const leido = s.sesion.marcarLeido('999@lid');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(leido).resolves.toBeUndefined();
    const escribiendo = s.sesion.escribiendo('999@lid', 2000);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(escribiendo).resolves.toBeUndefined();
    vi.useRealTimers();
    await s.sesion.cerrar();
  });
});

describe('SesionBot: historial previo al vínculo', () => {
  const VINCULO = new Date('2026-11-10T12:00:00.000Z');
  const seg = (iso: string) => new Date(iso).getTime() / 1000;

  async function conectada() {
    const s = armar();
    await s.sesion.iniciar();
    s.cliente.emit('ready');
    await vi.waitFor(() => expect(s.h.onListo).toHaveBeenCalled());
    return s;
  }

  it('hay mensajes anteriores al vínculo → true (mira los últimos 20 del chat)', async () => {
    const s = await conectada();
    s.cliente.historial = [{ timestamp: seg('2026-10-01T10:00:00.000Z') }, { timestamp: seg('2026-11-20T10:00:00.000Z') }];
    expect(await s.sesion.tieneHistorialPrevio('5491155551234@c.us', VINCULO)).toBe(true);
    expect(s.cliente.getChatById).toHaveBeenCalledWith('5491155551234@c.us');
    expect(s.cliente.fetchMessages).toHaveBeenCalledWith({ limit: 20 });
    await s.sesion.cerrar();
  });

  it('solo mensajes posteriores al vínculo → false', async () => {
    const s = await conectada();
    s.cliente.historial = [{ timestamp: seg('2026-11-20T10:00:00.000Z') }];
    expect(await s.sesion.tieneHistorialPrevio('5491155551234@c.us', VINCULO)).toBe(false);
    await s.sesion.cerrar();
  });

  it('si WhatsApp Web falla → false', async () => {
    const s = await conectada();
    s.cliente.getChatById.mockRejectedValueOnce(new Error('chat no encontrado'));
    expect(await s.sesion.tieneHistorialPrevio('5491155551234@c.us', VINCULO)).toBe(false);
    await s.sesion.cerrar();
  });

  it('si WhatsApp Web no responde en 10 s → false', async () => {
    const s = await conectada();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      s.cliente.getChatById.mockImplementationOnce(() => new Promise(() => {}));
      const r = s.sesion.tieneHistorialPrevio('5491155551234@c.us', VINCULO);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await r).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    await s.sesion.cerrar();
  });

  it('sin sesión conectada → false sin preguntar', async () => {
    const s = armar();
    expect(await s.sesion.tieneHistorialPrevio('5491155551234@c.us', VINCULO)).toBe(false);
    expect(s.cliente.getChatById).not.toHaveBeenCalled();
  });
});

describe('SesionBot: imágenes por URL (dependencia real)', () => {
  it('una URL a una IP interna se rechaza como EnvioImposible y no se manda nada', async () => {
    const cliente = new ClienteFalso();
    const h = { onQr: vi.fn(), onListo: vi.fn(), onCaida: vi.fn(), onMensaje: vi.fn(), onAck: vi.fn() };
    // Sin medioDesdeUrl: usa el de verdad (bajarAdjunto con validación de la URL).
    const sesion = new SesionBot(BOT, h, {
      crearCliente: () => cliente as unknown as ClienteWA,
      cerrarNavegadores: async () => 0,
      borrarCarpeta: async () => {},
      esperar: async () => {},
      log: () => {},
    });
    await sesion.iniciar();
    cliente.emit('ready');
    await vi.waitFor(() => expect(h.onListo).toHaveBeenCalled());
    const e = await sesion.enviarImagen('999@lid', 'https://169.254.169.254/latest/meta-data/').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EnvioImposible);
    expect(cliente.sendMessage).not.toHaveBeenCalled();
    await sesion.cerrar();
  });
});
