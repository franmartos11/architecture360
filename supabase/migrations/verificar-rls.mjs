/**
 * Comprueba que las políticas de lectura pública hacen lo que dicen.
 *
 * Corre ANTES y DESPUÉS de aplicar 2026-09-23-rls-borradores.sql:
 * antes tiene que fallar (es el agujero que la migración cierra), después
 * tiene que pasar entero.
 *
 *   node supabase/migrations/verificar-rls.mjs
 *
 * Crea un proyecto de prueba sin publicar, con un edificio, un piso y una
 * unidad con precio, y lo borra al terminar pase lo que pase.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const SLUG = `zz-prueba-rls-${Date.now()}`;
let projectId = null;
const resultados = [];
const chequear = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok, detalle });
  console.log(`  ${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

try {
  // ── armar un proyecto SIN publicar ────────────────────────────────
  const { data: owner } = await admin.from('profiles').select('id').limit(1).single();
  const { data: proj, error: e1 } = await admin.from('projects').insert({
    slug: SLUG, name: 'Proyecto de prueba RLS', published: false,
    owner_id: owner.id, location: 'Nowhere',
  }).select('id').single();
  if (e1) throw new Error(`no se pudo crear el proyecto de prueba: ${e1.message}`);
  projectId = proj.id;

  const { data: b } = await admin.from('buildings')
    .insert({ project_id: projectId, name: 'T1', slug: 't1', total_floors: 1 }).select('id').single();
  const { data: f } = await admin.from('floors')
    .insert({ building_id: b.id, number: 1, label: 'P1' }).select('id').single();
  await admin.from('units')
    .insert({ floor_id: f.id, code: 'SECRETO-101', type: 'apartment', price: 999999, status: 'available' });
  await admin.from('amenities').insert({ project_id: projectId, name: 'Amenity secreto', sort_order: 0 });

  console.log(`\nProyecto sin publicar creado (${SLUG}). Leyendo con la anon key:\n`);

  // ── lo que NO debería verse ───────────────────────────────────────
  const { data: pAnon } = await anon.from('projects').select('id').eq('slug', SLUG);
  chequear('el proyecto en borrador NO se lee', (pAnon ?? []).length === 0,
    (pAnon ?? []).length ? 'se filtró' : '');

  const { data: bAnon } = await anon.from('buildings').select('id').eq('project_id', projectId);
  chequear('sus edificios NO se leen', (bAnon ?? []).length === 0);

  const { data: uAnon } = await anon.from('units').select('code, price').eq('code', 'SECRETO-101');
  chequear('sus unidades y precios NO se leen', (uAnon ?? []).length === 0,
    (uAnon ?? []).length ? `precio expuesto: ${uAnon[0].price}` : '');

  const { data: aAnon } = await anon.from('amenities').select('id').eq('project_id', projectId);
  chequear('sus amenities NO se leen', (aAnon ?? []).length === 0);

  // ── lo que SÍ tiene que seguir viéndose ───────────────────────────
  await admin.from('projects').update({ published: true }).eq('id', projectId);
  const { data: pPub } = await anon.from('projects').select('id').eq('slug', SLUG);
  chequear('al publicarlo SÍ se lee', (pPub ?? []).length === 1);

  const { data: uPub } = await anon.from('units').select('code').eq('code', 'SECRETO-101');
  chequear('publicado, sus unidades SÍ se leen', (uPub ?? []).length === 1);

  const { count } = await anon.from('projects').select('id', { count: 'exact', head: true }).eq('published', true);
  chequear('los proyectos publicados de siempre siguen visibles', (count ?? 0) > 0, `${count} visibles`);

} finally {
  if (projectId) {
    await admin.from('projects').delete().eq('id', projectId); // cascade se lleva el resto
    const { data } = await admin.from('projects').select('id').eq('id', projectId);
    console.log(`\nlimpieza: proyecto de prueba ${(data ?? []).length === 0 ? 'borrado ✓' : 'NO se pudo borrar ✗ — revisar ' + SLUG}`);
  }
  const fallaron = resultados.filter(r => !r.ok);
  console.log(fallaron.length === 0
    ? '\nTodo en orden: los borradores no se filtran y lo publicado se sigue viendo.'
    : `\n${fallaron.length} de ${resultados.length} chequeos fallaron — falta aplicar la migración.`);
  process.exit(fallaron.length === 0 ? 0 : 1);
}
