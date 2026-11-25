// Supabase falso para tests: registra cada consulta y responde con `responder`.
// Copia del de lib/whatsapp-bot/repo.test.ts (que queda como está). No es un test.
import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
export interface Consulta {
  tabla: string;
  op: Op;
  valores?: unknown;
  opciones?: unknown;
  columnas?: string;
  selectOpts?: unknown;
  filtros: unknown[][];
  orden: unknown[][];
  limite?: number;
  unico?: 'single' | 'maybeSingle';
}
export interface Respuesta {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export function sbFalso(responder: (q: Consulta) => Respuesta | undefined = () => undefined) {
  const consultas: Consulta[] = [];
  const getUserById = vi.fn<(id: string) => Promise<unknown>>(async () => ({
    data: { user: { id: 'owner1', email: 'duenio@ejemplo.com' } },
    error: null,
  }));
  const sb = {
    from(tabla: string) {
      const q: Consulta = { tabla, op: 'select', filtros: [], orden: [] };
      consultas.push(q);
      const filtro =
        (nombre: string) =>
        (...args: unknown[]) => {
          q.filtros.push([nombre, ...args]);
          return b;
        };
      const b: Record<string, unknown> = {
        select(cols?: string, opts?: unknown) {
          q.columnas = cols;
          q.selectOpts = opts;
          return b;
        },
        insert(v: unknown, o?: unknown) {
          Object.assign(q, { op: 'insert', valores: v, opciones: o });
          return b;
        },
        upsert(v: unknown, o?: unknown) {
          Object.assign(q, { op: 'upsert', valores: v, opciones: o });
          return b;
        },
        update(v: unknown, o?: unknown) {
          Object.assign(q, { op: 'update', valores: v, opciones: o });
          return b;
        },
        delete() {
          q.op = 'delete';
          return b;
        },
        eq: filtro('eq'),
        neq: filtro('neq'),
        is: filtro('is'),
        in: filtro('in'),
        or: filtro('or'),
        lt: filtro('lt'),
        lte: filtro('lte'),
        gt: filtro('gt'),
        gte: filtro('gte'),
        ilike: filtro('ilike'),
        order(...args: unknown[]) {
          q.orden.push(args);
          return b;
        },
        limit(n: number) {
          q.limite = n;
          return b;
        },
        single() {
          q.unico = 'single';
          return b;
        },
        maybeSingle() {
          q.unico = 'maybeSingle';
          return b;
        },
        then(ok: (r: unknown) => unknown, mal?: (e: unknown) => unknown) {
          const r = responder(q) ?? {};
          return Promise.resolve({
            data: r.data ?? null,
            error: r.error ?? null,
            count: r.count ?? null,
          }).then(ok, mal);
        },
      };
      return b;
    },
    auth: { admin: { getUserById } },
  };
  const escrituras = () => consultas.filter((c) => c.op !== 'select');
  return { sb: sb as unknown as SupabaseClient, consultas, escrituras, getUserById };
}

export const tiene = (q: Consulta, ...filtro: unknown[]) =>
  q.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro));

