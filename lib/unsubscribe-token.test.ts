import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from './unsubscribe-token';

const ID = '11111111-1111-4111-8111-111111111111';

describe('unsubscribe-token', () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.LEADS_UNSUBSCRIBE_SECRET = 'secreto-de-prueba';
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it('el token de un lead valida para ese lead', () => {
    expect(verifyUnsubscribeToken(ID, unsubscribeToken(ID))).toBe(true);
  });

  it('no sirve para otro lead', () => {
    expect(verifyUnsubscribeToken('22222222-2222-4222-8222-222222222222', unsubscribeToken(ID))).toBe(false);
  });

  it('rechaza tokens vacíos, truncados o que no son hex', () => {
    const t = unsubscribeToken(ID);
    expect(verifyUnsubscribeToken(ID, '')).toBe(false);
    expect(verifyUnsubscribeToken(ID, t.slice(0, -2))).toBe(false);
    expect(verifyUnsubscribeToken(ID, 'zz'.repeat(32))).toBe(false);
  });

  it('cambiar el secreto invalida lo firmado antes', () => {
    const t = unsubscribeToken(ID);
    process.env.LEADS_UNSUBSCRIBE_SECRET = 'otro';
    expect(verifyUnsubscribeToken(ID, t)).toBe(false);
  });

  it('sin LEADS_UNSUBSCRIBE_SECRET cae a SUPABASE_SERVICE_ROLE_KEY', () => {
    delete process.env.LEADS_UNSUBSCRIBE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    expect(verifyUnsubscribeToken(ID, unsubscribeToken(ID))).toBe(true);
  });

  it('sin ningún secreto, firmar tira y verificar da false', () => {
    delete process.env.LEADS_UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => unsubscribeToken(ID)).toThrow();
    expect(verifyUnsubscribeToken(ID, 'ab')).toBe(false);
  });

  it('unsubscribeUrl arma el link con lead y token', () => {
    const url = new URL(unsubscribeUrl('https://x.com', ID));
    expect(url.pathname).toBe('/api/leads/unsubscribe');
    expect(url.searchParams.get('lead')).toBe(ID);
    expect(verifyUnsubscribeToken(ID, url.searchParams.get('t')!)).toBe(true);
  });
});
