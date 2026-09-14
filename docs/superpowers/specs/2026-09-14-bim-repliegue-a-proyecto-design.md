# BIM, pieza A — repliegue de portfolio a proyecto

**Fecha:** 2026-09-14
**Alcance:** reanclar el subsistema BIM del autor al proyecto, de punta a punta
**Spec previa:** `2026-09-14-bim-viewer-design.md` (Fase 1 — datos y galería), cuya premisa esta spec revierte
**Piezas siguientes:** B (tipo de proyecto "BIM"), C (visor 3D real), D (BIM en la jerarquía: piso / unidad / planta / ambiente)

## Objetivo

Que un modelo BIM deje de ser una pieza suelta del portfolio del arquitecto y
pase a ser **contenido de un proyecto**: se carga desde adentro del proyecto
(en el asistente guiado o después), se ve en la landing de ese proyecto, y
muere con él.

Al terminar esta pieza no queda ninguna superficie de BIM a nivel cuenta.

## Por qué — y qué cuesta

La Fase 1 se construyó sobre "una pieza BIM es del **autor**, el proyecto es un
vínculo opcional". Toda su superficie deriva de ahí: la pantalla a nivel
cuenta, la pestaña del portfolio, y la elección al borrar un proyecto
("¿conservar tus piezas?") cuya premisa entera era que la pieza sobrevive al
proyecto.

El producto pide lo contrario. Esta spec invierte el centro de gravedad, y eso
**elimina aproximadamente la mitad de lo que la Fase 1 construyó** (lista exacta
en la decisión 6). Sobrevive la mitad que importa: la tabla `bim_models`, la
subida y validación, la limpieza de storage, la galería y el visor `/bim/[id]`.

Hallazgo que fija el alcance: **hoy un modelo asociado a un proyecto no se ve en
ninguna parte del sitio público de ese proyecto.** La sección de landing era la
"Fase 4" de la spec anterior y nunca se construyó; la única vitrina pública es
la pestaña del portfolio, que es justo la que se borra acá. Por eso la sección
de landing entra en esta pieza: sin ella, el repliegue deja a BIM sin superficie
pública.

## Decisiones tomadas

### 1. El proyecto pasa a ser dueño; `author_id` se elimina

```sql
-- Sin datos reales todavía (la feature nunca llegó a un usuario), pero la
-- migración tiene que ser segura igual: una fila huérfana haría fallar el
-- SET NOT NULL.
delete from bim_models where project_id is null;

alter table bim_models alter column project_id set not null;

alter table bim_models drop constraint if exists bim_models_project_id_fkey;
alter table bim_models add constraint bim_models_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

alter table bim_models drop column if exists author_id;
```

**`project_id` pasa a `not null` + `on delete cascade`:** una pieza sin proyecto
deja de existir como concepto, y borrar el proyecto se lleva sus piezas sin
preguntar nada.

**`author_id` se elimina, no se conserva como metadato.** Hoy es quien manda en
la autorización (RLS lo compara con `auth.uid()`) y referencia `profiles(id)`,
que es una tabla *opt-in* — se crea recién cuando la cuenta define su handle.
Esa dependencia produjo un bug real, encontrado probando en vivo: una cuenta
logueada sin portfolio no podía crear su primera pieza, y se llevaba un 500
crudo por la foreign key. Si el dueño pasa a ser el proyecto, exigir portfolio
para subir un BIM al proyecto propio no tiene ningún sentido, y la columna queda
sin un solo lector. Conservarla "por las dudas" perpetúa esa dependencia y deja
una columna muerta. Al sacarla se borra también el guard de perfil que se agregó
como parche.

RLS pasa a colgar del proyecto, con el mismo patrón que ya usa `leads`
(`supabase/schema.sql`):

```sql
drop policy if exists "public read bim_models" on bim_models;
drop policy if exists "author read own bim_models" on bim_models;
drop policy if exists "author write bim_models" on bim_models;

-- Pública: la pieza se ve si está lista, marcada visible, y su proyecto publicado.
create policy "public read bim_models" on bim_models for select to anon, authenticated
  using (
    is_public and status = 'ready'
    and exists (select 1 from projects where projects.id = bim_models.project_id and projects.published)
  );

-- Dueño del proyecto: ve y escribe todas las de sus proyectos, en cualquier estado.
create policy "project owner read bim_models" on bim_models for select to authenticated
  using (exists (
    select 1 from projects where projects.id = bim_models.project_id and projects.owner_id = auth.uid()
  ));

create policy "project owner write bim_models" on bim_models for all to authenticated
  using (exists (
    select 1 from projects where projects.id = bim_models.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = bim_models.project_id and projects.owner_id = auth.uid()
  ));
```

`is_public` se conserva como interruptor por pieza: permite ocultar un modelo
puntual sin despublicar el proyecto entero.

**Consecuencia en las rutas de API:** la autorización deja de compararse contra
`author_id` y pasa por `requireProjectAccess(projectId)`, el helper que ya
existe. Eso cierra de raíz el agujero que el review final de la Fase 1 encontró
(mandar el `projectId` de un proyecto ajeno), porque el proyecto deja de ser un
campo del body y pasa a ser el contexto de la ruta.

### 2. La administración se muda a nivel proyecto

Pantalla nueva **`/admin/proyecto/bim`**, adentro del shell de proyecto, con su
entrada en el nav al lado de Amenidades / Ubicación / Recorrido 360°. Siempre
visible: es la puerta para activar BIM en cualquier momento, no solo durante el
alta.

`BimModelList` y `BimModelEditor` se reusan tal cual. Dos cambios:

- La lista se filtra por proyecto, no por autor.
- **El desplegable "Proyecto asociado" desaparece del formulario.** Estando
  parado adentro de un proyecto, elegirlo sería redundante — y es lo que elimina
  el agujero de seguridad mencionado arriba.

### 3. En el asistente guiado: un paso más de la fase de proyecto

El asistente ya tiene una fase de "cosas que son del proyecto, no de cada
edificio" — `PROJECT_STEPS = [Ubicación, Amenities]` para edificio/loteo/dúplex
(pantalla `screen === 'proyecto'`), y esos mismos dos como pasos normales del
flujo lineal de `casa`. BIM es exactamente esa naturaleza: se carga una vez por
proyecto.

Entra con id `bim` y label **"Modelo BIM"** en los dos lugares:

- En `PROJECT_STEPS` (edificio / loteo / dúplex / único), como tercer ítem
  después de Ubicación y Amenities.
- En el `STEPS` de `casa`, como quinto y último paso — después de Datos,
  Ambientes y Tour, Ubicación y Amenities.

El contenido del paso es una decisión explícita:

> **¿Querés mostrar un modelo BIM de este proyecto?**
> [ Agregar modelo BIM ] · *Saltear — no tengo uno*

Elegir "Agregar" despliega el editor ahí mismo, sin salir del asistente.
"Saltear" avanza al paso siguiente.

El copy de la pantalla `screen === 'proyecto'` habla hoy de "dos cosas" y las
nombra ("Ubicación y Amenities no son de…"); hay que actualizarlo a tres.

### 4. "Tiene BIM" se deriva, no se guarda

**No se agrega un campo `has_bim` a `projects`.** El sí/no del asistente es
navegación de esa sesión, no estado persistido; el estado real es "hay o no hay
piezas cargadas".

El motivo es evitar dos fuentes de verdad que se desincronizan solas: con un
flag, alguien marca "sí tiene BIM", nunca carga nada, y la landing muestra una
sección vacía; o borra su última pieza y el flag queda en `true`. Derivándolo,
"tiene BIM" es cierto por construcción y la sección aparece y desaparece sola.
Es el mismo criterio que el resto de las secciones del sitio, donde
`computeEmptySectionKeys` decide por contenido real y no por una bandera.

El costo aceptado: no se puede distinguir "todavía no cargué" de "decidí que no
tiene". No cambia nada de lo que el usuario ve.

### 5. Superficie pública: sección de landing + la página propia

**Sección `bim` en la landing.** Entra en `SECTION_REGISTRY`
(`lib/project-sections.ts`) y en `components/project-landing/registry.ts`, con
lo cual queda reordenable y apagable desde `/admin/sitio` como cualquier otra.
Disponible para todos los tipos de proyecto (sin entrada en `AVAILABILITY`).
Ubicación por defecto: después de `masterplan`. Se renderiza solo si hay al
menos una pieza en `status = 'ready'`; `computeEmptySectionKeys` la marca vacía
cuando no la hay.

Requiere sumar `bimModels` al tipo `Project` y cargarlo en `getProjectBySlug`
(`data/project-repository.ts`) usando `getPublicBimModelsByProject`, que ya
existe en el repositorio y hasta ahora no tenía consumidor.

**`/bim/[id]` sobrevive** como página propia de cada pieza, con su metadata de
Open Graph — es el link corto para compartir. Lo único que cambia es de qué
depende su visibilidad: antes solo del `is_public` de la pieza, ahora además de
que el proyecto esté `published`. Eso lo resuelve la política RLS de la decisión
1, más el chequeo de `status === 'ready'` que la página ya hace.

Asimetría deliberada: el **dueño del proyecto** sí puede abrir `/bim/[id]` de una
pieza `ready` cuyo proyecto todavía está en borrador — se la permite la política
de dueño, no la pública. Es previsualización, el mismo criterio que ya rige en
`/admin/sitio`. Lo que ningún visitante anónimo puede ver es una pieza de un
proyecto no publicado.

### 6. Lo que se elimina

| Archivo / superficie | Motivo |
|---|---|
| `app/admin/(authenticated)/bim/` (página y cliente) | Reemplazado por `/admin/proyecto/bim` |
| Pestaña BIM de `components/social/ProfileTabs.tsx` | BIM deja de ser contenido de perfil |
| `components/social/BimGrid.tsx` | Solo la usaba esa pestaña |
| `bimModels` en `Portfolio` + `getPublicBimModelsByAuthor` | Sin consumidor |
| Ícono del nav y ítem del menú de cuenta en `AppShell.tsx` | Accesos a nivel cuenta |
| Card "Subí tu primer modelo BIM" en `/portfolio/[handle]` | Idem |
| `app/api/admin/projects/[id]/bim-count/` + tests | Su premisa era que la pieza sobrevive al proyecto |
| Bloque de elección BIM en `DeleteProjectModal` + flag `deleteBim` en el DELETE | Idem — ahora el cascade se las lleva sin preguntar |
| Guard de perfil en `POST /api/admin/bim` | Sin `author_id` no hay dependencia de `profiles` |

`lib/supabase/delete-bim-storage.ts` **se conserva y se sigue llamando**: el
cascade de la base borra las filas, pero nunca los objetos de Storage. El DELETE
de proyecto tiene que seguir juntando y borrando los archivos del bucket
`bim-models` antes de borrar el proyecto — ahora sin filtrar por autor y sin
preguntar.

### 7. Testing

Con `vitest`, siguiendo los patrones del repo:

- `POST`/`PATCH`/`DELETE` de piezas con la autorización nueva: un proyecto ajeno
  da 404 (RLS lo oculta), no 403.
- El `projectId` ya no se acepta por body — verificar que no haya forma de
  escribir en un proyecto ajeno.
- `DELETE` de proyecto: borra los archivos de Storage de todas sus piezas y no
  pregunta nada.
- Visibilidad pública atada a `published`: para un visitante anónimo, una pieza
  `ready` + `is_public` de un proyecto en borrador no se ve; para el dueño del
  proyecto sí (previsualización).
- `computeEmptySectionKeys` marca `bim` vacía sin piezas listas.

El visor 3D no existe todavía; los componentes de UI (pantalla de admin, paso
del asistente, sección de landing) se verifican a mano en el navegador, igual
que el resto del repo.

## Fuera de alcance

- **Pieza B** — la forma de proyecto "BIM" (un proyecto sin edificios/pisos/
  unidades, que es solo el modelo).
- **Pieza C** — la ingesta real de IFC y el visor 3D navegable. Hasta que exista,
  una "pieza BIM" sigue siendo título + descripción + galería de imágenes.
- **Pieza D** — BIM colgando de cada piso, departamento, planta de casa y
  ambiente del programa, cargado "como se carga un plano".
- Cambiar la forma de un proyecto ya creado (sigue sin exponerse en UI).
- Cualquier noción de colaborador: sin `author_id`, la autorización es
  estrictamente el dueño del proyecto vía `requireProjectAccess`.
