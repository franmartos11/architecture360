-- Migración: el borrador de un proyecto deja de ser legible desde afuera.
--
-- Contexto: las políticas de lectura pública eran `using (true)`. El filtro de
-- "publicado" estaba sólo en la app (getPublicProjectBySlug), y como la anon
-- key va en el bundle del navegador, un curl contra la API REST devolvía
-- igual los proyectos sin publicar, con precios y unidades incluidos.
--
-- Cómo aplicarla: dashboard de Supabase → SQL Editor → pegar y Run.
-- Es idempotente (cada policy hace drop ... if exists antes de crearse) y no
-- toca datos, sólo políticas.
--
-- Después de aplicarla se puede correr `node supabase/migrations/verificar-rls.mjs`
-- para comprobar que los publicados siguen visibles y los borradores no.

-- Lectura pública del contenido de un proyecto.
--
-- El filtro de "publicado" vivía sólo en la aplicación (getPublicProjectBySlug),
-- y la anon key viaja en el bundle del navegador: con un curl se podía leer un
-- proyecto en borrador — precios y disponibilidad de un lanzamiento que todavía
-- no salió. Acá la condición baja a la base, que es donde no se puede esquivar.
-- Es el mismo criterio que ya usaba bim_models más abajo.
--
-- El dueño sigue viendo lo suyo aunque esté sin publicar: de eso vive el modo
-- borrador y el preview del admin.

drop policy if exists "public read projects" on projects;
create policy "public read projects" on projects for select to anon, authenticated
  using (published or owner_id = auth.uid());

-- Las tablas de abajo no tienen estado propio de publicación: heredan el del
-- proyecto al que cuelgan. El exists() sube por las FKs, que están indexadas
-- (idx_buildings_project, idx_floors_building, idx_units_floor).

drop policy if exists "public read buildings" on buildings;
create policy "public read buildings" on buildings for select to anon, authenticated
  using (exists (
    select 1 from projects p
    where p.id = buildings.project_id and (p.published or p.owner_id = auth.uid())
  ));

drop policy if exists "public read floors" on floors;
create policy "public read floors" on floors for select to anon, authenticated
  using (exists (
    select 1 from buildings b join projects p on p.id = b.project_id
    where b.id = floors.building_id and (p.published or p.owner_id = auth.uid())
  ));

drop policy if exists "public read units" on units;
create policy "public read units" on units for select to anon, authenticated
  using (exists (
    select 1 from floors f
      join buildings b on b.id = f.building_id
      join projects p on p.id = b.project_id
    where f.id = units.floor_id and (p.published or p.owner_id = auth.uid())
  ));

drop policy if exists "public read aerial_slides" on aerial_slides;
create policy "public read aerial_slides" on aerial_slides for select to anon, authenticated
  using (exists (
    select 1 from projects p
    where p.id = aerial_slides.project_id and (p.published or p.owner_id = auth.uid())
  ));

drop policy if exists "public read aerial_hotspots" on aerial_hotspots;
create policy "public read aerial_hotspots" on aerial_hotspots for select to anon, authenticated
  using (exists (
    select 1 from aerial_slides s join projects p on p.id = s.project_id
    where s.id = aerial_hotspots.slide_id and (p.published or p.owner_id = auth.uid())
  ));

drop policy if exists "public read amenities" on amenities;
create policy "public read amenities" on amenities for select to anon, authenticated
  using (exists (
    select 1 from projects p
    where p.id = amenities.project_id and (p.published or p.owner_id = auth.uid())
  ));

drop policy if exists "public read points_of_interest" on points_of_interest;
create policy "public read points_of_interest" on points_of_interest for select to anon, authenticated
  using (exists (
    select 1 from projects p
    where p.id = points_of_interest.project_id and (p.published or p.owner_id = auth.uid())
  ));
