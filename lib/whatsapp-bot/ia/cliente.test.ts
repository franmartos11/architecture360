import { describe, expect, it } from 'vitest';
import { crearClienteClaude } from './cliente';

// _options es interno del SDK, pero es la única forma de ver los headers sin red.
const headers = (c: unknown) => (c as { _options: { defaultHeaders?: Record<string, string> } })._options.defaultHeaders;

describe('crearClienteClaude', () => {
  it('con ANTHROPIC_WORKSPACE_ID manda el header del workspace', () => {
    const c = crearClienteClaude({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_WORKSPACE_ID: ' wrkspc_1 ' });
    expect(headers(c)).toEqual({ 'anthropic-workspace-id': 'wrkspc_1' });
  });
  it('sin workspace no agrega headers', () => {
    expect(headers(crearClienteClaude({ ANTHROPIC_API_KEY: 'k' }))).toBeUndefined();
  });

  it('pone un tiempo máximo y pocos reintentos (los del SDK son 10 min y 2)', () => {
    const c = crearClienteClaude({ ANTHROPIC_API_KEY: 'k' }) as unknown as { timeout: number; maxRetries: number };
    expect(c.timeout).toBe(90_000);
    expect(c.maxRetries).toBe(1);
  });
  it('el simulador puede pedir límites más cortos', () => {
    const c = crearClienteClaude({ ANTHROPIC_API_KEY: 'k' }, { timeout: 25_000, maxRetries: 0 }) as unknown as { timeout: number; maxRetries: number };
    expect(c.timeout).toBe(25_000);
    expect(c.maxRetries).toBe(0);
  });
});
