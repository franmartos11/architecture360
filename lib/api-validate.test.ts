import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseJsonBody, uuidSchema, emailSchema, optionalUrlSchema } from './api-validate';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('parseJsonBody', () => {
  const schema = z.object({ name: z.string().min(1, 'Falta el nombre') });

  it('body válido: devuelve { data }', async () => {
    const result = await parseJsonBody(jsonRequest({ name: 'Ana' }), schema);
    expect('data' in result && result.data).toEqual({ name: 'Ana' });
  });

  it('body que no es JSON: 400 con mensaje genérico', async () => {
    const result = await parseJsonBody(jsonRequest('no-es-json{{'), schema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
      expect((await result.error.json()).error).toBe('Body inválido — se esperaba JSON.');
    }
  });

  it('body que no cumple el schema: 400 con "campo: mensaje"', async () => {
    const result = await parseJsonBody(jsonRequest({ name: '' }), schema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
      expect((await result.error.json()).error).toBe('name: Falta el nombre');
    }
  });

  it('error en el nodo raíz (sin path): mensaje sin prefijo de campo', async () => {
    const result = await parseJsonBody(jsonRequest(123), z.string());
    expect('error' in result).toBe(true);
    if ('error' in result) {
      const message = (await result.error.json()).error as string;
      expect(message.startsWith(':')).toBe(false);
    }
  });
});

describe('schemas reutilizables', () => {
  it('uuidSchema acepta un UUID válido y rechaza cualquier otra cosa', () => {
    expect(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    expect(uuidSchema.safeParse('no-es-un-uuid').success).toBe(false);
  });

  it('emailSchema valida formato y longitud máxima', () => {
    expect(emailSchema.safeParse('a@b.com').success).toBe(true);
    expect(emailSchema.safeParse('no-es-un-email').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@b.com`).success).toBe(false);
  });

  it('optionalUrlSchema acepta undefined, string vacío, o una URL válida', () => {
    expect(optionalUrlSchema.safeParse(undefined).success).toBe(true);
    expect(optionalUrlSchema.safeParse('').success).toBe(true);
    expect(optionalUrlSchema.safeParse('https://ejemplo.com').success).toBe(true);
    expect(optionalUrlSchema.safeParse('no-es-una-url').success).toBe(false);
  });
});
