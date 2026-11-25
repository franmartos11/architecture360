import { describe, it, expect } from 'vitest';
import { ConfigBot, TextoEnvio, validarConfigContraBot } from './esquemas';

describe('ConfigBot', () => {
  it('normaliza el WhatsApp del vendedor', () => {
    const r = ConfigBot.safeParse({ vendedor_whatsapp: '011 15 5555-1234' });
    expect(r.success && r.data.vendedor_whatsapp).toBe('5491155551234');
  });
  it('rechaza un WhatsApp inválido', () => {
    expect(ConfigBot.safeParse({ vendedor_whatsapp: 'abc' }).success).toBe(false);
  });
  it('vacío limpia el WhatsApp', () => {
    const r = ConfigBot.safeParse({ vendedor_whatsapp: '  ' });
    expect(r.success && r.data.vendedor_whatsapp).toBeNull();
  });
  it('conocimiento de 20001 caracteres es error; 20000 pasa', () => {
    expect(ConfigBot.safeParse({ conocimiento: 'a'.repeat(20001) }).success).toBe(false);
    expect(ConfigBot.safeParse({ conocimiento: 'a'.repeat(20000) }).success).toBe(true);
  });
  it('acepta el interruptor del chat del sitio', () => {
    const r = ConfigBot.safeParse({ chat_web: true });
    expect(r.success && r.data.chat_web).toBe(true);
    expect(ConfigBot.safeParse({ chat_web: 'si' }).success).toBe(false);
  });
  it('es parcial', () => {
    expect(ConfigBot.safeParse({}).success).toBe(true);
    expect(ConfigBot.safeParse({ activo: true }).success).toBe(true);
  });
});

describe('validarConfigContraBot', () => {
  it('error exacto si el vendedor es el número del bot', () => {
    expect(validarConfigContraBot({ vendedor_whatsapp: '5491155551234' }, { numero: '5491155551234' })).toBe(
      'El WhatsApp del vendedor no puede ser el mismo número del bot'
    );
  });
  it('null si difieren o no hay datos', () => {
    expect(validarConfigContraBot({ vendedor_whatsapp: '5491155551234' }, { numero: '5491100000000' })).toBeNull();
    expect(validarConfigContraBot({}, { numero: '5491155551234' })).toBeNull();
    expect(validarConfigContraBot({ vendedor_whatsapp: '5491155551234' }, null)).toBeNull();
  });
});

describe('TextoEnvio', () => {
  it('1 a 4000', () => {
    expect(TextoEnvio.safeParse({ texto: '' }).success).toBe(false);
    expect(TextoEnvio.safeParse({ texto: 'hola' }).success).toBe(true);
    expect(TextoEnvio.safeParse({ texto: 'a'.repeat(4001) }).success).toBe(false);
  });
});
