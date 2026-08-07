/**
 * Migra el contenido hardcodeado (data/mockData.ts + data/db.json) a
 * Supabase, para tener un punto de partida real en la base en vez de
 * arrancar de una tabla vacía.
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en
 * .env.local (ver .env.local.example).
 *
 * Uso: pnpm db:seed
 *
 * Corre con el soporte nativo de TypeScript y de .env de Node 20.6+/24
 * (--env-file), sin depender de tsx/esbuild ni de la librería dotenv.
 *
 * Es idempotente: si el proyecto 'demo' ya existe, lo borra (cascade)
 * y lo vuelve a crear, así se puede correr las veces que haga falta
 * mientras se ajusta el esquema.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { demoProject } from '../data/mockData.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    '✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local.\n' +
    '  Copiá .env.local.example a .env.local y completá las claves de tu proyecto Supabase.'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log(`→ Sembrando proyecto '${demoProject.slug}'...`);

  // Idempotencia: si ya existe, lo borramos (cascade se lleva edificios/pisos/unidades/aéreas).
  await supabase.from('projects').delete().eq('slug', demoProject.slug);

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .insert({
      slug: demoProject.slug,
      name: demoProject.name,
      description: demoProject.description,
      location: demoProject.location,
      masterplan_image: demoProject.masterplanImage,
      amenities: demoProject.amenities,
      common_areas_tour: demoProject.commonAreasTour ?? null,
    })
    .select()
    .single();
  if (projectErr || !project) throw projectErr ?? new Error('No se pudo crear el proyecto');
  console.log(`  ✓ Proyecto creado (${project.id})`);

  // ─── Vistas aéreas + hotspots (necesitan los edificios ya creados) ──
  const buildingIdBySlug = new Map<string, string>();

  for (const building of demoProject.buildings) {
    const { data: b, error } = await supabase
      .from('buildings')
      .insert({
        project_id: project.id,
        slug: building.id, // en mockData.ts 'id' ya funciona como slug (ej. 'torre-a')
        name: building.name,
        total_floors: building.totalFloors,
      })
      .select()
      .single();
    if (error || !b) throw error ?? new Error(`No se pudo crear el edificio ${building.id}`);
    buildingIdBySlug.set(building.id, b.id);
    console.log(`  ✓ Edificio ${building.name} creado`);

    for (const floor of building.floors) {
      const { data: f, error: floorErr } = await supabase
        .from('floors')
        .insert({
          building_id: b.id,
          number: floor.number,
          label: floor.label,
          plan_image: floor.planImage,
          unit_dots: floor.unitDots,
        })
        .select()
        .single();
      if (floorErr || !f) throw floorErr ?? new Error(`No se pudo crear el piso ${floor.number} de ${building.id}`);

      const unitsOnFloor = demoProject.units.filter(
        u => u.buildingId === building.id && u.floor === floor.number
      );
      if (unitsOnFloor.length > 0) {
        const { error: unitsErr } = await supabase.from('units').insert(
          unitsOnFloor.map(u => ({
            floor_id: f.id,
            code: u.id,
            model_name: u.modelName,
            type: u.type,
            total_area: u.totalArea,
            inner_area: u.innerArea,
            balcony_area: u.balconyArea,
            external_area: u.externalArea,
            bedrooms: u.bedrooms,
            bathrooms: u.bathrooms,
            has_service_room: u.hasServiceRoom,
            price: u.price ?? null,
            status: u.status,
            orientation: u.orientation ?? null,
            interior_image_url: u.interiorImageUrl ?? null,
            gallery_images: u.galleryImages ?? [],
            floor_plan_3d_url: u.floorPlan3dUrl ?? null,
            plan_3d_url: u.plan3dUrl ?? null,
            technical_plan_url: u.technicalPlanUrl ?? null,
            room_plan_image: u.roomPlanImage ?? null,
            polygon: u.polygon ?? null,
            rooms: u.rooms ?? null,
            tour_image_url: u.tourImageUrl ?? null,
            tour_data: u.tourData ?? null,
          }))
        );
        if (unitsErr) throw unitsErr;
      }
    }
  }

  for (const slide of demoProject.aerialSlides) {
    const { data: s, error: slideErr } = await supabase
      .from('aerial_slides')
      .insert({
        project_id: project.id,
        image_url: slide.imageUrl,
        label: slide.label,
        sort_order: demoProject.aerialSlides.indexOf(slide),
      })
      .select()
      .single();
    if (slideErr || !s) throw slideErr ?? new Error(`No se pudo crear el slide ${slide.id}`);

    if (slide.hotspots.length > 0) {
      const { error: hotspotsErr } = await supabase.from('aerial_hotspots').insert(
        slide.hotspots.map(h => ({
          slide_id: s.id,
          building_id: buildingIdBySlug.get(h.buildingId),
          x: h.x,
          y: h.y,
        }))
      );
      if (hotspotsErr) throw hotspotsErr;
    }
  }
  console.log(`  ✓ ${demoProject.aerialSlides.length} vistas aéreas creadas`);

  // ─── calculator_settings + leads desde data/db.json (si existe) ────
  try {
    const dbJsonPath = join(process.cwd(), 'data', 'db.json');
    const dbJson = JSON.parse(readFileSync(dbJsonPath, 'utf-8'));

    if (dbJson.calculatorSettings) {
      await supabase.from('calculator_settings').upsert({
        project_id: project.id,
        interest_rate: dbJson.calculatorSettings.interestRate,
        max_years: dbJson.calculatorSettings.maxYears,
        min_down_payment: dbJson.calculatorSettings.minDownPayment,
      });
      console.log('  ✓ Configuración de calculadora migrada');
    }

    if (Array.isArray(dbJson.leads) && dbJson.leads.length > 0) {
      await supabase.from('leads').insert(
        dbJson.leads.map((l: Record<string, unknown>) => ({ ...l, project_id: project.id }))
      );
      console.log(`  ✓ ${dbJson.leads.length} leads migrados`);
    }
  } catch {
    console.log('  · data/db.json no encontrado o vacío, se omite esa parte');
  }

  console.log(`\n✓ Listo. Proyecto '${demoProject.slug}' sembrado en Supabase.`);
}

main().catch(err => {
  console.error('✗ Falló el seed:', err);
  process.exit(1);
});
