import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaBot, WaConversacion } from '@/types/whatsapp-bot';
import { sbFalso, tiene, type Consulta } from './sb-falso.test-util';
import {
  contarMensajesCliente,
  conversacionWeb,
  crearConversacionWeb,
  guardarMensajeWeb,
  leadDeCharlaWeb,
  mensajesWeb,
  registrarAvisoWeb,
  turnosWebHoy,
} from './repo-web';
import type { DatosAvisoWeb } from './lead';
import { huellaToken } from './token';

const { enviarEmail, ResendFalso } = vi.hoisted(() => {
  const enviarEmail = vi.fn<(arg: unknown) => Promise<{ data: { id: string }; error: null }>>(async () => ({ data: { id: "e1" }, error: null }));
  const ResendFalso = vi.fn(function (this: unknown) {
    return { emails: { send: enviarEmail } };
  });
  return { enviarEmail, ResendFalso };
});
vi.mock('resend', () => ({ Resend: ResendFalso }));

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  enviarEmail.mockClear();
});

const TOKEN = '11111111-1111-4111-8111-111111111111';

function bot(p: Partial<WaBot> = {}): WaBot {
  return {
    id: 'bot1', project_id: 'proj1', estado: 'conectado', numero: null, qr: null, qr_at: null, vinculado_at: null,
    heartbeat_at: null, puente_host: null, puente_hasta: null, host_permitido: null, ultimo_error: null, pedido: null,
    pedido_at: null, activo: true, nombre_bot: 'Sofía', vendedor_nombre: null, vendedor_whatsapp: '11 4444-0000',
    vendedor_user_id: null, conocimiento: null, criterio_aviso: null, mensajes_hoy: 0, mensajes_hoy_fecha: null,
    chat_web: true, created_at: '', updated_at: '', ...p,
  };
}

function conv(p: Partial<WaConversacion> = {}): WaConversacion {
  return {
    id: 'cw1', bot_id: 'bot1', project_id: 'proj1', contacto_numero: null, contacto_wid: null, contacto_nombre: null,
    creada_post_vinculo: false, modo: 'bot', humano_hasta: null, avisado_at: null, lead_id: null, resumen: null,
    ultimo_mensaje: null, ultimo_mensaje_at: null, ultimo_entrante_at: null, no_leidos: 0, ia_pausada_motivo: null,
    ia_visto_hasta: null, canal: 'web', web_token: TOKEN, created_at: '', ...p,
  };
}

const datos = (p: Partial<DatosAvisoWeb> = {}): DatosAvisoWeb => ({
  telefono: '11 2233-4455', email: null, nombre: 'Ana', unidades: ['4B'], unidadesTexto: ['4B 2 amb'],
  resumen: 'Quiere visitar', conversacionId: 'cw1', visitorId: 'v1', ref: null, ...p,
});

describe('crearConversacionWeb', () => {
  it('canal web, token nuevo, sin número y fuera de lo que mira el puente', async () => {
    const f = sbFalso((q) => (q.op === 'insert' ? { data: { ...conv(), id: 'nueva' } } : undefined));
    const { conv: c, token } = await crearConversacionWeb(f.sb, { id: 'bot1', project_id: 'proj1' });
    expect(c.id).toBe('nueva');
    const v = f.escrituras()[0].valores as Record<string, unknown>;
    expect(v).toMatchObject({ bot_id: 'bot1', project_id: 'proj1', canal: 'web', contacto_numero: null, creada_post_vinculo: false });
    // La base guarda la huella: quien lea la tabla (el panel) no puede escribir como el comprador.
    expect(v.web_token).toBe(huellaToken(token));
    expect(v.web_token).not.toBe(token);
  });
});

describe('conversacionWeb', () => {
  it('busca por token, proyecto y canal web', async () => {
    const f = sbFalso(() => ({ data: conv() }));
    expect((await conversacionWeb(f.sb, 'proj1', TOKEN))?.id).toBe('cw1');
    const q = f.consultas[0];
    expect(tiene(q, 'eq', 'web_token', huellaToken(TOKEN))).toBe(true);
    expect(tiene(q, 'eq', 'project_id', 'proj1')).toBe(true);
    expect(tiene(q, 'eq', 'canal', 'web')).toBe(true);
  });

  it('token ajeno o inexistente: null', async () => {
    const f = sbFalso(() => ({ data: null }));
    expect(await conversacionWeb(f.sb, 'proj1', TOKEN)).toBeNull();
  });
});

describe('guardarMensajeWeb', () => {
  it('mensaje del cliente: entrante, actualiza la vista previa y nunca los no leídos', async () => {
    const f = sbFalso();
    const at = new Date('2026-11-20T15:00:00.000Z');
    await guardarMensajeWeb(f.sb, 'cw1', { autor: 'cliente', tipo: 'texto', cuerpo: 'Hola' }, at);
    const [ins, upd] = f.escrituras();
    expect(ins.tabla).toBe('wa_mensajes');
    expect(ins.valores).toMatchObject({ conversacion_id: 'cw1', direccion: 'entrante', autor: 'cliente', tipo: 'texto', cuerpo: 'Hola', enviado_at: at.toISOString() });
    expect(upd.tabla).toBe('wa_conversaciones');
    expect(upd.valores).toEqual({ ultimo_mensaje: 'Hola', ultimo_mensaje_at: at.toISOString(), ultimo_entrante_at: at.toISOString() });
  });

  it('imagen del bot: saliente, vista previa "Imagen"', async () => {
    const f = sbFalso();
    const at = new Date('2026-11-20T15:00:00.000Z');
    await guardarMensajeWeb(f.sb, 'cw1', { autor: 'bot', tipo: 'imagen', cuerpo: 'https://x/1.jpg' }, at);
    const [ins, upd] = f.escrituras();
    expect(ins.valores).toMatchObject({ direccion: 'saliente', autor: 'bot', tipo: 'imagen' });
    expect(upd.valores).toEqual({ ultimo_mensaje: '📷 Imagen', ultimo_mensaje_at: at.toISOString() });
  });
});

describe('consultas de límites', () => {
  it('mensajesWeb ordena por fecha', async () => {
    const f = sbFalso(() => ({ data: [{ id: 'm1' }] }));
    expect(await mensajesWeb(f.sb, 'cw1')).toEqual([{ id: 'm1' }]);
    expect(tiene(f.consultas[0], 'eq', 'conversacion_id', 'cw1')).toBe(true);
  });

  it('contarMensajesCliente cuenta solo los del cliente', async () => {
    const f = sbFalso(() => ({ count: 7 }));
    expect(await contarMensajesCliente(f.sb, 'cw1')).toBe(7);
    expect(tiene(f.consultas[0], 'eq', 'autor', 'cliente')).toBe(true);
  });

  it('turnosWebHoy cuenta el uso web desde la medianoche de Buenos Aires', async () => {
    const f = sbFalso(() => ({ count: 300 }));
    expect(await turnosWebHoy(f.sb, 'proj1', new Date('2026-11-21T02:00:00.000Z'))).toBe(300);
    const q = f.consultas[0];
    expect(q.tabla).toBe('wa_uso_ia');
    expect(tiene(q, 'eq', 'origen', 'web')).toBe(true);
    expect(tiene(q, 'gte', 'created_at', '2026-11-20T03:00:00.000Z')).toBe(true);
  });
});

describe('leadDeCharlaWeb', () => {
  it('sin lead en la charla: null', async () => {
    const f = sbFalso(() => ({ data: { lead_id: null } }));
    expect(await leadDeCharlaWeb(f.sb, 'cw1')).toBeNull();
  });

  it('con lead: su nombre y teléfono', async () => {
    const f = sbFalso((q) => (q.tabla === 'wa_conversaciones' ? { data: { lead_id: 'L1' } } : { data: { id: 'L1', name: 'Ana', phone: '5491122334455', email: null } }));
    expect(await leadDeCharlaWeb(f.sb, 'cw1')).toEqual({ id: 'L1', name: 'Ana', phone: '5491122334455', email: null });
  });
});

describe('registrarAvisoWeb', () => {
  const responder = (over: (q: Consulta) => unknown = () => undefined) => (q: Consulta) => {
    const r = over(q);
    if (r !== undefined) return r as never;
    if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: null, lead_id: null, contacto_nombre: null } };
    if (q.tabla === 'leads' && q.op === 'select') return { data: [] };
    if (q.tabla === 'leads' && q.op === 'insert') return { data: { id: 'lead1' } };
    if (q.tabla === 'wa_salida') return { data: { id: 's1' } };
    if (q.tabla === 'projects') return { data: { owner_id: 'owner1' } };
    if (q.tabla === 'project_members') return { data: [] };
    return undefined;
  };
  const llamar = (f: ReturnType<typeof sbFalso>, d = datos(), b = bot()) =>
    registrarAvisoWeb(f.sb, conv(), d, b, { name: 'Torre Sol' }, 'https://app.ejemplo.com');

  it('sin teléfono ni email: sin_contacto y no toca leads', async () => {
    const f = sbFalso(responder());
    expect(await llamar(f, datos({ telefono: null, email: null }))).toBe('sin_contacto');
    expect(f.consultas.some((q) => q.tabla === 'leads')).toBe(false);
    expect(f.escrituras()).toHaveLength(0);
  });

  it('un email sin teléfono alcanza', async () => {
    const f = sbFalso(responder());
    expect(await llamar(f, datos({ telefono: null, email: 'ana@x.com' }))).toBe('avisado');
    expect(f.escrituras().find((q) => q.tabla === 'leads')?.valores).toMatchObject({ email: 'ana@x.com', phone: null, source: 'chat_web', project_id: 'proj1' });
  });

  it('WhatsApp conectado: crea el lead, encola el aviso al vendedor y marca la charla', async () => {
    const f = sbFalso(responder());
    expect(await llamar(f)).toBe('avisado');
    const lead = f.escrituras().find((q) => q.tabla === 'leads')!;
    expect(lead.op).toBe('insert');
    expect(lead.valores).toMatchObject({ source: 'chat_web', method: 'chat', phone: '5491122334455', visitor_id: 'v1', wa_conversacion_id: 'cw1' });
    const aviso = f.escrituras().find((q) => q.tabla === 'wa_salida')!.valores as { destino: string; cuerpo: string; origen: string };
    expect(aviso.destino).toBe('5491144440000');
    expect(aviso.origen).toBe('aviso');
    expect(aviso.cuerpo).toContain('(chat del sitio)');
    expect(aviso.cuerpo).toContain('4B 2 amb');
    expect(aviso.cuerpo).toContain('admin/leads?c=cw1');
    const marca = f.escrituras().find((q) => q.tabla === 'wa_conversaciones')!;
    expect(marca.valores).toMatchObject({ lead_id: 'lead1', resumen: 'Quiere visitar', contacto_nombre: 'Ana' });
    expect((marca.valores as { avisado_at: string }).avisado_at).toBeTruthy();
  });

  it('WhatsApp desconectado: no encola, pero igual crea el lead y marca la charla', async () => {
    const f = sbFalso(responder());
    expect(await llamar(f, datos(), bot({ estado: 'desconectado' }))).toBe('avisado');
    expect(f.escrituras().some((q) => q.tabla === 'wa_salida')).toBe(false);
    expect(f.escrituras().some((q) => q.tabla === 'leads')).toBe(true);
    expect(f.escrituras().some((q) => q.tabla === 'wa_conversaciones')).toBe(true);
  });

  it('manda el email de nuevo lead diciendo que fue por el chat del sitio', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const f = sbFalso(responder());
    await llamar(f, datos({ email: 'ana@x.com' }), bot({ estado: 'desconectado' }));
    expect(enviarEmail).toHaveBeenCalledTimes(1);
    const html = (enviarEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain('chat del sitio');
    expect(html).not.toContain('por WhatsApp');
  });

  it('completa un lead existente con el mismo teléfono sin pisar su origen', async () => {
    const existente = { id: 'L9', phone: '5491122334455', source: 'whatsapp_bot', ref: 'perez', wa_conversacion_id: 'c-wa', created_at: '2026-01-01T00:00:00Z', status: 'nuevo' };
    const f = sbFalso(responder((q) => (q.tabla === 'leads' && q.op === 'select' ? { data: [existente] } : undefined)));
    expect(await llamar(f)).toBe('avisado');
    const upd = f.escrituras().find((q) => q.tabla === 'leads')!;
    expect(upd.op).toBe('update');
    expect(tiene(upd, 'eq', 'id', 'L9')).toBe(true);
    expect(upd.valores).not.toHaveProperty('source');
    expect(upd.valores).not.toHaveProperty('wa_conversacion_id');
  });

  it('trae el visitante de los leads candidatos: así nunca pisa el del primer contacto', async () => {
    const f = sbFalso(responder());
    await llamar(f, datos({ email: 'ana@x.com' }));
    const selects = f.consultas.filter((q) => q.tabla === 'leads' && q.op === 'select');
    expect(selects.length).toBe(2);
    for (const q of selects) expect(q.columnas).toContain('visitor_id');
  });

  it('charla ya avisada: ya_avisado y solo actualiza la calificación', async () => {
    const calificacion = { temperatura: 'caliente' as const, presupuesto: null, ambientes: null, plazo: null, proposito: null, financiacion: null, actualizada_at: 'x' };
    const f = sbFalso(responder((q) => {
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: '2026-11-20T10:00:00Z', lead_id: 'L1', contacto_nombre: 'Ana' } };
      if (q.tabla === 'leads' && q.op === 'select') return { data: { calificacion: null } };
      return undefined;
    }));
    expect(await llamar(f, datos({ calificacion }))).toBe('ya_avisado');
    const escrituras = f.escrituras();
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toMatchObject({ tabla: 'leads', op: 'update' });
    expect(escrituras[0].valores).toMatchObject({ calificacion: { temperatura: 'caliente' } });
  });

  it('ya avisado: un teléfono que deja después completa el lead sin pisar lo que tenía', async () => {
    const f = sbFalso(responder((q) => {
      if (q.tabla === 'wa_conversaciones' && q.op === 'select') return { data: { avisado_at: '2026-11-20T10:00:00Z', lead_id: 'L1', contacto_nombre: 'Ana' } };
      if (q.tabla === 'leads' && q.op === 'select') return { data: { id: 'L1', name: 'Ana María', email: 'ana@x.com', phone: null, calificacion: null } };
      return undefined;
    }));
    expect(await llamar(f, datos({ telefono: '11 2233-4455', email: 'otro@x.com', nombre: 'Ana' }))).toBe('ya_avisado');
    const upd = f.escrituras().find((q) => q.tabla === 'leads')!;
    expect(tiene(upd, 'eq', 'id', 'L1')).toBe(true);
    expect(upd.valores).toEqual({ phone: '5491122334455' });
    expect(f.escrituras().some((q) => q.tabla === 'wa_salida')).toBe(false);
  });
});
