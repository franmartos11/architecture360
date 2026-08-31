import { describe, it, expect, afterEach } from 'vitest';
import { getSupabaseUrl, getSupabaseAnonKey, getSupabaseServiceRoleKey } from './env';

const VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const original: Record<string, string | undefined> = {};
for (const key of VARS) original[key] = process.env[key];

afterEach(() => {
  for (const key of VARS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('lectura de env vars de Supabase', () => {
  it('devuelve el valor cuando la env var está seteada', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xxx.supabase.co';
    expect(getSupabaseUrl()).toBe('https://xxx.supabase.co');
  });

  it('tira un error claro (con el nombre de la variable) si falta', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => getSupabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('getSupabaseAnonKey y getSupabaseServiceRoleKey validan su propia variable', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getSupabaseAnonKey()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(() => getSupabaseServiceRoleKey()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect(getSupabaseAnonKey()).toBe('anon-key');
    expect(getSupabaseServiceRoleKey()).toBe('service-key');
  });
});
