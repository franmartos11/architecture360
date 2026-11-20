import { describe, expect, it } from 'vitest';
import {
  debeRearmarAviso,
  debeResponder,
  esContestadorAutomatico,
  estaEnModoHumano,
  HORAS_MODO_HUMANO,
  DIAS_REAVISO,
  MS_AGRUPAR,
  TOPE_POR_HORA,
  TOPE_DIARIO,
  msEscribiendo,
  normalizarTelefono,
  partirRespuesta,
} from './reglas';

describe('normalizarTelefono', () => {
  it.each([
    ['+54 9 11 5555-1234', '5491155551234'],
    ['5491155551234', '5491155551234'],
    ['5491155551234@c.us', '5491155551234'],
    ['5491155551234@s.whatsapp.net', '5491155551234'],
    ['011 15 5555-1234', '5491155551234'],
    ['11 5555 1234', '5491155551234'],
    ['541155551234', '5491155551234'],
    ['00 54 9 11 5555 1234', '5491155551234'],
    ['+1 (415) 555-0100', '14155550100'],
    ['5491155551234:12@s.whatsapp.net', '5491155551234'],
    ['11 15 5555-1234', '5491155551234'],
    ['351 15 555-1234', '5493515551234'],
    ['54 11 15 5555-1234', '5491155551234'],
    ['+54 9 11 15 5555-1234', '5491155551234'],
  ])('%s -> %s', (raw, esperado) => expect(normalizarTelefono(raw)).toBe(esperado));
  it('@lid -> null', () => expect(normalizarTelefono('123456789012345@lid')).toBeNull());
  it('15 sin área -> null', () => expect(normalizarTelefono('15 5555-1234')).toBeNull());
  it('basura -> null', () => expect(normalizarTelefono('hola')).toBeNull());
  it('muy corto o muy largo -> null', () => {
    expect(normalizarTelefono('1234567')).toBeNull();
    expect(normalizarTelefono('1234567890123456')).toBeNull();
  });
});

describe('estaEnModoHumano', () => {
  const ahora = new Date('2026-11-20T15:00:00Z');
  it('modo bot', () => expect(estaEnModoHumano({ modo: 'bot', humano_hasta: null }, ahora)).toBe(false));
  it('humano vigente', () => expect(estaEnModoHumano({ modo: 'humano', humano_hasta: '2026-11-20T20:00:00Z' }, ahora)).toBe(true));
  it('humano vencido', () => expect(estaEnModoHumano({ modo: 'humano', humano_hasta: '2026-11-20T10:00:00Z' }, ahora)).toBe(false));
  it('humano permanente', () => expect(estaEnModoHumano({ modo: 'humano', humano_hasta: null }, ahora)).toBe(true));
});

describe('constantes', () => {
  it('valores', () => {
    expect([HORAS_MODO_HUMANO, DIAS_REAVISO, MS_AGRUPAR, TOPE_POR_HORA, TOPE_DIARIO]).toEqual([12, 7, 8000, 30, 300]);
  });
});

describe('esContestadorAutomatico', () => {
  it('texto largo a <=6s de nuestro mensaje', () =>
    expect(esContestadorAutomatico('Gracias por escribirnos, en breve un asesor se comunicará con usted.', 4)).toBe(true));
  it('frase típica sin importar el tiempo', () =>
    expect(esContestadorAutomatico('Respuesta automática: estamos fuera de horario', null)).toBe(true));
  it('mensaje humano corto', () => expect(esContestadorAutomatico('hola, precio del 4B?', 3)).toBe(false));
  it('texto largo escrito antes de que saliera nuestro mensaje (segundos negativos) no es contestador', () =>
    expect(esContestadorAutomatico('Te escribo porque quería saber si tienen unidades de 2 ambientes', -3)).toBe(false));
  it.each([
    'Hola, cuál es el horario de atención?',
    'Bienvenido sea el que me responda jaja, quería consultar',
    'Hola! Bienvenida la info, gracias',
  ])('frases que escriben compradores reales no son contestador: %s', (t) =>
    expect(esContestadorAutomatico(t, null)).toBe(false));
  it.each([
    'Respuesta automatica: gracias por tu mensaje',
    'Gracias por comunicarte con Inmobiliaria Sur.',
    'Gracias por escribirnos!',
    'En breve te responderemos.',
    'En breve le atenderemos.',
    'Estamos fuera de horario.',
    'Nos escribiste fuera de nuestro horario.',
  ])('frases inconfundibles de contestador: %s', (t) => expect(esContestadorAutomatico(t, null)).toBe(true));
});

describe('debeResponder', () => {
  const ahora = new Date('2026-11-20T15:00:00Z');
  const base = { bot: { activo: true, vendedor_whatsapp: '5491166667777' },
    conv: { modo: 'bot', humano_hasta: null, creada_post_vinculo: true, contacto_numero: '5491155551234' },
    esContestador: false, respuestasUltimaHora: 0, mensajesHoyNumero: 0, ahora } as const;
  it('caso normal', () => expect(debeResponder(base)).toEqual({ responde: true }));
  it('bot inactivo', () => expect(debeResponder({ ...base, bot: { ...base.bot, activo: false } })).toEqual({ responde: false, motivo: 'inactivo' }));
  it('chat previo al vínculo', () => expect(debeResponder({ ...base, conv: { ...base.conv, creada_post_vinculo: false } })).toEqual({ responde: false, motivo: 'pre_vinculo' }));
  it('es el vendedor', () => expect(debeResponder({ ...base, conv: { ...base.conv, contacto_numero: '5491166667777' } })).toEqual({ responde: false, motivo: 'vendedor' }));
  it('es el vendedor en otro formato', () => expect(debeResponder({ ...base, bot: { ...base.bot, vendedor_whatsapp: '+54 9 11 6666-7777' } , conv: { ...base.conv, contacto_numero: '5491166667777' } })).toEqual({ responde: false, motivo: 'vendedor' }));
  it('humano vigente', () => expect(debeResponder({ ...base, conv: { ...base.conv, modo: 'humano', humano_hasta: '2026-11-20T20:00:00Z' } })).toEqual({ responde: false, motivo: 'humano' }));
  it('humano vencido vuelve al bot', () => expect(debeResponder({ ...base, conv: { ...base.conv, modo: 'humano', humano_hasta: '2026-11-20T10:00:00Z' } })).toEqual({ responde: true }));
  it('humano sin fecha = permanente', () => expect(debeResponder({ ...base, conv: { ...base.conv, modo: 'humano', humano_hasta: null } })).toEqual({ responde: false, motivo: 'humano' }));
  it('contestador', () => expect(debeResponder({ ...base, esContestador: true })).toEqual({ responde: false, motivo: 'contestador' }));
  it('tope por hora', () => expect(debeResponder({ ...base, respuestasUltimaHora: 30 })).toEqual({ responde: false, motivo: 'tope_conversacion' }));
  it('tope diario', () => expect(debeResponder({ ...base, mensajesHoyNumero: 300 })).toEqual({ responde: false, motivo: 'tope_diario' }));
});

describe('debeRearmarAviso', () => {
  it('nunca avisado', () => expect(debeRearmarAviso(null, [])).toBe(true));
  it('avisado y sigue la charla', () => expect(debeRearmarAviso('2026-11-19T10:00:00Z', ['2026-11-19T09:58:00Z', '2026-11-20T14:00:00Z'])).toBe(false));
  it('vuelve tras 11 días y sigue escribiendo', () => expect(debeRearmarAviso('2026-11-01T10:00:00Z', ['2026-11-01T09:58:00Z', '2026-11-12T10:00:00Z', '2026-11-12T10:05:00Z'])).toBe(true));
  it('hueco de 6 días no rearma', () => expect(debeRearmarAviso('2026-11-01T10:00:00Z', ['2026-11-01T09:58:00Z', '2026-11-07T09:00:00Z'])).toBe(false));
});

describe('partirRespuesta', () => {
  it('un párrafo = una parte', () => expect(partirRespuesta('Hola!')).toEqual(['Hola!']));
  it('máx 3 partes', () => expect(partirRespuesta('a\n\nb\n\nc\n\nd')).toHaveLength(3));
  it('nada supera 4000', () => partirRespuesta('x'.repeat(9000)).forEach(p => expect(p.length).toBeLessThanOrEqual(4000)));
  it('dos párrafos de 5000 -> <=3 partes de <=4000', () => {
    const r = partirRespuesta(`${'x'.repeat(5000)}\n\n${'y'.repeat(5000)}`);
    expect(r.length).toBeLessThanOrEqual(3);
    r.forEach(p => expect(p.length).toBeLessThanOrEqual(4000));
  });
  it('20000 caracteres -> 3 partes, última con …', () => {
    const r = partirRespuesta('x'.repeat(20000));
    expect(r).toHaveLength(3);
    r.forEach(p => expect(p.length).toBeLessThanOrEqual(4000));
    expect(r[2].endsWith('…')).toBe(true);
  });
  it('no parte pares sustitutos', () => {
    const r = partirRespuesta('😀'.repeat(5000));
    r.forEach(p => expect(p).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/));
  });
  it('texto vacío -> []', () => expect(partirRespuesta('  ')).toEqual([]));
});

it('msEscribiendo acotado', () => {
  expect(msEscribiendo('ok')).toBe(2000);
  expect(msEscribiendo('x'.repeat(5000))).toBe(8000);
});
