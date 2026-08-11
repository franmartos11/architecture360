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
  masterplan_image text,
  amenities text[] not null default '{}',
  common_areas_tour jsonb,          -- { initialNodeId, nodes: [...] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  price numeric,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  orientation text,
  interior_image_url text,
  gallery_images text[] not null default '{}',
  floor_plan_3d_url text,
  plan_3d_url text,
  technical_plan_url text,
  room_plan_image text,
  polygon jsonb,                    -- [{x,y}, ...] en % sobre floors.plan_image
  rooms jsonb,                      -- [{id,name,polygon,tourNodeId}, ...]
  tour_image_url text,
  tour_data jsonb,                  -- { initialNodeId, nodes: [...] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_id, code)
);

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
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ─── Leads (ya existía en db.json, se migra tal cual) ───────────────
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  unit_id uuid references units(id) on delete set null,
  name text,
  email text,
  phone text,
  method text,
  message text,
  created_at timestamptz not null default now()
);

-- ─── Configuración de la calculadora hipotecaria ────────────────────
create table if not exists calculator_settings (
  project_id uuid primary key references projects(id) on delete cascade,
  interest_rate numeric not null default 5.5,
  max_years int not null default 30,
  min_down_payment numeric not null default 20
);

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security
--
-- El sitio público lee con la clave "anon" → solo SELECT en lo que
-- se muestra al público, y solo INSERT en leads (para el formulario
-- de contacto). El admin escribe siempre desde rutas API del server
-- usando la service_role key, que ignora RLS — por eso no hace
-- falta una policy de escritura para admins acá.
-- ═══════════════════════════════════════════════════════════════════

alter table projects enable row level security;
alter table buildings enable row level security;
alter table floors enable row level security;
alter table units enable row level security;
alter table aerial_slides enable row level security;
alter table aerial_hotspots enable row level security;
alter table amenities enable row level security;
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

drop policy if exists "public read calculator_settings" on calculator_settings;
create policy "public read calculator_settings" on calculator_settings for select to anon, authenticated using (true);

drop policy if exists "public insert leads" on leads;
create policy "public insert leads" on leads for insert to anon, authenticated with check (true);
-- Nota: a propósito NO hay policy de SELECT en leads para "anon" —
-- así nadie puede leer los leads de otros desde el navegador.

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
create index if not exists idx_leads_project on leads(project_id);
