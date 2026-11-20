import { describe, expect, it, vi } from 'vitest';
import {
  aMensajeEntrante,
  serializarMsgId,
  tipoDeMensaje,
  tipoDeWid,
  widToString,
  type MensajeWA,
} from './mensaje';

describe('tipoDeWid', () => {
  it.each([
    ['5491155551234@c.us', { kind: 'telefono', digitos: '5491155551234' }],
    ['5491155551234@s.whatsapp.net', { kind: 'telefono', digitos: '5491155551234' }],
    // Con dispositivo (":12"): el número es lo de antes de los dos puntos.
    ['5491155551234:12@s.whatsapp.net', { kind: 'telefono', digitos: '5491155551234' }],
    ['263346104320137@lid', { kind: 'lid', lid: '263346104320137@lid' }],
    ['120363000000000000@g.us', { kind: 'grupo' }],
    ['status@broadcast', { kind: 'estado' }],
    ['120363000000000000@newsletter', { kind: 'estado' }],
    ['1234567890@broadcast', { kind: 'estado' }],
    ['sin-arroba', { kind: 'ignorar' }],
    ['@c.us', { kind: 'ignorar' }],
  ])('%s', (wid, esperado) => {
    expect(tipoDeWid(wid)).toEqual(esperado);
  });
});

describe('serializarMsgId (portado de aspa)', () => {
  it('usa _serialized si viene', () => {
    expect(serializarMsgId({ _serialized: 'true_549@c.us_ABC' })).toBe('true_549@c.us_ABC');
  });
  it('lo rearma con sus partes si WhatsApp Web no lo manda', () => {
    expect(serializarMsgId({ fromMe: false, remote: '263346104320137@lid', id: '3AF0' })).toBe(
      'false_263346104320137@lid_3AF0',
    );
    expect(
      serializarMsgId({ fromMe: true, remote: { user: '549', server: 'c.us' }, id: 'X', participant: { _serialized: '1@c.us' } }),
    ).toBe('true_549@c.us_X_1@c.us');
  });
  it('null si faltan partes', () => {
    expect(serializarMsgId(undefined)).toBeNull();
    expect(serializarMsgId({ fromMe: true, id: 'X' })).toBeNull();
  });
  it('widToString', () => {
    expect(widToString('a@c.us')).toBe('a@c.us');
    expect(widToString({ user: 'a', server: 'lid' })).toBe('a@lid');
    expect(widToString(undefined)).toBeNull();
  });
});

describe('tipoDeMensaje', () => {
  it.each([
    ['chat', 'texto'],
    ['image', 'imagen'],
    ['ptt', 'audio'],
    ['audio', 'audio'],
    ['document', 'documento'],
    ['video', 'otro'],
    ['sticker', 'otro'],
    ['location', 'otro'],
    ['vcard', 'otro'],
  ])('%s → %s', (tipo, esperado) => {
    expect(tipoDeMensaje(tipo)).toBe(esperado);
  });
  it.each(['e2e_notification', 'notification_template', 'gp2', 'call_log', 'protocol', 'revoked', 'ciphertext'])(
    '%s (de sistema) → null',
    (tipo) => {
      expect(tipoDeMensaje(tipo)).toBeNull();
    },
  );
});

function msg(p: Partial<MensajeWA> & { _data?: Record<string, unknown> } = {}): MensajeWA {
  return {
    id: { _serialized: 'false_5491155551234@c.us_3EB0', fromMe: false, remote: '5491155551234@c.us', id: '3EB0' },
    fromMe: false,
    from: '5491155551234@c.us',
    to: '5491100000000@c.us',
    type: 'chat',
    body: '  Hola, ¿qué precio tiene?  ',
    timestamp: 1_763_640_000,
    hasMedia: false,
    isStatus: false,
    _data: { notifyName: 'Juan' },
    ...p,
  } as MensajeWA;
}

const deps = (over: Partial<Parameters<typeof aMensajeEntrante>[1]> = {}) => ({
  resolverLid: vi.fn(async () => null as string | null),
  descargar: vi.fn(async () => null as { mime: string; data: Buffer } | null),
  ...over,
});

describe('aMensajeEntrante', () => {
  it('texto entrante de un @c.us', async () => {
    const m = await aMensajeEntrante(msg(), deps());
    expect(m).toMatchObject({
      waId: 'false_5491155551234@c.us_3EB0',
      deMi: false,
      wid: '5491155551234@c.us',
      numero: '5491155551234',
      nombre: 'Juan',
      esGrupo: false,
      esEstado: false,
      tipo: 'texto',
      cuerpo: 'Hola, ¿qué precio tiene?',
    });
    expect(m!.at.toISOString()).toBe(new Date(1_763_640_000 * 1000).toISOString());
  });

  it('@lid: resuelve el teléfono', async () => {
    const d = deps({ resolverLid: vi.fn(async () => '5491155551234') });
    const m = await aMensajeEntrante(
      msg({ from: '263346104320137@lid', id: { fromMe: false, remote: '263346104320137@lid', id: 'A1' } }),
      d,
    );
    expect(d.resolverLid).toHaveBeenCalledWith('263346104320137@lid');
    expect(m).toMatchObject({ wid: '263346104320137@lid', numero: '5491155551234', waId: 'false_263346104320137@lid_A1' });
  });

  it('@lid sin resolver: numero null (se usa el wid)', async () => {
    const m = await aMensajeEntrante(msg({ from: '263346104320137@lid' }), deps());
    expect(m).toMatchObject({ wid: '263346104320137@lid', numero: null });
  });

  it('mensaje mío (desde el celular): el otro lado es `to`, sin nombre', async () => {
    const m = await aMensajeEntrante(
      msg({ fromMe: true, from: '5491100000000@c.us', to: '5491155551234@c.us' }),
      deps(),
    );
    expect(m).toMatchObject({ deMi: true, wid: '5491155551234@c.us', numero: '5491155551234', nombre: null });
  });

  it('sin from/to usa el remote de la clave', async () => {
    const m = await aMensajeEntrante(msg({ from: '' }), deps());
    expect(m?.wid).toBe('5491155551234@c.us');
  });

  it('grupo, estado y canal', async () => {
    expect(await aMensajeEntrante(msg({ from: '120363@g.us' }), deps())).toMatchObject({ esGrupo: true, esEstado: false, numero: null });
    expect(await aMensajeEntrante(msg({ from: 'status@broadcast', isStatus: true }), deps())).toMatchObject({ esEstado: true });
    expect(await aMensajeEntrante(msg({ from: '120363@newsletter' }), deps())).toMatchObject({ esEstado: true });
  });

  it('no resuelve el @lid de un grupo ni de un estado', async () => {
    const d = deps();
    await aMensajeEntrante(msg({ from: '120363@g.us' }), d);
    expect(d.resolverLid).not.toHaveBeenCalled();
  });

  it('imagen con caption y su descarga', async () => {
    const d = deps({ descargar: vi.fn(async () => ({ mime: 'image/jpeg', data: Buffer.from('JPEG') })) });
    const m = await aMensajeEntrante(msg({ type: 'image', body: 'mirá esto', hasMedia: true }), d);
    expect(m).toMatchObject({ tipo: 'imagen', cuerpo: 'mirá esto' });
    expect(await m!.descargarMedio()).toEqual({ mime: 'image/jpeg', data: Buffer.from('JPEG') });
    expect(d.descargar).toHaveBeenCalledWith('false_5491155551234@c.us_3EB0');
  });

  it('audio: sin cuerpo; sin medio no descarga', async () => {
    const d = deps();
    const audio = await aMensajeEntrante(msg({ type: 'ptt', body: '', hasMedia: true }), d);
    expect(audio).toMatchObject({ tipo: 'audio', cuerpo: '' });
    const texto = await aMensajeEntrante(msg(), d);
    expect(await texto!.descargarMedio()).toBeNull();
    expect(d.descargar).not.toHaveBeenCalled();
  });

  it('ubicación: no pasa la miniatura en base64 como cuerpo', async () => {
    const m = await aMensajeEntrante(msg({ type: 'location', body: '/9j/4AAQSkZJRgABAQ...' }), deps());
    expect(m).toMatchObject({ tipo: 'otro', cuerpo: '' });
  });

  it('mensajes de sistema y textos vacíos: null', async () => {
    expect(await aMensajeEntrante(msg({ type: 'e2e_notification' }), deps())).toBeNull();
    expect(await aMensajeEntrante(msg({ body: '   ' }), deps())).toBeNull();
  });

  it('sin id utilizable: null', async () => {
    expect(await aMensajeEntrante(msg({ id: { fromMe: false } }), deps())).toBeNull();
  });
});
