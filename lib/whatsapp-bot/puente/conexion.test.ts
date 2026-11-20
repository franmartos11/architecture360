import { describe, expect, it } from 'vitest';
import { cambiosAlConectar, debeTenerSesion, esperaReconexion, fusionarBot } from './conexion';
import { QR_VENCIDO } from './sesion';
import { botPrueba } from './prueba-fixtures';

const AHORA = new Date('2026-11-20T15:00:00.000Z');

describe('cambiosAlConectar', () => {
  it('primera vez: vinculado_at = ahora, número normalizado, sin QR ni error', () => {
    expect(cambiosAlConectar(botPrueba({ vinculado_at: null, numero: null, qr: 'data:x' }), '5491100000000', AHORA)).toEqual({
      estado: 'conectado',
      numero: '5491100000000',
      qr: null,
      ultimo_error: null,
      vinculado_at: AHORA.toISOString(),
    });
  });

  it('mismo número: no pisa vinculado_at', () => {
    const c = cambiosAlConectar(botPrueba({ vinculado_at: '2026-11-10T12:00:00.000Z', numero: '5491100000000' }), '5491100000000', AHORA);
    expect(c.vinculado_at).toBe('2026-11-10T12:00:00.000Z');
  });

  it('vincularon otro número: vinculado_at = ahora', () => {
    const c = cambiosAlConectar(botPrueba({ vinculado_at: '2026-11-10T12:00:00.000Z', numero: '5491100000000' }), '5491199999999', AHORA);
    expect(c).toMatchObject({ numero: '5491199999999', vinculado_at: AHORA.toISOString() });
  });

  it('el mismo número escrito distinto no cuenta como cambio', () => {
    const c = cambiosAlConectar(botPrueba({ vinculado_at: '2026-11-10T12:00:00.000Z', numero: '5491100000000' }), '541100000000', AHORA);
    expect(c.vinculado_at).toBe('2026-11-10T12:00:00.000Z');
  });
});

describe('fusionarBot', () => {
  it('toma lo leído de la base pero conserva un vinculado_at local más nuevo (todavía sin guardar)', () => {
    const local = botPrueba({ vinculado_at: '2026-11-20T15:00:00.000Z', numero: '5491199999999' });
    const remoto = botPrueba({ vinculado_at: null, numero: null, activo: false });
    expect(fusionarBot(local, remoto)).toMatchObject({
      activo: false,
      vinculado_at: '2026-11-20T15:00:00.000Z',
      numero: '5491199999999',
    });
  });

  it('si la base ya tiene lo mismo o algo más nuevo, gana la base', () => {
    const local = botPrueba({ vinculado_at: '2026-11-10T12:00:00.000Z' });
    const remoto = botPrueba({ vinculado_at: '2026-11-20T15:00:00.000Z', nombre_bot: 'Lu' });
    expect(fusionarBot(local, remoto)).toEqual(remoto);
  });
});

describe('debeTenerSesion', () => {
  it('pedido conectar o reiniciar', () => {
    expect(debeTenerSesion(botPrueba({ estado: 'desconectado', pedido: 'conectar' }))).toBe(true);
    expect(debeTenerSesion(botPrueba({ estado: 'desconectado', pedido: 'reiniciar' }))).toBe(true);
  });

  it('conectado o esperando QR (el puente se reinició)', () => {
    expect(debeTenerSesion(botPrueba({ estado: 'conectado' }))).toBe(true);
    expect(debeTenerSesion(botPrueba({ estado: 'esperando_qr' }))).toBe(true);
  });

  it('desconectado sin pedido, o pedido desconectar: no', () => {
    expect(debeTenerSesion(botPrueba({ estado: 'desconectado' }))).toBe(false);
    expect(debeTenerSesion(botPrueba({ estado: 'conectado', pedido: 'desconectar' }))).toBe(false);
  });

  it('error: sí, salvo que nadie haya escaneado el QR', () => {
    expect(debeTenerSesion(botPrueba({ estado: 'error', ultimo_error: 'WhatsApp se desconectó: x' }))).toBe(true);
    expect(debeTenerSesion(botPrueba({ estado: 'error', ultimo_error: QR_VENCIDO }))).toBe(false);
  });
});

describe('esperaReconexion', () => {
  it('30 s y crece hasta 5 min', () => {
    expect(esperaReconexion(0)).toBe(30_000);
    expect(esperaReconexion(1)).toBe(60_000);
    expect(esperaReconexion(2)).toBe(120_000);
    expect(esperaReconexion(3)).toBe(240_000);
    expect(esperaReconexion(4)).toBe(300_000);
    expect(esperaReconexion(50)).toBe(300_000);
  });
});
