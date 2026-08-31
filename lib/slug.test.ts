import { describe, it, expect, vi } from 'vitest';
import { slugify, ensureUniqueSlug } from './slug';

describe('slugify', () => {
  it('pasa a minúsculas y separa por guiones', () => {
    expect(slugify('Torre del Mar')).toBe('torre-del-mar');
  });

  it('saca acentos y diéresis (NFD + rango de combining marks)', () => {
    expect(slugify('Ñoño & Cía. — Edición')).toBe('nono-cia-edicion');
  });

  it('colapsa símbolos/espacios consecutivos en un solo guion', () => {
    expect(slugify('  --Múltiples   espacios--  ')).toBe('multiples-espacios');
  });

  it('recorta guiones al principio/final', () => {
    expect(slugify('-hola-')).toBe('hola');
  });

  it('string vacío o solo símbolos da string vacío', () => {
    expect(slugify('')).toBe('');
    expect(slugify('###')).toBe('');
  });
});

// Fake query builder: encadenable (select/like/eq) y thenable (awaitable
// directo), igual que el PostgrestFilterBuilder real de supabase-js.
function makeQueryBuilder(result: { data: unknown; error: unknown }, eqSpy?: (col: string, val: unknown) => void) {
  const builder = {
    select: () => builder,
    like: () => builder,
    eq: (col: string, val: unknown) => {
      eqSpy?.(col, val);
      return builder;
    },
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  return builder;
}

describe('ensureUniqueSlug', () => {
  it('devuelve la base tal cual si no está tomada', async () => {
    const supabase = { from: () => makeQueryBuilder({ data: [], error: null }) };
    const slug = await ensureUniqueSlug(supabase as never, { table: 'projects', column: 'slug', base: 'torre-del-mar' });
    expect(slug).toBe('torre-del-mar');
  });

  it('agrega -2 si la base ya está tomada', async () => {
    const supabase = { from: () => makeQueryBuilder({ data: [{ slug: 'torre-del-mar' }], error: null }) };
    const slug = await ensureUniqueSlug(supabase as never, { table: 'projects', column: 'slug', base: 'torre-del-mar' });
    expect(slug).toBe('torre-del-mar-2');
  });

  it('sigue incrementando hasta encontrar un número libre', async () => {
    const taken = [{ slug: 'torre-del-mar' }, { slug: 'torre-del-mar-2' }, { slug: 'torre-del-mar-3' }];
    const supabase = { from: () => makeQueryBuilder({ data: taken, error: null }) };
    const slug = await ensureUniqueSlug(supabase as never, { table: 'projects', column: 'slug', base: 'torre-del-mar' });
    expect(slug).toBe('torre-del-mar-4');
  });

  it('base vacía cae a "sin-nombre"', async () => {
    const supabase = { from: () => makeQueryBuilder({ data: [], error: null }) };
    const slug = await ensureUniqueSlug(supabase as never, { table: 'projects', column: 'slug', base: '' });
    expect(slug).toBe('sin-nombre');
  });

  it('tira si la consulta devuelve error', async () => {
    const supabase = { from: () => makeQueryBuilder({ data: null, error: new Error('db down') }) };
    await expect(
      ensureUniqueSlug(supabase as never, { table: 'projects', column: 'slug', base: 'torre-del-mar' })
    ).rejects.toThrow('db down');
  });

  it('restringe la unicidad al scope indicado', async () => {
    const eqSpy = vi.fn();
    const supabase = { from: () => makeQueryBuilder({ data: [], error: null }, eqSpy) };
    await ensureUniqueSlug(supabase as never, {
      table: 'units',
      column: 'slug',
      base: 'unidad-1',
      scope: { column: 'project_id', value: 'project-1' },
    });
    expect(eqSpy).toHaveBeenCalledWith('project_id', 'project-1');
  });
});
