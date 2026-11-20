import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaSalida } from '@/types/whatsapp-bot';
import { despacharUno, Despachador, type DepsDespacho } from './despacho';
import { salidaPrueba } from './prueba-fixtures';
import type { EnSerie } from './serie';
import { EnvioImposible, EnvioIncierto } from './tope';

function deps(item: WaSalida | null, p: Pick<Partial<DepsDespacho>, 'enSerie' | 'log'> = {}) {
  const orden: string[] = [];
  const anotar =
    <A extends unknown[], R>(nombre: string, r: (...a: A) => R) =>
    (...a: A) => {
      orden.push(nombre);
      return r(...a);
    };
  const repo = {
    tomarSiguienteSalida: vi.fn(async () => item),
    registrarSalidaEnviada: vi.fn(anotar('registrarSalidaEnviada', async () => {})),
    marcarFallo: vi.fn(anotar('marcarFallo', async () => {})),
    sumarMensajeDelDia: vi.fn(anotar('sumarMensajeDelDia', async () => 1)),
  };
  const sesion = {
    enviarTexto: vi.fn(anotar('enviarTexto', async () => 'true_549@c.us_W1')),
    enviarImagen: vi.fn(anotar('enviarImagen', async () => 'true_549@c.us_W2')),
    escribiendo: vi.fn(anotar<[string, number], Promise<void>>('escribiendo', async () => {})),
    marcarLeido: vi.fn(anotar('marcarLeido', async () => {})),
  };
  const terminar = vi.fn(anotar('terminarEnvio', () => {}));
  const d = {
    sb: {} as SupabaseClient,
    repo,
    sesion,
    esperar: vi.fn(anotar('esperar', async (ms: number) => void ms)),
    azar: () => 0.5,
    registrarWaId: vi.fn(anotar('registrarWaId', (waId: string) => void waId)),
    envios: { empezar: vi.fn(anotar('empezarEnvio', () => terminar)) },
    log: vi.fn(),
    ...p,
  };
  return { d, orden, terminar };
}

describe('despacharUno', () => {
  it('sin ítems → vacio', async () => {
    const { d } = deps(null);
    expect(await despacharUno(d, 'bot1')).toBe('vacio');
    expect(d.repo.tomarSiguienteSalida).toHaveBeenCalledWith(d.sb, 'bot1');
    expect(d.sesion.enviarTexto).not.toHaveBeenCalled();
  });

  it('texto: marcarLeido → escribiendo (2–8 s) → enviarTexto → registrarWaId → registrar enviada → pausa', async () => {
    const s = salidaPrueba();
    const { d, orden } = deps(s);
    expect(await despacharUno(d, 'bot1')).toBe('enviado');
    expect(orden).toEqual([
      'marcarLeido',
      'escribiendo',
      'empezarEnvio',
      'enviarTexto',
      'registrarWaId',
      'terminarEnvio',
      'registrarSalidaEnviada',
      'sumarMensajeDelDia',
      'esperar',
    ]);
    expect(d.sesion.marcarLeido).toHaveBeenCalledWith('5491155551234@c.us');
    const [wid, ms] = d.sesion.escribiendo.mock.calls[0];
    expect(wid).toBe('5491155551234@c.us');
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThanOrEqual(8000);
    expect(d.sesion.enviarTexto).toHaveBeenCalledWith('5491155551234@c.us', 'Hola, te cuento');
    expect(d.registrarWaId).toHaveBeenCalledWith('true_549@c.us_W1');
    expect(d.repo.registrarSalidaEnviada).toHaveBeenCalledWith(d.sb, s, 'true_549@c.us_W1', 'bot');
    expect(d.envios.empezar).toHaveBeenCalledWith('5491155551234@c.us', { cuerpo: 'Hola, te cuento', adjunto: false });
    // Pausa entre ítems: 1–3 s.
    const pausa = d.esperar.mock.calls[0][0];
    expect(pausa).toBeGreaterThanOrEqual(1000);
    expect(pausa).toBeLessThanOrEqual(3000);
  });

  it('un texto largo escribe más tiempo, con tope de 8 s', async () => {
    const { d } = deps(salidaPrueba({ cuerpo: 'x'.repeat(5000) }));
    await despacharUno(d, 'bot1');
    expect(d.sesion.escribiendo.mock.calls[0][1]).toBe(8000);
  });

  it('enviarTexto lanza → marcarFallo con intentos + 1; no registra nada', async () => {
    const { d, terminar } = deps(salidaPrueba({ intentos: 2 }));
    d.sesion.enviarTexto.mockRejectedValueOnce(new Error('WhatsApp no respondió'));
    expect(await despacharUno(d, 'bot1')).toBe('fallo');
    expect(d.repo.marcarFallo).toHaveBeenCalledWith(d.sb, 's1', 3, 'WhatsApp no respondió');
    expect(d.repo.registrarSalidaEnviada).not.toHaveBeenCalled();
    expect(d.registrarWaId).not.toHaveBeenCalled();
    expect(d.repo.sumarMensajeDelDia).not.toHaveBeenCalled();
    expect(terminar).toHaveBeenCalled();
  });

  it('ítem con adjunto_url → enviarImagen', async () => {
    const s = salidaPrueba({ cuerpo: null, adjunto_url: 'https://cdn/x/1.jpg' });
    const { d } = deps(s);
    expect(await despacharUno(d, 'bot1')).toBe('enviado');
    expect(d.sesion.enviarImagen).toHaveBeenCalledWith('5491155551234@c.us', 'https://cdn/x/1.jpg');
    expect(d.sesion.enviarTexto).not.toHaveBeenCalled();
    expect(d.envios.empezar).toHaveBeenCalledWith('5491155551234@c.us', { cuerpo: null, adjunto: true });
    expect(d.repo.registrarSalidaEnviada).toHaveBeenCalledWith(d.sb, s, 'true_549@c.us_W2', 'bot');
  });

  it("origen 'aviso' → no marca leído ni escribe; destino pelado tal cual; no cuenta en el tope diario", async () => {
    const s = salidaPrueba({ origen: 'aviso', conversacion_id: null, destino: '5491166667777', cuerpo: '🔥 Cliente' });
    const { d } = deps(s);
    expect(await despacharUno(d, 'bot1')).toBe('enviado');
    expect(d.sesion.marcarLeido).not.toHaveBeenCalled();
    expect(d.sesion.escribiendo).not.toHaveBeenCalled();
    expect(d.sesion.enviarTexto).toHaveBeenCalledWith('5491166667777', '🔥 Cliente');
    expect(d.repo.sumarMensajeDelDia).not.toHaveBeenCalled();
  });

  it("origen 'vendedor' → se registra con autor vendedor y no cuenta en el tope diario", async () => {
    const s = salidaPrueba({ origen: 'vendedor', autor_id: 'u1' });
    const { d } = deps(s);
    await despacharUno(d, 'bot1');
    expect(d.repo.registrarSalidaEnviada).toHaveBeenCalledWith(d.sb, s, 'true_549@c.us_W1', 'vendedor');
    expect(d.repo.sumarMensajeDelDia).not.toHaveBeenCalled();
  });

  it("origen 'bot' suma al contador diario del bot", async () => {
    const { d } = deps(salidaPrueba());
    await despacharUno(d, 'bot1');
    expect(d.repo.sumarMensajeDelDia).toHaveBeenCalledWith(d.sb, { id: 'bot1' });
  });

  it("WhatsApp no devolvió id ('') → se registra con wa_id null y no se recuerda", async () => {
    const s = salidaPrueba();
    const { d } = deps(s);
    d.sesion.enviarTexto.mockResolvedValueOnce('');
    expect(await despacharUno(d, 'bot1')).toBe('enviado');
    expect(d.repo.registrarSalidaEnviada).toHaveBeenCalledWith(d.sb, s, null, 'bot');
    expect(d.registrarWaId).not.toHaveBeenCalled();
  });

  it('si el registro falla dos veces y anda a la tercera: un solo envío, registrado una vez', async () => {
    const s = salidaPrueba();
    const { d } = deps(s);
    d.repo.registrarSalidaEnviada
      .mockRejectedValueOnce(new Error('supabase caído'))
      .mockRejectedValueOnce(new Error('supabase caído'));
    expect(await despacharUno(d, 'bot1')).toBe('enviado');
    expect(d.sesion.enviarTexto).toHaveBeenCalledTimes(1);
    expect(d.repo.registrarSalidaEnviada).toHaveBeenCalledTimes(3);
    for (const c of d.repo.registrarSalidaEnviada.mock.calls) expect(c).toEqual([d.sb, s, 'true_549@c.us_W1', 'bot']);
    // Esperas crecientes entre intentos (1 s, 3 s) y después la pausa normal entre ítems.
    expect(d.esperar.mock.calls.map((c) => c[0])).toEqual([1000, 3000, 2000]);
    expect(d.repo.marcarFallo).not.toHaveBeenCalled();
  });

  it('si el registro no anda nunca: 4 intentos (1, 3 y 9 s), lo loguea, NO marca fallo y cuenta como enviado', async () => {
    const { d } = deps(salidaPrueba());
    d.repo.registrarSalidaEnviada.mockRejectedValue(new Error('supabase caído'));
    expect(await despacharUno(d, 'bot1')).toBe('enviado');
    expect(d.sesion.enviarTexto).toHaveBeenCalledTimes(1);
    expect(d.repo.registrarSalidaEnviada).toHaveBeenCalledTimes(4);
    expect(d.esperar.mock.calls.map((c) => c[0])).toEqual([1000, 3000, 9000, 2000]);
    expect(d.repo.marcarFallo).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });

  it('envío incierto (sendMessage no volvió a tiempo): NO marca fallo; queda para el reclamo de colgados', async () => {
    const { d, terminar } = deps(salidaPrueba({ intentos: 1 }));
    d.sesion.enviarTexto.mockRejectedValueOnce(new EnvioIncierto('WhatsApp Web no respondió en 90 s'));
    expect(await despacharUno(d, 'bot1')).toBe('fallo');
    expect(d.repo.marcarFallo).not.toHaveBeenCalled();
    expect(d.repo.registrarSalidaEnviada).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
    expect(terminar).toHaveBeenCalled();
  });

  it('se venció la preparación del envío (antes de mandar) → marcarFallo: no salió nada', async () => {
    const { d } = deps(salidaPrueba({ adjunto_url: 'https://cdn/x.jpg', cuerpo: null }));
    d.sesion.enviarImagen.mockRejectedValueOnce(new Error('Bajar la imagen no respondió en 45 s'));
    expect(await despacharUno(d, 'bot1')).toBe('fallo');
    expect(d.repo.marcarFallo).toHaveBeenCalledWith(d.sb, 's1', 1, 'Bajar la imagen no respondió en 45 s');
  });

  it('adjunto rechazado (EnvioImposible) → pasa a error de una (intentos = 5), sin reintentos', async () => {
    const { d } = deps(salidaPrueba({ adjunto_url: 'https://169.254.169.254/x.jpg', cuerpo: null, intentos: 0 }));
    d.sesion.enviarImagen.mockRejectedValueOnce(new EnvioImposible('Adjunto rechazado: el host apunta a una dirección privada'));
    expect(await despacharUno(d, 'bot1')).toBe('descartado');
    expect(d.repo.marcarFallo).toHaveBeenCalledWith(
      d.sb,
      's1',
      5,
      'Adjunto rechazado: el host apunta a una dirección privada',
    );
    expect(d.repo.registrarSalidaEnviada).not.toHaveBeenCalled();
  });

  it('el registro corre en la serie de su conversación', async () => {
    const enSerie = vi.fn((...a: [string, () => Promise<unknown>]) => a[1]());
    const { d } = deps(salidaPrueba(), { enSerie: enSerie as unknown as EnSerie });
    await despacharUno(d, 'bot1');
    expect(enSerie).toHaveBeenCalledWith('conv1', expect.any(Function));
  });
});

describe('Despachador', () => {
  it('despacha en serie hasta vaciar la cola', async () => {
    const resultados: ('enviado' | 'vacio')[] = ['enviado', 'enviado', 'vacio'];
    const ronda = vi.fn(async () => resultados.shift() ?? 'vacio');
    const d = new Despachador(ronda, () => true);
    await d.pulsar();
    expect(ronda).toHaveBeenCalledTimes(3);
  });

  it('un pulso durante una ronda no corre otra en paralelo: repite al terminar', async () => {
    let enCurso = 0;
    let max = 0;
    let llamadas = 0;
    const ronda = vi.fn(async () => {
      enCurso++;
      max = Math.max(max, enCurso);
      await new Promise((r) => setTimeout(r, 5));
      enCurso--;
      return ++llamadas === 1 ? ('enviado' as const) : ('vacio' as const);
    });
    const d = new Despachador(ronda, () => true);
    const p1 = d.pulsar();
    const p2 = d.pulsar();
    await Promise.all([p1, p2]);
    expect(max).toBe(1);
    // 1ª vuelta: enviado + vacio; el pulso que llegó en el medio fuerza otra vuelta.
    expect(ronda).toHaveBeenCalledTimes(3);
  });

  it('corta la vuelta ante un fallo (no quema intentos de los demás ítems)', async () => {
    const ronda = vi.fn(async () => 'fallo' as const);
    const d = new Despachador(ronda, () => true);
    await d.pulsar();
    expect(ronda).toHaveBeenCalledTimes(1);
  });

  it('un ítem descartado no corta la vuelta: sigue con el próximo', async () => {
    const resultados: ('descartado' | 'enviado' | 'vacio')[] = ['descartado', 'enviado', 'vacio'];
    const ronda = vi.fn(async () => resultados.shift() ?? 'vacio');
    const d = new Despachador(ronda, () => true);
    await d.pulsar();
    expect(ronda).toHaveBeenCalledTimes(3);
  });

  it('sin sesión conectada no despacha', async () => {
    const ronda = vi.fn(async () => 'enviado' as const);
    const d = new Despachador(ronda, () => false);
    await d.pulsar();
    expect(ronda).not.toHaveBeenCalled();
  });

  it('si una ronda tira, lo loguea y queda listo para el próximo pulso', async () => {
    const ronda = vi.fn<() => Promise<'enviado' | 'vacio' | 'fallo'>>().mockRejectedValueOnce(new Error('x')).mockResolvedValue('vacio');
    const log = vi.fn();
    const d = new Despachador(ronda, () => true, log);
    await d.pulsar();
    expect(log).toHaveBeenCalled();
    await d.pulsar();
    expect(ronda).toHaveBeenCalledTimes(2);
  });
});
