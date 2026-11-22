import { describe, it, expect, vi, beforeEach } from 'vitest';
import { serverError } from './api-errors';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('serverError', () => {
  it('devuelve un mensaje genérico con 500 y NO filtra el de la base', async () => {
    const res = serverError({ message: 'null value in column "price" of relation "units" violates not-null constraint', code: '23502' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/price|units|constraint|23502/);
    expect(body.error).toMatch(/No se pudo completar/);
  });

  it('el detalle completo queda en el log del servidor', () => {
    const err = { message: 'detalle interno', code: 'XX000' };
    serverError(err);
    expect(console.error).toHaveBeenCalledWith('[api]', expect.any(String), err);
  });

  it('acepta un mensaje propio para el usuario y otro status', async () => {
    const res = serverError(new Error('boom'), 'No se pudo preparar la subida.', 502);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'No se pudo preparar la subida.' });
  });

  it('tolera cualquier cosa como error (undefined, string)', async () => {
    expect((await serverError(undefined).json()).error).toMatch(/No se pudo completar/);
    expect(serverError('texto').status).toBe(500);
  });
});
