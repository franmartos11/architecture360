-- ═══════════════════════════════════════════════════════════════════
-- Esquema inicial — reemplaza data/mockData.ts + data/db.json
--
-- Cómo correrlo: pegar este archivo entero en Supabase Dashboard →
-- SQL Editor → Run. Es idempotente (usa IF NOT EXISTS / OR REPLACE)
-- así que se puede volver a correr sin romper nada.
--
-- Decisión de diseño: polygon / rooms / tour_data / common_areas_tour
-- se guardan como JSONB en vez de normalizarse en tablas propias.
-- El visor los lee y el editor los escribe siempre como bloque
-- completo (nunca se hace una query relacional "dame el hotspot 3
-- del nodo 2"), así que normalizarlos sería complejidad sin
-- beneficio real.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─── Proyectos ──────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  location text,
  latitude numeric,                 -- centro del mapa de ubicación (Sprint "Ubicación y Puntos de Interés")
  longitude numeric,
  masterplan_image text,
  amenities text[] not null default '{}',
  common_areas_tour jsonb,          -- { initialNodeId, nodes: [...] }
  -- Grados (0-359, sentido horario) desde el norte real hacia donde apunta
  -- yaw=0 de common_areas_tour — null = sin calibrar, sin indicador de sol.
  tour_orientation_degrees int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Para bases que ya tenían projects creada antes de que existieran lat/lng.
alter table projects add column if not exists latitude numeric;
alter table projects add column if not exists longitude numeric;
alter table projects add column if not exists tour_orientation_degrees int;

-- ─── Dueño del proyecto (Fase 0 — fundación de cuentas) ─────────────
-- Sin esto cualquier sesión válida administra cualquier proyecto. Se
-- agrega nullable primero para poder rellenar los proyectos ya
-- existentes antes de exigirla.
alter table projects add column if not exists owner_id uuid references auth.users(id);

-- Bases nuevas para las que este bloque corre por primera vez y ya
-- tienen un proyecto sin dueño: se lo asigna a la cuenta más antigua
-- (hoy hay un solo admin creado por scripts/create-admin-user.ts). No
-- pisa proyectos que ya tengan owner_id.
update projects
set owner_id = (select id from auth.users order by created_at asc limit 1)
where owner_id is null;

-- Con todo ya asignado, se exige para cualquier proyecto nuevo.
alter table projects alter column owner_id set not null;

-- ─── Perfiles públicos (portfolio con varios proyectos agrupados) ────
-- No toda cuenta necesita esto — una inmobiliaria no tiene "portfolio",
-- por eso es una tabla aparte y opt-in (se crea recién cuando la cuenta
-- define su handle en el admin), no una columna más en auth.users.
-- El handle es la URL pública: tudominio.com/portfolio/[handle].
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  display_name text not null default '',
  bio text,
  avatar_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "public read profiles" on profiles;
create policy "public read profiles" on profiles for select to anon, authenticated using (true);

drop policy if exists "owner write profiles" on profiles;
create policy "owner write profiles" on profiles for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── Persona vs. empresa ───────────────────────────────────────────────
-- No es un tipo de cuenta nuevo (sigue siendo un solo login de Supabase) —
-- solo cambia cómo se presenta el perfil y qué agrega su portfolio público
-- (una empresa suma una sección "Equipo" derivada de sus colaboradores).
alter table profiles add column if not exists account_type text not null default 'person';
alter table profiles drop constraint if exists profiles_account_type_check;
alter table profiles add constraint profiles_account_type_check check (account_type in ('person', 'company'));

-- ─── Contacto del perfil público ──────────────────────────────────────
-- Todo opcional — un estudiante puede querer mostrar su LinkedIn sin
-- exponer el teléfono, o viceversa. Cada uno se renderiza solo si tiene valor.
alter table profiles add column if not exists location text;
alter table profiles add column if not exists avatar_image text;
alter table profiles add column if not exists banner_image text;
alter table profiles add column if not exists contact_email text;
alter table profiles add column if not exists whatsapp text;
alter table profiles add column if not exists linkedin_url text;
alter table profiles add column if not exists instagram_url text;
alter table profiles add column if not exists website_url text;

-- ─── Secciones de perfil profesional ─────────────────────────────────
-- Todas opcionales — un estudiante que no completa ninguna no ve nada
-- raro en su portfolio, simplemente esas secciones no se renderizan.
-- Se guardan como JSONB porque la estructura de cada ítem puede cambiar
-- sin requerir una migración de esquema (ej. agregar un campo "url" a
-- certifications no rompe filas viejas que no lo tienen).
alter table profiles add column if not exists experiences jsonb not null default '[]';
alter table profiles add column if not exists education jsonb not null default '[]';
alter table profiles add column if not exists certifications jsonb not null default '[]';
-- skills es un array de texto simple — no hace falta JSONB, un string
-- alcanza (ej. ["Revit", "AutoCAD", "SketchUp", "Lumion"]).
alter table profiles add column if not exists skills text[] not null default '{}';

-- ─── Posts (feed) ──────────────────────────────────────────────────────
-- A diferencia de project_comments (cualquier cuenta logueada, tenga
-- perfil o no), publicar requiere tener perfil — no tiene sentido
-- mostrar un post sin nombre/handle en un feed. RLS de escritura sin
-- join porque profiles.id = auth.uid() siempre (mismo patrón que
-- "owner write profiles").
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table posts enable row level security;

drop policy if exists "public read posts" on posts;
create policy "public read posts" on posts for select to anon, authenticated using (true);

drop policy if exists "author write posts" on posts;
create policy "author write posts" on posts for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Repost: un post normal no lo tiene; uno reposteado apunta al original.
-- on delete set null — si se borra el original, el repost queda como un
-- post huérfano en vez de desaparecer junto con el comentario que se le
-- haya agregado.
alter table posts add column if not exists shared_post_id uuid;
alter table posts drop constraint if exists posts_shared_post_id_fkey;
alter table posts add constraint posts_shared_post_id_fkey foreign key (shared_post_id) references posts(id) on delete set null;

create index if not exists idx_posts_author on posts(author_id, created_at);
create index if not exists idx_posts_created on posts(created_at);

-- ─── Likes de posts ───────────────────────────────────────────────────
create table if not exists post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

alter table post_likes enable row level security;

drop policy if exists "public read post_likes" on post_likes;
create policy "public read post_likes" on post_likes for select to anon, authenticated using (true);

drop policy if exists "own write post_likes" on post_likes;
create policy "own write post_likes" on post_likes for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create index if not exists idx_post_likes_post on post_likes(post_id);

-- ─── Comentarios de posts ─────────────────────────────────────────────
-- Mismo shape y mismas policies que project_comments: cualquier cuenta
-- logueada comenta (no requiere perfil, a diferencia de crear el post
-- en sí), autor o autor del post pueden borrar.
create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table post_comments enable row level security;

drop policy if exists "public read post_comments" on post_comments;
create policy "public read post_comments" on post_comments for select to anon, authenticated using (true);

drop policy if exists "authenticated insert own post_comments" on post_comments;
create policy "authenticated insert own post_comments" on post_comments for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "author delete own post_comments" on post_comments;
create policy "author delete own post_comments" on post_comments for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "post author delete post_comments" on post_comments;
create policy "post author delete post_comments" on post_comments for delete to authenticated
  using (exists (
    select 1 from posts where posts.id = post_comments.post_id and posts.author_id = auth.uid()
  ));

create index if not exists idx_post_comments_post on post_comments(post_id, created_at);

-- ─── Visibilidad en el portfolio (por proyecto) ──────────────────────
-- Que una cuenta tenga perfil público no significa que TODOS sus
-- proyectos deban aparecer ahí agrupados — puede tener trabajos
-- privados o comerciales de por medio. Por eso es opt-in por proyecto,
-- no automático a partir de tener profiles.handle.
alter table projects add column if not exists show_in_portfolio boolean not null default false;

-- ─── Colaboradores / créditos de proyecto ────────────────────────────
-- Quién trabajó en un proyecto, más allá de quién es su dueño. El dueño
-- acredita a otra cuenta (por su profiles.handle) con lo que hizo; ese
-- crédito nace "pending" y solo se vuelve público cuando la persona
-- acreditada lo confirma — nadie queda atribuido a algo sin haberlo
-- aceptado. No otorga acceso de edición al proyecto: es una atribución
-- pública (aparece en la ficha del proyecto y en el portfolio propio de
-- la persona), no un mecanismo de coedición.
create table if not exists project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  contribution text not null default '',
  status text not null default 'pending',
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

alter table project_collaborators drop constraint if exists project_collaborators_status_check;
alter table project_collaborators add constraint project_collaborators_status_check check (status in ('pending', 'accepted', 'declined'));

alter table project_collaborators enable row level security;

drop policy if exists "public read accepted collaborators" on project_collaborators;
create policy "public read accepted collaborators" on project_collaborators for select to anon, authenticated
  using (status = 'accepted');

drop policy if exists "owner manage collaborators" on project_collaborators;
create policy "owner manage collaborators" on project_collaborators for all to authenticated
  using (exists (
    select 1 from projects where projects.id = project_collaborators.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = project_collaborators.project_id and projects.owner_id = auth.uid()
  ));

-- La persona acreditada ve (para poder responder) y actualiza sus propias
-- invitaciones pendientes. La ruta /api/collaborators/[id]/respond solo
-- deja tocar "status" en la práctica (mismo nivel de confianza app-layer
-- que ya usa el resto del código, ej. los campos academic_* del PATCH
-- general de proyecto) aunque la policy sea de fila completa.
drop policy if exists "invitee respond collaborators" on project_collaborators;
create policy "invitee respond collaborators" on project_collaborators for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists "invitee update own collaborator row" on project_collaborators;
create policy "invitee update own collaborator row" on project_collaborators for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create index if not exists idx_project_collaborators_project on project_collaborators(project_id, status);
create index if not exists idx_project_collaborators_profile on project_collaborators(profile_id, status);

-- ─── Tipo de proyecto: forma + propósito, por separado ───────────────
-- Son dos preguntas independientes: qué FORMA tiene el desarrollo
-- (edificio/loteo/duplex/casas — project_type, determina la jerarquía
-- pisos/unidades y cómo se llama todo) y para QUÉ es (venta/showcase —
-- sale_mode, determina si se muestran precio/estado/leads/calculadora).
-- Antes vivían mezcladas en un solo valor combinado (ej. "edificio-
-- venta"), lo que hacía imposible un loteo o un dúplex puramente
-- ilustrativo — cualquier forma tiene que poder ser showcase. El
-- catálogo completo vive en lib/project-types.ts, acá solo se guardan
-- los identificadores — sin check constraint, extensible en código sin
-- pedir migración de esquema cada vez que se suma un valor.
alter table projects add column if not exists project_type text not null default 'edificio';
alter table projects add column if not exists sale_mode text not null default 'venta';

-- Backfill de los valores combinados que usaba project_type antes de
-- separar esto en dos campos — corre una sola vez: los proyectos nuevos
-- (o los ya migrados) llegan con valores que no matchean ningún WHEN acá
-- y quedan sin tocar.
update projects set project_type = 'edificio', sale_mode = 'venta' where project_type = 'edificio-venta';
update projects set project_type = 'casas', sale_mode = 'showcase' where project_type = 'casa-showcase';
update projects set project_type = 'casas', sale_mode = 'venta' where project_type = 'casas-en-venta';

-- Para bases que ya tenían project_type creada con el default viejo.
alter table projects alter column project_type set default 'edificio';

-- ─── Ficha académica (proyectos en modo showcase) ────────────────────
-- Contexto que un jurado/docente espera ver en un trabajo de facultad —
-- institución, carrera, cátedra/tutor, año, integrantes si fue grupal.
-- Todo nullable y sin relación con el resto del esquema: un proyecto
-- comercial (sale_mode = 'venta') simplemente no completa estos campos
-- y el admin no los muestra.
alter table projects add column if not exists academic_institution text;
alter table projects add column if not exists academic_career text;
alter table projects add column if not exists academic_tutor text;
alter table projects add column if not exists academic_year text;
alter table projects add column if not exists academic_team text;

-- ─── Galería de proceso y comparador antes/después ───────────────────
-- Contenido que casi ningún desarrollo comercial usa, pero central en
-- proyectos de facultad: bocetos/maquetas/diagramas aparte de las fotos
-- finales, y pares de imágenes para un reciclaje/rehabilitación. Mismo
-- criterio que la ficha académica: nullable/vacío por defecto, el admin
-- solo los muestra en modo showcase.
alter table projects add column if not exists process_gallery text[] not null default '{}';
alter table projects add column if not exists before_after jsonb not null default '[]'; -- [{ label, beforeImage, afterImage }]

-- Bajada corta del hero (ej: "3 dormitorios frente al mar en Punta del
-- Este") — separada de `description`, que es el texto largo de "Sobre el
-- proyecto" más abajo en la landing. Opcional: sin esto, el hero se ve
-- igual que siempre (solo nombre + ubicación).
alter table projects add column if not exists tagline text;

-- Orden y habilitación de las secciones de la landing — [{key, enabled}],
-- en el orden a mostrar. Vacío (default) = usar el orden y habilitación
-- por defecto del registro (ver lib/project-sections.ts), así que ningún
-- proyecto existente cambia visualmente hasta que alguien lo edite.
alter table projects add column if not exists section_config jsonb not null default '[]';

-- Tema visual de la landing — { presetKey, headingFont?, bodyFont? }.
-- Vacío (default) = preset "natural" (ver lib/theme-presets.ts), que es
-- exactamente la paleta/tipografía de siempre — así ningún proyecto
-- existente cambia visualmente hasta que alguien elija otro tema.
-- headingFont/bodyFont pueden ser una key curada o "custom:<fontId>"
-- (ver tabla `fonts` más abajo).
alter table projects add column if not exists theme_config jsonb not null default '{}';

-- ─── Edificios (torres) ─────────────────────────────────────────────
create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null,               -- usado en la URL: /edificio/[slug]
  name text not null,
  total_floors int not null default 1,
  amenities_tour jsonb,              -- { initialNodeId, nodes: [...] } — recorrido 360° exclusivo de esta torre
  created_at timestamptz not null default now(),
  unique (project_id, slug)
);

-- Para bases que ya tenían buildings creada antes de que existiera amenities_tour.
alter table buildings add column if not exists amenities_tour jsonb;

-- Foto de portada del edificio (opcional), para el admin y futuros usos en el sitio público.
alter table buildings add column if not exists cover_image text;

-- Grados (0-359, sentido horario) desde el norte real hacia donde apunta
-- yaw=0 del recorrido de este edificio (amenities_tour) — null = todavía
-- sin calibrar, no se muestra indicador de sol en el visor.
alter table buildings add column if not exists tour_orientation_degrees int;

-- ─── Pisos ──────────────────────────────────────────────────────────
create table if not exists floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  number int not null,
  label text not null,
  plan_image text,
  unit_dots jsonb not null default '[]',  -- fallback [{unitId,x,y}] para deptos sin polígono
  created_at timestamptz not null default now(),
  unique (building_id, number)
);

-- Vocación del piso — no excluyente de tener unidades (un piso 'amenity'
-- puede igual tener 1-2 unidades, ej. penthouses + terraza compartida):
-- solo determina si el admin lo nagea por "faltan unidades" y cómo se
-- presenta en el sitio público. 'units' (default) es el comportamiento de
-- siempre. floor_kind_description es texto libre para lo que un enum no
-- va a cubrir del todo (ej. "Pileta y solárium").
alter table floors add column if not exists floor_kind text not null default 'units';
alter table floors drop constraint if exists floors_floor_kind_check;
alter table floors add constraint floors_floor_kind_check
  check (floor_kind in ('units', 'amenity', 'offices', 'technical', 'parking', 'other'));
alter table floors add column if not exists floor_kind_description text;

-- ─── Unidades / departamentos ───────────────────────────────────────
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references floors(id) on delete cascade,
  code text not null,               -- ej. 'A01-01'
  model_name text,
  type text not null,
  total_area numeric,
  inner_area numeric,
  balcony_area numeric not null default 0,
  external_area numeric not null default 0,
  bedrooms int not null default 0,
  bathrooms numeric not null default 1,
  has_service_room boolean not null default false,
  lot_size numeric,                 -- superficie de terreno (m²) — solo aplica a casas
  ceiling_height numeric,           -- altura de techo (m) — solo aplica a casas
  garage_spaces int not null default 0,  -- cantidad de cocheras — solo aplica a casas
  garage_type text check (garage_type is null or garage_type in ('cubierta', 'descubierta')),
  living_rooms int not null default 1,   -- cantidad de livings — solo aplica a casas
  kitchens int not null default 1,       -- cantidad de cocinas — solo aplica a casas
  other_rooms_count int not null default 0,   -- otros ambientes (lavadero, depósito, etc.) — solo casas
  other_rooms_description text,               -- detalle libre de esos otros ambientes
  hoa_fee numeric,                  -- expensas mensuales — solo aplica a casas en barrio privado
  floors_count int not null default 1, -- cantidad de plantas de la casa
  price numeric,
  currency text not null default 'USD',
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  orientation text,
  interior_image_url text,
  gallery_images text[] not null default '{}',
  floor_plan_3d_url text,
  plan_3d_url text,
  technical_plan_url text,
  room_plan_image text,
  polygon jsonb,                    -- [{x,y}, ...] en % sobre floors.plan_image
  rooms jsonb,                      -- [{id,name,polygon,tourNodeId}, ...] de la planta baja/única
  levels jsonb,                     -- [{id,label,planImage,rooms}, ...] plantas 2+ de una casa
  tour_image_url text,
  tour_data jsonb,                  -- { initialNodeId, nodes: [...] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_id, code)
);

-- Para bases que ya tenían units creada antes de que existiera la columna
-- currency (el CREATE TABLE de arriba no la agrega retroactivamente) — el
-- default 'USD' se aplica también a las filas existentes.
alter table units add column if not exists currency text not null default 'USD';

-- Campos agregados para la carga de casas (lote/cochera/plantas) — mismo
-- motivo que currency arriba: bases ya creadas no los reciben del CREATE
-- TABLE, así que se agregan acá de forma retroactiva e idempotente.
alter table units add column if not exists lot_size numeric;
alter table units add column if not exists has_garage boolean not null default false;
alter table units add column if not exists hoa_fee numeric;
alter table units add column if not exists floors_count int not null default 1;
alter table units add column if not exists levels jsonb;

-- Rediseño de la sección "Datos" de una casa: altura de techo, cochera con
-- cantidad+tipo (reemplaza el booleano has_garage) y desglose de ambientes
-- (antes solo dormitorios/baños). has_garage se migra a garage_spaces/
-- garage_type y se elimina — no queda ningún lugar del código que siga
-- leyéndolo.
alter table units add column if not exists ceiling_height numeric;
alter table units add column if not exists garage_spaces int not null default 0;
alter table units add column if not exists garage_type text check (garage_type is null or garage_type in ('cubierta', 'descubierta'));
alter table units add column if not exists living_rooms int not null default 1;
alter table units add column if not exists kitchens int not null default 1;
alter table units add column if not exists other_rooms_count int not null default 0;
alter table units add column if not exists other_rooms_description text;

update units set garage_spaces = 1, garage_type = 'cubierta' where has_garage and garage_spaces = 0;
alter table units drop column if exists has_garage;

-- ─── Vistas aéreas (carrusel) ───────────────────────────────────────
create table if not exists aerial_slides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  image_url text not null, -- se usa siempre como poster/fallback, incluso si hay video
  video_url text, -- opcional — si está, se reproduce en loop en vez de mostrar la foto fija
  label text not null,
  sort_order int not null default 0
);

-- Para bases que ya tenían aerial_slides creada antes de que existiera video_url.
alter table aerial_slides add column if not exists video_url text;

create table if not exists aerial_hotspots (
  id uuid primary key default gen_random_uuid(),
  slide_id uuid not null references aerial_slides(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  x numeric not null,
  y numeric not null,
  polygon jsonb -- [{x,y}, ...] en % sobre la imagen del slide — silueta de la torre (opcional, si no está se usa el punto x/y)
);

-- Para bases que ya tenían aerial_hotspots creada antes de que existiera
-- la columna polygon (el CREATE TABLE de arriba no la agrega retroactivamente).
alter table aerial_hotspots add column if not exists polygon jsonb;

-- ─── Amenities (pileta, gym, SUM, etc.) ──────────────────────────────
-- building_id nulo = amenity de todo el complejo; con valor = exclusiva
-- de esa torre. tour_node_id apunta a un nodo dentro del recorrido que
-- corresponda (common_areas_tour del proyecto si building_id es nulo,
-- o amenities_tour de esa torre si no) — se resuelve en la app, no acá.
create table if not exists amenities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  building_id uuid references buildings(id) on delete cascade,
  name text not null,
  description text,
  images text[] not null default '{}',
  tour_node_id text,
  tour_3d_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Para bases que ya tenían amenities creada antes de que existiera la
-- columna tour_3d_url (el CREATE TABLE de arriba no la agrega retroactivamente).
alter table amenities add column if not exists tour_3d_url text;

-- ─── Puntos de interés (colegios, salud, comercios, etc.) ────────────
-- Georreferencian el entorno del proyecto para la sección de Ubicación.
create table if not exists points_of_interest (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  category text not null default 'otro' check (category in ('colegio', 'salud', 'comercio', 'transporte', 'entretenimiento', 'otro')),
  description text,
  distance_label text,              -- ej. "5 min caminando"
  image text,
  latitude numeric,
  longitude numeric,
  walk_minutes  int,                -- tiempo caminando (calculado via Distance Matrix)
  drive_minutes int,                -- tiempo en auto
  bike_minutes  int,                -- tiempo en bicicleta
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Para bases que ya tenían points_of_interest sin columnas de tiempo.
alter table points_of_interest add column if not exists walk_minutes  int;
alter table points_of_interest add column if not exists drive_minutes int;
alter table points_of_interest add column if not exists bike_minutes  int;

-- ─── Leads (antes vivía en data/db.json, migrado a Supabase) ─────────
-- unit_id queda sin usar desde el sitio público: el Unit.id que
-- maneja el front es el código legible (ej. "N01-07"), no el uuid
-- real de la fila — se guarda como texto libre en unit_name en su lugar.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  unit_id uuid references units(id) on delete set null,
  unit_name text,
  name text,
  email text,
  phone text,
  method text,
  message text,
  source text,
  status text not null default 'nuevo',
  created_at timestamptz not null default now()
);

-- Para bases que ya tenían leads creada antes de que existieran estas columnas.
alter table leads add column if not exists unit_name text;
alter table leads add column if not exists source text;
alter table leads add column if not exists status text not null default 'nuevo';
-- Para el rate-limit por IP del form público (ver app/api/leads/route.ts)
-- — es el único endpoint de escritura pública sin usuario logueado, así
-- que no puede contar por user_id como comments/posts/messages.
alter table leads add column if not exists ip_address text;

-- ─── Configuración de la calculadora hipotecaria ────────────────────
create table if not exists calculator_settings (
  project_id uuid primary key references projects(id) on delete cascade,
  interest_rate numeric not null default 5.5,
  max_years int not null default 30,
  min_down_payment numeric not null default 20
);

-- ─── Comentarios en la ficha de un proyecto ──────────────────────────
-- Cualquier cuenta logueada puede comentar cualquier proyecto público —
-- no hace falta ser el dueño ni tener perfil propio. author_id apunta a
-- auth.users (no a profiles) para que funcione aunque la cuenta nunca
-- haya definido un handle público.
create table if not exists project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table project_comments enable row level security;

drop policy if exists "public read comments" on project_comments;
create policy "public read comments" on project_comments for select to anon, authenticated using (true);

drop policy if exists "authenticated insert own comments" on project_comments;
create policy "authenticated insert own comments" on project_comments for insert to authenticated
  with check (author_id = auth.uid());

-- Borra su propio comentario, o el dueño del proyecto por moderación —
-- dos policies permisivas de delete, se combinan con OR.
drop policy if exists "author delete own comments" on project_comments;
create policy "author delete own comments" on project_comments for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "owner delete project comments" on project_comments;
create policy "owner delete project comments" on project_comments for delete to authenticated
  using (exists (
    select 1 from projects where projects.id = project_comments.project_id and projects.owner_id = auth.uid()
  ));

create index if not exists idx_project_comments_project on project_comments(project_id, created_at);

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- El sitio público lee con la clave "anon" → solo SELECT en lo que
-- se muestra al público, y solo INSERT en leads (para el formulario
-- de contacto). Las políticas de escritura para el dueño de cada
-- proyecto están un poco más abajo, después de estas de lectura.
-- ═══════════════════════════════════════════════════════════════════

alter table projects enable row level security;
alter table buildings enable row level security;
alter table floors enable row level security;
alter table units enable row level security;
alter table aerial_slides enable row level security;
alter table aerial_hotspots enable row level security;
alter table amenities enable row level security;
alter table points_of_interest enable row level security;
alter table leads enable row level security;
alter table calculator_settings enable row level security;

drop policy if exists "public read projects" on projects;
create policy "public read projects" on projects for select to anon, authenticated using (true);

drop policy if exists "public read buildings" on buildings;
create policy "public read buildings" on buildings for select to anon, authenticated using (true);

drop policy if exists "public read floors" on floors;
create policy "public read floors" on floors for select to anon, authenticated using (true);

drop policy if exists "public read units" on units;
create policy "public read units" on units for select to anon, authenticated using (true);

drop policy if exists "public read aerial_slides" on aerial_slides;
create policy "public read aerial_slides" on aerial_slides for select to anon, authenticated using (true);

drop policy if exists "public read aerial_hotspots" on aerial_hotspots;
create policy "public read aerial_hotspots" on aerial_hotspots for select to anon, authenticated using (true);

drop policy if exists "public read amenities" on amenities;
create policy "public read amenities" on amenities for select to anon, authenticated using (true);

drop policy if exists "public read points_of_interest" on points_of_interest;
create policy "public read points_of_interest" on points_of_interest for select to anon, authenticated using (true);

drop policy if exists "public read calculator_settings" on calculator_settings;
create policy "public read calculator_settings" on calculator_settings for select to anon, authenticated using (true);

drop policy if exists "public insert leads" on leads;
create policy "public insert leads" on leads for insert to anon, authenticated with check (true);
-- Nota: a propósito NO hay policy de SELECT en leads para "anon" —
-- así nadie puede leer los leads de otros desde el navegador.

-- ═══════════════════════════════════════════════════════════════════
-- RLS de escritura por dueño (Fase 0 — fundación de cuentas)
--
-- Hasta acá, RLS solo distinguía "público" de "nada": todo admin
-- escribía con la service_role key, que ignora estas políticas por
-- completo. A partir de este bloque, si una ruta admin pasa a usar el
-- cliente de sesión (ver lib/supabase/require-project-access.ts), la
-- base RECHAZA sola cualquier intento de tocar un proyecto que no sea
-- del usuario logueado — no depende de que ninguna ruta se acuerde de
-- chequearlo a mano.
--
-- "for all" cubre insert/update/delete/select con la misma condición;
-- para select no resta nada porque ya existe una policy pública
-- permisiva más arriba (las políticas permisivas del mismo comando se
-- combinan con OR, así que "público" sigue ganando para lectura).
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "owner write projects" on projects;
create policy "owner write projects" on projects for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owner write buildings" on buildings;
create policy "owner write buildings" on buildings for all to authenticated
  using (exists (
    select 1 from projects where projects.id = buildings.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = buildings.project_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write floors" on floors;
create policy "owner write floors" on floors for all to authenticated
  using (exists (
    select 1 from buildings join projects on projects.id = buildings.project_id
    where buildings.id = floors.building_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from buildings join projects on projects.id = buildings.project_id
    where buildings.id = floors.building_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write units" on units;
create policy "owner write units" on units for all to authenticated
  using (exists (
    select 1 from floors
      join buildings on buildings.id = floors.building_id
      join projects on projects.id = buildings.project_id
    where floors.id = units.floor_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from floors
      join buildings on buildings.id = floors.building_id
      join projects on projects.id = buildings.project_id
    where floors.id = units.floor_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write aerial_slides" on aerial_slides;
create policy "owner write aerial_slides" on aerial_slides for all to authenticated
  using (exists (
    select 1 from projects where projects.id = aerial_slides.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = aerial_slides.project_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write aerial_hotspots" on aerial_hotspots;
create policy "owner write aerial_hotspots" on aerial_hotspots for all to authenticated
  using (exists (
    select 1 from aerial_slides join projects on projects.id = aerial_slides.project_id
    where aerial_slides.id = aerial_hotspots.slide_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from aerial_slides join projects on projects.id = aerial_slides.project_id
    where aerial_slides.id = aerial_hotspots.slide_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write amenities" on amenities;
create policy "owner write amenities" on amenities for all to authenticated
  using (exists (
    select 1 from projects where projects.id = amenities.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = amenities.project_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write points_of_interest" on points_of_interest;
create policy "owner write points_of_interest" on points_of_interest for all to authenticated
  using (exists (
    select 1 from projects where projects.id = points_of_interest.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = points_of_interest.project_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner write calculator_settings" on calculator_settings;
create policy "owner write calculator_settings" on calculator_settings for all to authenticated
  using (exists (
    select 1 from projects where projects.id = calculator_settings.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = calculator_settings.project_id and projects.owner_id = auth.uid()
  ));

-- leads es distinto: no tiene policy de SELECT pública a propósito, así
-- que hace falta una de lectura para el dueño además de las de escritura
-- (si no, el día que el panel de leads pase al cliente de sesión, el
-- dueño no vería ninguno de sus propios leads).
drop policy if exists "owner read leads" on leads;
create policy "owner read leads" on leads for select to authenticated
  using (exists (
    select 1 from projects where projects.id = leads.project_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner update leads" on leads;
create policy "owner update leads" on leads for update to authenticated
  using (exists (
    select 1 from projects where projects.id = leads.project_id and projects.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from projects where projects.id = leads.project_id and projects.owner_id = auth.uid()
  ));

drop policy if exists "owner delete leads" on leads;
create policy "owner delete leads" on leads for delete to authenticated
  using (exists (
    select 1 from projects where projects.id = leads.project_id and projects.owner_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════
-- Storage — bucket público para planos, panorámicas y fotos
-- (usado por el uploader del admin y por los editores de polígonos/tours)
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do nothing;

drop policy if exists "public read project-media" on storage.objects;
create policy "public read project-media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'project-media');

-- Sin policy de escritura para anon/authenticated a propósito: las
-- subidas se hacen siempre desde rutas API del server con la
-- service_role key (ver lib/supabase/admin.ts), igual que el resto
-- de las escrituras de administración.

-- ─── Índices útiles ──────────────────────────────────────────────────
create index if not exists idx_buildings_project on buildings(project_id);
create index if not exists idx_floors_building on floors(building_id);
create index if not exists idx_units_floor on units(floor_id);
create index if not exists idx_aerial_slides_project on aerial_slides(project_id);
create index if not exists idx_aerial_hotspots_slide on aerial_hotspots(slide_id);
create index if not exists idx_amenities_project on amenities(project_id);
create index if not exists idx_amenities_building on amenities(building_id);
create index if not exists idx_points_of_interest_project on points_of_interest(project_id);
create index if not exists idx_leads_project on leads(project_id);
create index if not exists idx_projects_owner_portfolio on projects(owner_id, show_in_portfolio);

-- ─── Sistema de Follows ──────────────────────────────────────────────
-- follower_id sigue a following_id.
-- PK compuesta garantiza unicidad y hace el lookup O(1).
-- cascade delete limpia automáticamente si se borra un perfil.
create table if not exists follows (
  follower_id  uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key  (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx on follows(following_id);
create index if not exists follows_follower_id_idx  on follows(follower_id);

alter table follows enable row level security;

drop policy if exists "public read follows" on follows;
create policy "public read follows" on follows for select to anon, authenticated using (true);

drop policy if exists "own write follows" on follows;
create policy "own write follows" on follows for all to authenticated
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());

-- ─── Notificaciones in-app ───────────────────────────────────────────
-- entity_id apunta a filas de distintas tablas según el type (el post
-- para 'like'/'comment', nada en particular para 'follow') — es
-- polimórfico a propósito, por eso no lleva foreign key.
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id     uuid not null references profiles(id) on delete cascade,
  type         text not null check (type in ('follow', 'like', 'comment', 'collaboration_invite', 'collaboration_accepted', 'message', 'mention')),
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on notifications(recipient_id, created_at desc);

alter table notifications enable row level security;

-- Quien dispara el evento (el que sigue, el que da like, el que comenta) es
-- quien inserta la notificación — no el destinatario — por eso el check es
-- sobre actor_id, no recipient_id.
drop policy if exists "insert as actor notifications" on notifications;
create policy "insert as actor notifications" on notifications for insert to authenticated
  with check (actor_id = auth.uid());

drop policy if exists "read own notifications" on notifications;
create policy "read own notifications" on notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "mark own notifications read" on notifications;
create policy "mark own notifications read" on notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- 'message'/'mention'/'collaboration_invite' se suman recién ahora al type
-- — en una base que ya tenía la tabla creada, el check original de la
-- columna no los incluye todavía y hay que ampliarlo a mano (el create
-- table de arriba es un no-op si la tabla ya existe).
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('follow', 'like', 'comment', 'collaboration_invite', 'collaboration_accepted', 'message', 'mention'));

-- ─── Mensajería directa ──────────────────────────────────────────────
-- participant_one siempre el uuid menor de los dos (se normaliza al
-- crear la conversación, ver POST /api/conversations) — permite un
-- unique constraint simple y encontrar/crear la conversación entre dos
-- personas sin duplicados ni tener que probar ambos órdenes.
create table if not exists conversations (
  id               uuid primary key default gen_random_uuid(),
  participant_one  uuid not null references profiles(id) on delete cascade,
  participant_two  uuid not null references profiles(id) on delete cascade,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (participant_one, participant_two),
  check (participant_one < participant_two)
);

create index if not exists conversations_participant_one_idx on conversations(participant_one);
create index if not exists conversations_participant_two_idx on conversations(participant_two);

alter table conversations enable row level security;

drop policy if exists "participants read conversations" on conversations;
create policy "participants read conversations" on conversations for select to authenticated
  using (auth.uid() = participant_one or auth.uid() = participant_two);

drop policy if exists "participants insert conversations" on conversations;
create policy "participants insert conversations" on conversations for insert to authenticated
  with check (auth.uid() = participant_one or auth.uid() = participant_two);

-- last_message_at se actualiza al mandar un mensaje — cualquiera de los
-- dos participantes necesita poder tocar la fila, no solo quien la creó.
drop policy if exists "participants update conversations" on conversations;
create policy "participants update conversations" on conversations for update to authenticated
  using (auth.uid() = participant_one or auth.uid() = participant_two)
  with check (auth.uid() = participant_one or auth.uid() = participant_two);

-- body nullable a propósito — desde el Sprint 5 un mensaje puede ser solo
-- un post compartido, sin texto propio (ver messages.shared_post_id).
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sender_id        uuid not null references profiles(id) on delete cascade,
  body             text,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_idx on messages(conversation_id, created_at desc);

alter table messages enable row level security;

drop policy if exists "participants read messages" on messages;
create policy "participants read messages" on messages for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
  ));

drop policy if exists "participants send messages" on messages;
create policy "participants send messages" on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
    )
  );

-- Marcar como leído: cualquiera de los dos participantes puede tocar
-- read_at de los mensajes de la conversación (incluye los propios, no
-- hace falta distinguir — marcar tus propios mensajes como leídos no
-- tiene efecto visible en ningún lado).
drop policy if exists "participants mark messages read" on messages;
create policy "participants mark messages read" on messages for update to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.participant_one = auth.uid() or c.participant_two = auth.uid())
  ));

-- Enviar un post por mensaje: un mensaje puede ser solo esto, sin texto
-- propio (body queda null) — mismo criterio que posts.shared_post_id.
alter table messages add column if not exists shared_post_id uuid;
alter table messages drop constraint if exists messages_shared_post_id_fkey;
alter table messages add constraint messages_shared_post_id_fkey foreign key (shared_post_id) references posts(id) on delete set null;

-- Adjuntos (foto, archivo o nota de audio): un mensaje puede ser solo
-- esto, igual que shared_post_id — attachment_type distingue cómo
-- renderizarlo en el hilo ('image' | 'audio' | 'file').
alter table messages add column if not exists attachment_url text;
alter table messages add column if not exists attachment_type text;

-- ─── Tipografías propias y temas guardados (cuenta, no proyecto) ────
-- Ambas viven a nivel de cuenta (owner_id) en vez de project_id a
-- propósito: una misma persona puede tener varios proyectos (ver
-- app/api/admin/projects/route.ts), y lo que sube o guarda acá tiene
-- que estar disponible para reusar en cualquiera de ellos, no solo en
-- el que lo creó.
create table if not exists fonts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_url text not null,
  format text not null,             -- 'woff2' | 'ttf' | 'otf' | 'woff'
  created_at timestamptz not null default now()
);

alter table fonts enable row level security;

drop policy if exists "owner manage fonts" on fonts;
create policy "owner manage fonts" on fonts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create table if not exists saved_themes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  config jsonb not null,            -- mismo shape que projects.theme_config
  created_at timestamptz not null default now()
);

alter table saved_themes enable row level security;

drop policy if exists "owner manage saved_themes" on saved_themes;
create policy "owner manage saved_themes" on saved_themes for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─── Rate limiting compartido (lib/rate-limit.ts) ───────────────────
-- Contabilidad de infraestructura, no dato de usuario — RLS habilitado
-- sin ninguna policy a propósito, para que ni anon ni authenticated
-- puedan leer/escribir esta tabla bajo ninguna circunstancia; solo el
-- cliente de service-role (que bypasea RLS) la toca, desde
-- lib/rate-limit.ts. `key` es algo tipo "leads:ip:1.2.3.4" o
-- "comments:user:<uuid>" — un prefijo por ruta + el identificador de
-- quien pega el request.
create table if not exists api_rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_rate_limit_hits_key_idx on api_rate_limit_hits(key, created_at desc);

alter table api_rate_limit_hits enable row level security;
