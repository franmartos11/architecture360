import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Estas tablas las escribe SOLO el servidor (con service-role), después de validar,
// sanitizar y limitar la frecuencia. La anon key viaja en el bundle: si alguna de
// estas tablas tuviera una policy que permita INSERT a anon/authenticated (un
// `for insert`, o un `for all`, que también incluye insert), cualquiera podría
// insertar directo en /rest/v1/<tabla> salteándose todo eso.
const SOLO_SERVIDOR = ['leads', 'notifications', 'posts', 'post_comments', 'project_comments', 'events', 'messages', 'conversations'];

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

// Las policies que el archivo CREA (las que tienen `create policy`, no los `drop`).
const policies = [...schema.matchAll(/create policy "([^"]+)" on (\w+) for (\w+)/g)].map(m => ({ name: m[1], table: m[2], command: m[3] }));

describe('schema.sql: tablas que solo escribe el servidor', () => {
  it('encuentra las policies (que el test no pase en vacío)', () => {
    expect(policies.length).toBeGreaterThan(50);
  });

  it.each(SOLO_SERVIDOR)('%s no tiene policy de INSERT (ni "for all") para usuarios', table => {
    const abiertas = policies.filter(p => p.table === table && (p.command === 'insert' || p.command === 'all'));
    expect(abiertas.map(p => `${p.name} (for ${p.command})`)).toEqual([]);
  });

  it.each(SOLO_SERVIDOR)('%s retira la policy de insert vieja en bases que ya la tenían', table => {
    // Cada tabla tiene su `drop policy if exists` del nombre anterior, para que volver a correr el
    // archivo en una base existente la saque. Si no hay ningún drop, la policy vieja sobreviviría.
    expect(schema).toMatch(new RegExp(`drop policy if exists "[^"]+" on ${table};`));
  });
});
