import { vi } from 'vitest';

/**
 * Mock genérico del cliente de Supabase para testear rutas de app/api/**.
 *
 * En vez de armar a mano, en cada archivo de test, un query builder con la
 * cadena exacta de métodos que usa esa ruta (.select().eq().order()...),
 * `mockSupabase()` da un cliente donde CADA llamada a `.from(table)` consume
 * el siguiente resultado de una cola que el test arma de antemano, en el
 * mismo orden en que la ruta hace esas llamadas. El objeto que devuelve
 * `.from()` acepta cualquier método encadenado (select/eq/in/order/limit/
 * lt/gte/is/neq/insert/update/delete/upsert/single/maybeSingle/...) sin
 * necesidad de listarlos — y es awaitable directo, como el query builder
 * real de supabase-js.
 *
 * Ejemplo (ver app/api/leads/route.test.ts y app/api/admin/units/route.test.ts
 * para casos completos):
 *
 *   const supabase = mockSupabase({
 *     user: { id: 'user-1' },
 *     results: [
 *       { data: { id: 'project-1', owner_id: 'owner-1' } }, // .from('projects')...maybeSingle()
 *       { error: null },                                     // .from('leads').insert(...)
 *     ],
 *   });
 *   vi.mocked(createClient).mockResolvedValue(supabase as never);
 *
 * Si la ruta hace más llamadas a `.from()` que resultados en la cola, el
 * mock tira un error claro en vez de devolver `undefined` silenciosamente
 * (que rompería con un TypeError confuso lejos de la causa real).
 */

export interface MockResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

/** Envoltorio encadenable + awaitable alrededor de un resultado fijo. */
function chain(result: MockResult) {
  const proxy: unknown = new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (r: MockResult) => void) => resolve(result);
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => Promise.resolve(result);
      }
      // Cualquier otro método de la cadena (select, eq, in, order, limit,
      // lt, gte, is, neq, ilike, insert, update, delete, upsert, ...)
      // devuelve el mismo proxy para poder seguir encadenando.
      return (..._args: unknown[]) => proxy;
    },
  });
  return proxy as PromiseLike<MockResult> & Record<string, (...args: unknown[]) => unknown>;
}

export interface MockSupabaseOptions {
  /** Resultados de cada llamada a `.from(...)`, EN ORDEN de aparición en la ruta. */
  results?: MockResult[];
  /** Usuario logueado para `supabase.auth.getUser()` — `null`/omitido = anónimo. */
  user?: { id: string; email?: string } | null;
  /** Config de `supabase.storage.from(bucket)` — solo hace falta en rutas de upload/delete de archivos. */
  storage?: {
    upload?: MockResult;
    remove?: MockResult;
    getPublicUrl?: { data: { publicUrl: string } };
  };
}

export function mockSupabase({ results = [], user = null, storage }: MockSupabaseOptions = {}) {
  const queue = [...results];
  const from = vi.fn((table: string) => {
    if (queue.length === 0) {
      throw new Error(
        `mockSupabase: se quedó sin resultados en la cola (llamada #${from.mock.calls.length} a .from('${table}')). ` +
          `Agregá una entrada más a \`results\`, en el orden en que la ruta llama a .from().`
      );
    }
    return chain(queue.shift()!);
  });

  return {
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue(storage?.upload ?? { data: null, error: null }),
        remove: vi.fn().mockResolvedValue(storage?.remove ?? { data: null, error: null }),
        getPublicUrl: vi.fn().mockReturnValue(storage?.getPublicUrl ?? { data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/project-media/mock.png' } }),
      })),
    },
  };
}

/** Construye un `Request` de Next.js para pasarle directo al route handler. */
export function jsonRequest(url: string, body?: unknown, init: RequestInit = {}): Request {
  return new Request(url, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
}
