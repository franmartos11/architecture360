import { describe, expect, it } from 'vitest';
import type { WaAutor, WaMensaje, WaTipo } from '@/types/whatsapp-bot';
import { aMensajesClaude } from './historial';

let seq = 0;
function msg(autor: WaAutor, cuerpo: string | null, tipo: WaTipo = 'texto'): WaMensaje {
  seq += 1;
  return {
    id: `m${seq}`,
    conversacion_id: 'c1',
    wa_id: `w${seq}`,
    direccion: autor === 'cliente' ? 'entrante' : 'saliente',
    autor,
    tipo,
    cuerpo,
    media_path: null,
    enviado_at: new Date(Date.UTC(2026, 10, 20, 12, 0, seq)).toISOString(),
    ack: null,
    created_at: new Date(Date.UTC(2026, 10, 20, 12, 0, seq)).toISOString(),
    orden_at: null,
    salida_id: null,
  };
}

describe('aMensajesClaude', () => {
  it('descarta el bot inicial, une consecutivos y prefija al vendedor', () => {
    const r = aMensajesClaude([
      msg('bot', 'Hola, soy Sofía'),
      msg('cliente', 'Hola'),
      msg('cliente', '¿Tienen 2 ambientes?'),
      msg('vendedor', 'Te llamo mañana'),
    ]);
    expect(r).toEqual([
      { role: 'user', content: 'Hola\n¿Tienen 2 ambientes?' },
      { role: 'assistant', content: '[Mensaje del equipo de ventas] Te llamo mañana' },
    ]);
  });

  it('el mensaje escrito desde el teléfono también va como equipo de ventas y se une al bot', () => {
    const r = aMensajesClaude([
      msg('cliente', 'Hola'),
      msg('bot', '¡Hola! ¿En qué te ayudo?'),
      msg('telefono', 'Soy Juan, del equipo'),
      msg('cliente', 'Genial'),
    ]);
    expect(r).toEqual([
      { role: 'user', content: 'Hola' },
      {
        role: 'assistant',
        content: '¡Hola! ¿En qué te ayudo?\n[Mensaje del equipo de ventas] Soy Juan, del equipo',
      },
      { role: 'user', content: 'Genial' },
    ]);
  });

  it('audio e imagen del cliente pasan como marcadores', () => {
    const r = aMensajesClaude([
      msg('cliente', null, 'audio'),
      msg('cliente', 'mirá esto', 'imagen'),
      msg('cliente', null, 'imagen'),
    ]);
    expect(r).toEqual([
      {
        role: 'user',
        content:
          '[El cliente mandó un audio]\n[El cliente mandó una imagen] mirá esto\n[El cliente mandó una imagen]',
      },
    ]);
  });

  it('ignora textos vacíos', () => {
    const r = aMensajesClaude([msg('cliente', '  '), msg('cliente', 'Hola')]);
    expect(r).toEqual([{ role: 'user', content: 'Hola' }]);
  });

  it('con 60 mensajes manda como mucho los últimos 40 y empieza en user', () => {
    const ms: WaMensaje[] = [];
    for (let i = 0; i < 60; i++) ms.push(msg(i % 2 === 0 ? 'cliente' : 'bot', `m${i}`));
    const r = aMensajesClaude(ms);
    expect(r.length).toBeLessThanOrEqual(40);
    expect(r[0].role).toBe('user');
    expect(r[0].content).toBe('m20');
    expect(r[r.length - 1].content).toBe('m59');
  });

  it('ordena por enviado_at aunque lleguen desordenados', () => {
    const a = msg('cliente', 'primero');
    const b = msg('bot', 'segundo');
    const c = msg('cliente', 'tercero');
    expect(aMensajesClaude([c, a, b]).map(m => m.content)).toEqual(['primero', 'segundo', 'tercero']);
  });

  it('ordena por orden_at cuando lo hay: la respuesta del bot queda antes del cliente que escribió mientras respondía', () => {
    const m1 = msg('cliente', 'M1');
    m1.enviado_at = '2026-11-20T12:00:00.000Z';
    const m2 = msg('cliente', 'M2');
    m2.enviado_at = '2026-11-20T12:00:05.000Z';
    const r = msg('bot', 'Respuesta a M1');
    r.enviado_at = '2026-11-20T12:00:09.000Z';
    r.orden_at = '2026-11-20T12:00:00.001Z';
    const out = aMensajesClaude([m1, m2, r]);
    expect(out.map(m => m.content)).toEqual(['M1', 'Respuesta a M1', 'M2']);
    expect(out[out.length - 1].role).toBe('user');
  });

  it('sin mensajes de cliente devuelve vacío', () => {
    expect(aMensajesClaude([msg('bot', 'hola'), msg('vendedor', 'hola')])).toEqual([]);
  });
});
