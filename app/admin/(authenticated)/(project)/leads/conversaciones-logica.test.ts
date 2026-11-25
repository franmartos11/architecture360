import { describe, it, expect } from 'vitest';
import {
  filtrarConversaciones, burbuja, posicionAviso, modoLabel, restanteLabel, pendientesVisibles, tiempoCorto,
  motivoPausaLabel, avisoChat, numeroVisible, tituloConversacion, pasaFiltro, esChatWeb, AVISO_CHAT_WEB,
} from './conversaciones-logica';
import type { WaConversacion, WaMensaje } from '@/types/whatsapp-bot';

const conv = (p: Partial<WaConversacion>): WaConversacion => ({
  id: 'c', bot_id: 'b', project_id: 'p', contacto_numero: '5491155551234', contacto_wid: null, contacto_nombre: null,
  creada_post_vinculo: true, modo: 'bot', humano_hasta: null, avisado_at: null, lead_id: null, resumen: null,
  ultimo_mensaje: null, ultimo_mensaje_at: null, ultimo_entrante_at: null, no_leidos: 0, ia_pausada_motivo: null, ia_visto_hasta: null,
  created_at: '2026-01-01T00:00:00Z', ...p,
});
const msg = (p: Partial<WaMensaje>): WaMensaje => ({
  id: 'm', conversacion_id: 'c', wa_id: null, direccion: 'entrante', autor: 'cliente', tipo: 'texto', cuerpo: 'x',
  media_path: null, enviado_at: '2026-01-01T10:00:00Z', ack: null, created_at: '2026-01-01T10:00:00Z',
  orden_at: null, salida_id: null, ...p,
});

describe('filtrarConversaciones', () => {
  const lista = [
    conv({ id: '1', contacto_nombre: 'José Pérez', contacto_numero: '5491155551234' }),
    conv({ id: '2', contacto_nombre: 'María', contacto_numero: '5493515550000' }),
    conv({ id: '3', contacto_nombre: null, contacto_numero: '5491144443333' }),
  ];
  it('sin búsqueda devuelve todo', () => {
    expect(filtrarConversaciones(lista, '  ')).toHaveLength(3);
  });
  it('ignora acentos, mayúsculas y espacios', () => {
    expect(filtrarConversaciones(lista, 'jose perez').map(c => c.id)).toEqual(['1']);
    expect(filtrarConversaciones(lista, 'JOSÉ  PÉREZ').map(c => c.id)).toEqual(['1']);
    expect(filtrarConversaciones(lista, 'maría').map(c => c.id)).toEqual(['2']);
  });
  it('números: solo dígitos, con formato', () => {
    expect(filtrarConversaciones(lista, '+54 9 11 5555-1234').map(c => c.id)).toEqual(['1']);
    expect(filtrarConversaciones(lista, '4444').map(c => c.id)).toEqual(['3']);
    expect(filtrarConversaciones(lista, '351').map(c => c.id)).toEqual(['2']);
  });
  it('sin resultados', () => {
    expect(filtrarConversaciones(lista, 'zzz')).toEqual([]);
  });
  it('texto sin dígitos no matchea por número', () => {
    expect(filtrarConversaciones(lista, '-')).toHaveLength(3);
  });
});

describe('burbuja', () => {
  it('cliente a la izquierda', () => {
    expect(burbuja('cliente')).toEqual({ lado: 'izquierda', etiqueta: null });
  });
  it('bot, vendedor y teléfono a la derecha con etiqueta', () => {
    expect(burbuja('bot')).toEqual({ lado: 'derecha', etiqueta: 'Bot' });
    expect(burbuja('vendedor')).toEqual({ lado: 'derecha', etiqueta: 'Vos' });
    expect(burbuja('vendedor', 'Carla')).toEqual({ lado: 'derecha', etiqueta: 'Carla' });
    expect(burbuja('telefono')).toEqual({ lado: 'derecha', etiqueta: 'Desde el celular' });
  });
});

describe('posicionAviso', () => {
  const ms = [
    msg({ id: 'a', enviado_at: '2026-01-01T10:00:00Z' }),
    msg({ id: 'b', enviado_at: '2026-01-01T10:05:00Z' }),
    msg({ id: 'c', enviado_at: '2026-01-01T10:10:00Z' }),
  ];
  it('null sin aviso', () => {
    expect(posicionAviso(ms, null)).toBeNull();
  });
  it('antes del primer mensaje posterior', () => {
    expect(posicionAviso(ms, '2026-01-01T10:07:00Z')).toBe(2);
    expect(posicionAviso(ms, '2026-01-01T09:00:00Z')).toBe(0);
  });
  it('al final si todos son anteriores', () => {
    expect(posicionAviso(ms, '2026-01-01T11:00:00Z')).toBe(3);
  });
  it('usa orden_at si existe', () => {
    const m2 = [msg({ id: 'a', enviado_at: '2026-01-01T12:00:00Z', orden_at: '2026-01-01T10:00:00Z' })];
    expect(posicionAviso(m2, '2026-01-01T11:00:00Z')).toBe(1);
  });
  it('lista vacía: 0', () => {
    expect(posicionAviso([], '2026-01-01T11:00:00Z')).toBe(0);
  });
});

describe('restanteLabel y modoLabel', () => {
  const now = new Date('2026-01-01T10:00:00Z').getTime();
  it('formatea el tiempo restante', () => {
    expect(restanteLabel('2026-01-01T22:00:00Z', now)).toBe('12 h');
    expect(restanteLabel('2026-01-01T21:30:00Z', now)).toBe('11 h 30 min');
    expect(restanteLabel('2026-01-01T10:45:00Z', now)).toBe('45 min');
    expect(restanteLabel('2026-01-01T10:00:20Z', now)).toBe('menos de 1 min');
    expect(restanteLabel('2026-01-01T09:00:00Z', now)).toBeNull();
    expect(restanteLabel(null, now)).toBeNull();
  });
  it('modo bot', () => {
    expect(modoLabel(conv({ modo: 'bot' }), now)).toEqual({ humano: false, texto: '🤖 Bot respondiendo', accion: 'tomar' });
  });
  it('modo humano con y sin vencimiento', () => {
    expect(modoLabel(conv({ modo: 'humano', humano_hasta: '2026-01-01T21:30:00Z' }), now))
      .toEqual({ humano: true, texto: '👤 Atendido por vos · vuelve al bot en 11 h 30 min', accion: 'devolver' });
    expect(modoLabel(conv({ modo: 'humano' }), now)).toEqual({ humano: true, texto: '👤 Atendido por vos', accion: 'devolver' });
  });
  it('modo humano vencido = el bot ya responde (misma regla que estaEnModoHumano): botón "Tomar chat"', () => {
    expect(modoLabel(conv({ modo: 'humano', humano_hasta: '2026-01-01T09:00:00Z' }), now))
      .toEqual({ humano: false, texto: '🤖 Bot respondiendo', accion: 'tomar' });
  });
  it('chat previo al vínculo: atendido por vos, sin "Devolver al bot"', () => {
    expect(modoLabel(conv({ creada_post_vinculo: false, modo: 'humano', humano_hasta: null }), now))
      .toEqual({ humano: true, texto: '👤 Atendido por vos', accion: null });
  });
});

describe('motivo de pausa de la IA', () => {
  it.each([
    ['contestador', 'Parece un contestador automático'],
    ['tope_conversacion', 'Llegó al tope de respuestas por hora'],
    ['tope_diario', 'Llegó al tope diario del número'],
    ['error', 'Hubo un error con la IA'],
    ['refusal', 'La IA no quiso responder este mensaje'],
    ['inactivo', 'El bot está apagado'],
    ['pre_vinculo', 'Chat anterior a vincular el número: lo atendés vos'],
    ['max_iteraciones', 'La IA no pudo terminar la respuesta'],
  ])('%s → %s', (motivo, texto) => expect(motivoPausaLabel(motivo)).toBe(texto));
  it('sin motivo, humano o desconocido → null', () => {
    expect(motivoPausaLabel(null)).toBeNull();
    expect(motivoPausaLabel('humano')).toBeNull();
    expect(motivoPausaLabel('otra_cosa')).toBeNull();
  });
  it('avisoChat: un chat previo al vínculo siempre se explica', () => {
    expect(avisoChat(conv({ creada_post_vinculo: false, ia_pausada_motivo: null }))).toBe('Chat anterior a vincular el número: lo atendés vos');
    expect(avisoChat(conv({ ia_pausada_motivo: 'error' }))).toBe('Hubo un error con la IA');
    expect(avisoChat(conv({}))).toBeNull();
  });
});

describe('numeroVisible / tituloConversacion', () => {
  it('un @lid sin resolver es "Número oculto"', () => {
    expect(numeroVisible(conv({ contacto_numero: '123456789012345@lid' }))).toBe('Número oculto');
    expect(tituloConversacion(conv({ contacto_numero: '123456789012345@lid' }))).toBe('Número oculto');
  });
  it('un teléfono va con +; el nombre tiene prioridad en el título', () => {
    expect(numeroVisible(conv({}))).toBe('+5491155551234');
    expect(tituloConversacion(conv({ contacto_nombre: ' Ana ' }))).toBe('Ana');
    expect(tituloConversacion(conv({ contacto_nombre: '  ' }))).toBe('+5491155551234');
  });
});

describe('pendientesVisibles', () => {
  const p = (salidaId: string) => ({ salidaId, cuerpo: 'hola', estado: 'pendiente' as const });
  it('descarta las que ya llegaron como mensaje', () => {
    const ms = [msg({ salida_id: 's1' })];
    expect(pendientesVisibles([p('s1'), p('s2')], ms).map(x => x.salidaId)).toEqual(['s2']);
  });
});

describe('pendientesVisibles con salidas del servidor', () => {
  const p = (salidaId: string) => ({ salidaId, cuerpo: 'hola', estado: 'pendiente' as const });
  it('error del servidor marca error', () => {
    const r = pendientesVisibles([p('s1')], [], [{ id: 's1', estado: 'error', cuerpo: 'hola' }]);
    expect(r[0].estado).toBe('error');
  });
  it('enviando/pendiente se muestran como pendiente', () => {
    const r = pendientesVisibles([p('s1')], [], [{ id: 's1', estado: 'enviando', cuerpo: 'hola' }]);
    expect(r[0].estado).toBe('pendiente');
  });
  it('un error que se recupera vuelve a pendiente', () => {
    const base = [{ salidaId: 's1', cuerpo: 'hola', estado: 'error' as const }];
    expect(pendientesVisibles(base, [], [{ id: 's1', estado: 'pendiente', cuerpo: 'hola' }])[0].estado).toBe('pendiente');
  });
  it('el mensaje llegado gana sobre el error', () => {
    const r = pendientesVisibles([p('s1')], [msg({ salida_id: 's1' })], [{ id: 's1', estado: 'error', cuerpo: 'hola' }]);
    expect(r).toEqual([]);
  });
  it('sin dato del servidor se conserva', () => {
    expect(pendientesVisibles([p('s1')], [], [])[0].estado).toBe('pendiente');
  });
});

describe('tiempoCorto', () => {
  it('hora hoy, "ayer", fecha antes', () => {
    const now = new Date('2026-01-10T15:00:00');
    expect(tiempoCorto('2026-01-10T09:05:00', now)).toMatch(/09:05|9:05/);
    expect(tiempoCorto('2026-01-09T20:00:00', now)).toBe('ayer');
    expect(tiempoCorto('2026-01-02T20:00:00', now)).toMatch(/2/);
    expect(tiempoCorto(null, now)).toBe('');
  });
});

describe('charlas del chat del sitio', () => {
  const ahora = Date.parse('2026-11-20T15:00:00Z');
  const web = conv({ id: 'w', canal: 'web', contacto_numero: null, creada_post_vinculo: false, no_leidos: 0 });
  const wa = conv({ id: 'a', no_leidos: 2 });
  const humano = conv({ id: 'h', modo: 'humano', humano_hasta: '2026-11-21T00:00:00Z' });

  it('esChatWeb', () => {
    expect(esChatWeb(web)).toBe(true);
    expect(esChatWeb(wa)).toBe(false);
    expect(esChatWeb(conv({ canal: undefined }))).toBe(false);
  });

  it('el filtro Web deja solo las del sitio', () => {
    expect([web, wa, humano].filter(c => pasaFiltro(c, 'web', ahora)).map(c => c.id)).toEqual(['w']);
  });

  it('Sin leer, Bot y Vendedor no incluyen las del sitio', () => {
    expect([web, wa, humano].filter(c => pasaFiltro(c, 'sin_leer', ahora)).map(c => c.id)).toEqual(['a']);
    expect([web, wa, humano].filter(c => pasaFiltro(c, 'bot', ahora)).map(c => c.id)).toEqual(['a']);
    expect([web, wa, humano].filter(c => pasaFiltro(c, 'vendedor', ahora)).map(c => c.id)).toEqual(['h']);
    expect([web, wa, humano].filter(c => pasaFiltro(c, 'todas', ahora))).toHaveLength(3);
  });

  it('una charla del sitio no se toma ni se devuelve, y explica por qué', () => {
    expect(modoLabel(web, ahora)).toEqual({ humano: false, texto: '💬 Chat del sitio', accion: null });
    expect(avisoChat(web)).toBe(AVISO_CHAT_WEB);
    expect(AVISO_CHAT_WEB).toBe('Esta charla fue en el sitio. Seguí por WhatsApp o teléfono con los datos del lead.');
  });

  it('sin nombre se titula "Visitante del sitio"', () => {
    expect(tituloConversacion(web)).toBe('Visitante del sitio');
  });
});
