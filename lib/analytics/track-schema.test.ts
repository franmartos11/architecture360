import { describe, it, expect } from 'vitest';
import { trackSchema } from './track-schema';

const U = '11111111-1111-4111-8111-111111111111';

describe('trackSchema', () => {
  it('acepta la descarga de una ficha con su unidad', () => {
    const r = trackSchema.safeParse({ id: U, projectSlug: 'torre-sol', visitorId: U, sessionId: U, type: 'ficha', path: '/edificio/b/unidad/A', unitId: U });
    expect(r.success).toBe(true);
  });

  it('acepta el primer mensaje del chat del sitio', () => {
    const r = trackSchema.safeParse({ id: U, projectSlug: 'torre-sol', visitorId: U, sessionId: U, type: 'chat', path: '/' });
    expect(r.success).toBe(true);
  });
});
