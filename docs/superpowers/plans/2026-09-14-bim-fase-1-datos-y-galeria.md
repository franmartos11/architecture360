# Modelos BIM — Fase 1: datos, galería y publicación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un arquitecto pueda crear, editar y publicar una pieza BIM
con título, descripción y galería de imágenes — visible en su portfolio,
compartible por link, y opcionalmente asociada a un proyecto — sin que
todavía exista el modelo 3D.

**Architecture:** Tabla `bim_models` que pertenece al autor (`author_id`
obligatorio) con vínculo opcional a proyecto (`project_id` nullable).
Bucket propio `bim-models` para que el modelo sobreviva al borrado del
proyecto. Las columnas del modelo 3D (`geometry_url`, `properties_url`,
`source_*`, `stats`) se crean ya en esta fase pero quedan nulas: las
llena la Fase 2 sin migración adicional. La galería usa
`MultiImageUploader` y `/api/admin/upload`, que ya existen.

**Tech Stack:** Next 16 (App Router), React 19, Supabase (Postgres + RLS
+ Storage), TypeScript, Tailwind 4, vitest, @dnd-kit.

**Spec:** `docs/superpowers/specs/2026-09-14-bim-viewer-design.md`

## Global Constraints

- **Idioma:** todo el texto de UI y los comentarios de código en
  castellano rioplatense, como el resto del repo. Los identificadores en
  inglés.
- **Nombres de columna:** `snake_case` en Supabase, `camelCase` en los
  tipos de `types/index.ts`. `types/database.ts` guarda las filas crudas.
- **Límites (copiados del spec, decisión 7):** galería máximo **30
  imágenes** por pieza; cada imagen máximo 15 MB (lo que ya impone
  `/api/admin/upload`). `MAX_GEOMETRY_BYTES = 50 MB`,
  `GEOMETRY_WARN_BYTES = 25 MB`, `SOURCE_WARN_BYTES = 300 MB` se definen
  en esta fase pero recién se usan en la Fase 2.
- **Regla de publicación (spec, decisión 6):** una pieza pasa a
  `status = 'ready'` solo si tiene `geometry_url`, al menos una imagen en
  `gallery_images`, o ambos. Nunca vacía.
- **Regla del colaborador (spec, decisión 3):** al borrar un proyecto con
  `deleteBim`, solo se borran los modelos cuyo `author_id` es quien
  borra. Los de otros se desvinculan (`project_id = null`).
- **Autenticación:** rutas bajo `/api/admin/**` usan `requireAdminUser()`
  de `lib/supabase/require-admin.ts`. Las que reciben un `projectId` usan
  `requireProjectAccess()`. Nunca `createAdminClient()` para leer datos
  de usuario: solo para Storage.
- **Tests:** `pnpm test`. Mock de Supabase con `mockSupabase()` de
  `lib/test-helpers/supabase-mock.ts` — la cola `results` se consume en
  el orden exacto en que la ruta llama a `.from()`.

---

## File Structure

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `lib/bim.ts` | Constantes y reglas puras: límites, `canPublishBimModel()`, `bimModelHref()`. Sin I/O, testeable solo. |
| `lib/supabase/delete-bim-storage.ts` | Junta las keys del bucket `bim-models` de una lista de modelos y las borra. Espejo de `delete-project-storage.ts`. |
| `data/bim-repository.ts` | Lecturas: por autor, por id, por proyecto. Mapea fila → tipo de dominio. |
| `app/api/admin/bim/route.ts` | `GET` (lista del autor) y `POST` (crear). |
| `app/api/admin/bim/[id]/route.ts` | `PATCH` (editar) y `DELETE` (borrar pieza + archivos). |
| `app/admin/(authenticated)/bim/page.tsx` | Server Component: carga las piezas del autor y sus proyectos. |
| `app/admin/(authenticated)/bim/BimAdminClient.tsx` | Estado de la pantalla: selección, alta, sincronizar lista y editor. |
| `components/admin/BimModelEditor.tsx` | Formulario de una pieza (título, descripción, galería, visibilidad, proyecto). |
| `components/admin/BimModelList.tsx` | Lista de piezas del autor con estado y acciones. |
| `components/bim/BimGallery.tsx` | Galería pública de imágenes de una pieza. |
| `app/bim/[id]/page.tsx` | Página pública de la pieza, con metadata Open Graph. |
| `components/social/BimGrid.tsx` | Grilla de piezas para la pestaña del portfolio. |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | Tabla `bim_models`, índices, RLS, nota del bucket. |
| `types/database.ts` | `BimModelRow`. |
| `types/index.ts` | `BimModel`, `BimModelStats`, `BimModelStatus`. |
| `components/admin/DeleteProjectModal.tsx` | Bloque de elección "conservar / eliminar también". |
| `app/api/admin/projects/[id]/route.ts` | Soporte de `deleteBim` con la regla del colaborador. |
| `components/social/ProfileTabs.tsx` | Pestaña "BIM". |
| `app/(social)/portfolio/[handle]/page.tsx` | Cargar las piezas del perfil y pasarlas a `ProfileTabs`. |
| `data/profile-repository.ts` | Sumar `bimModels` a `Portfolio`. |
| `components/app/AppShell.tsx` | Entrada "Modelos BIM" en el menú de cuenta. |

**Reutilizado sin tocar:** `MultiImageUploader` (galería con drag &
drop y subida múltiple — ya hace exactamente lo que hace falta),
`ImageUploader`, `/api/admin/upload`, `ToastProvider`, `Button`,
`TransitionLink`.

---

### Task 1: Schema, bucket y tipos

**Files:**
- Modify: `supabase/schema.sql` (al final, después de `post_poll_votes`)
- Modify: `types/database.ts`
- Modify: `types/index.ts`
- Create: `lib/bim.ts`
- Test: `lib/bim.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `types/index.ts`: `BimModelStatus = 'processing' | 'ready' | 'failed'`,
    `BimModelStats`, `BimModel`.
  - `types/database.ts`: `BimModelRow`.
  - `lib/bim.ts`: `MAX_GALLERY_IMAGES: number`,
    `MAX_GEOMETRY_BYTES: number`, `GEOMETRY_WARN_BYTES: number`,
    `SOURCE_WARN_BYTES: number`, `BIM_BUCKET: string`,
    `canPublishBimModel(input: { geometryUrl?: string | null; galleryImages: string[] }): boolean`,
    `bimModelHref(id: string): string`.

- [ ] **Step 1: Escribir el test de las reglas puras**

Crear `lib/bim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canPublishBimModel, MAX_GALLERY_IMAGES, bimModelHref } from './bim';

describe('canPublishBimModel', () => {
  it('pieza vacía: no se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: null, galleryImages: [] })).toBe(false);
  });

  it('solo imágenes: se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: null, galleryImages: ['https://x/1.png'] })).toBe(true);
  });

  it('solo modelo: se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: 'https://x/m.frag', galleryImages: [] })).toBe(true);
  });

  it('modelo e imágenes: se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: 'https://x/m.frag', galleryImages: ['https://x/1.png'] })).toBe(true);
  });

  it('geometryUrl vacío o en blanco no cuenta como modelo', () => {
    expect(canPublishBimModel({ geometryUrl: '   ', galleryImages: [] })).toBe(false);
  });

  it('imágenes en blanco no cuentan — MultiImageUploader deja huecos vacíos al agregar por URL', () => {
    expect(canPublishBimModel({ geometryUrl: null, galleryImages: ['', '  '] })).toBe(false);
  });
});

describe('constantes', () => {
  it('el tope de galería es 30', () => {
    expect(MAX_GALLERY_IMAGES).toBe(30);
  });
});

describe('bimModelHref', () => {
  it('arma la URL pública de la pieza', () => {
    expect(bimModelHref('abc-123')).toBe('/bim/abc-123');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test lib/bim.test.ts`
Esperado: FAIL — `Failed to resolve import "./bim"`.

- [ ] **Step 3: Escribir `lib/bim.ts`**

```ts
// Reglas y límites de las piezas BIM que no dependen de la base ni del
// navegador — así las comparten la ruta de API (validación de servidor),
// el admin (deshabilitar el botón de publicar) y los tests, sin duplicar
// el criterio en tres lugares.

/** Bucket propio: NO es project-media, porque delete-project-storage.ts
 *  barre ese bucket entero al borrar un proyecto y una pieza BIM tiene que
 *  sobrevivir a eso salvo que su autor decida lo contrario. */
export const BIM_BUCKET = 'bim-models';

/** Tope de imágenes por pieza — el peso de cada una ya lo limita
 *  /api/admin/upload (15MB). */
export const MAX_GALLERY_IMAGES = 30;

/** Geometría ya convertida: arriba de esto se rechaza (Fase 2). */
export const MAX_GEOMETRY_BYTES = 50 * 1024 * 1024;
/** A partir de acá se sube igual, pero se avisa que va a tardar en abrir. */
export const GEOMETRY_WARN_BYTES = 25 * 1024 * 1024;
/** IFC de origen: no hay tope duro (nunca llega al backend), pero arriba
 *  de esto se advierte que la conversión puede tardar varios minutos. */
export const SOURCE_WARN_BYTES = 300 * 1024 * 1024;

function hasContent(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

// Una pieza no puede publicarse vacía: tiene que tener modelo, imágenes,
// o ambos (ver el spec, decisión 6). Las URLs en blanco no cuentan —
// MultiImageUploader deja huecos vacíos cuando se agrega una foto "por
// URL" y todavía no se pegó nada.
export function canPublishBimModel(input: {
  geometryUrl?: string | null;
  galleryImages: string[];
}): boolean {
  return hasContent(input.geometryUrl) || input.galleryImages.some(hasContent);
}

export function bimModelHref(id: string): string {
  return `/bim/${id}`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test lib/bim.test.ts`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Agregar la tabla al schema**

Agregar al final de `supabase/schema.sql`:

```sql
-- ─── Modelos BIM (piezas de portfolio) ──────────────────────────────
-- Pertenecen al AUTOR, no al proyecto: un arquitecto muestra su modelo
-- en su perfil aunque no esté cargado como proyecto en la plataforma, y
-- si lo asocia a uno, aparece además en la landing de ese proyecto.
-- project_id es on delete set null a propósito — borrar el proyecto no
-- debe llevarse una pieza del portfolio (ver DeleteProjectModal, que
-- pregunta explícitamente qué hacer).
--
-- Los archivos van al bucket 'bim-models', NO a 'project-media': ese lo
-- barre entero deleteProjectStorageFiles() al borrar un proyecto.
-- Crear el bucket a mano en Supabase: público en lectura.
--
-- geometry_url / properties_url / source_* / stats quedan nulos hasta la
-- Fase 2 (ingesta del modelo): una pieza puede publicarse solo con
-- imágenes.
create table if not exists bim_models (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,
  title          text not null,
  description    text,
  source_format  text check (source_format is null or source_format in ('ifc','glb')),
  source_url     text,
  geometry_url   text,
  properties_url text,
  gallery_images text[] not null default '{}',
  cover_image    text,
  stats          jsonb,
  status         text not null default 'processing'
                 check (status in ('processing','ready','failed')),
  error_message  text,
  is_public      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_bim_models_author on bim_models(author_id, created_at desc);
create index if not exists idx_bim_models_project on bim_models(project_id);

alter table bim_models enable row level security;

-- El visitante anónimo solo ve piezas publicadas y públicas.
drop policy if exists "public read bim_models" on bim_models;
create policy "public read bim_models" on bim_models for select to anon, authenticated
  using (is_public and status = 'ready');

-- El autor ve y escribe TODAS las suyas, incluidas las que están en
-- processing/failed o marcadas como privadas.
drop policy if exists "author read own bim_models" on bim_models;
create policy "author read own bim_models" on bim_models for select to authenticated
  using (author_id = auth.uid());

drop policy if exists "author write bim_models" on bim_models;
create policy "author write bim_models" on bim_models for all to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
```

- [ ] **Step 6: Agregar los tipos**

En `types/index.ts`, después de `export interface Project { ... }`:

```ts
// ─── Modelos BIM ────────────────────────────────────────────────────
export type BimModelStatus = 'processing' | 'ready' | 'failed';
export type BimSourceFormat = 'ifc' | 'glb';

/** Resumen del modelo convertido — lo llena la Fase 2 (ingesta). */
export interface BimModelStats {
  elements: number;
  storeys: number;
  triangles: number;
  bytes: number;
}

export interface BimModel {
  id: string;
  authorId: string;
  /** Proyecto al que el autor lo asoció — null si es una pieza suelta del portfolio. */
  projectId: string | null;
  title: string;
  description: string;
  sourceFormat: BimSourceFormat | null;
  /** IFC/GLB original, para descarga o reproceso. Null en piezas solo-imágenes. */
  sourceUrl: string | null;
  /** Lo único que baja el visitante. Null hasta que se sube un modelo (Fase 2). */
  geometryUrl: string | null;
  /** Árbol de elementos + propiedades — solo cuando el origen fue IFC. */
  propertiesUrl: string | null;
  galleryImages: string[];
  coverImage: string | null;
  stats: BimModelStats | null;
  status: BimModelStatus;
  /** Solo se muestra al autor, nunca en la vista pública. */
  errorMessage: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
```

En `types/database.ts`, agregando `BimModelStats`, `BimModelStatus` y
`BimSourceFormat` al `import type` de `./index` que ya está arriba:

```ts
export interface BimModelRow {
  id: string;
  author_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  source_format: BimSourceFormat | null;
  source_url: string | null;
  geometry_url: string | null;
  properties_url: string | null;
  gallery_images: string[];
  cover_image: string | null;
  stats: BimModelStats | null;
  status: BimModelStatus;
  error_message: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 7: Verificar tipos y correr toda la suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores de tipos, toda la suite en PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql types/database.ts types/index.ts lib/bim.ts lib/bim.test.ts
git commit -m "feat(bim): tabla bim_models, tipos y reglas de publicación

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Repositorio de lectura

**Files:**
- Create: `data/bim-repository.ts`
- Test: `data/bim-repository.test.ts`

**Interfaces:**
- Consumes: `BimModel` y `BimModelRow` de la Task 1; `createClient` de
  `@/lib/supabase/server`.
- Produces:
  - `mapBimModelRow(row: BimModelRow): BimModel` — exportada, la usan
    también las rutas de API para devolver el mismo shape.
  - `getBimModelsByAuthor(authorId: string): Promise<BimModel[]>` —
    todas las del autor, incluidas privadas y no publicadas.
  - `getPublicBimModelsByAuthor(authorId: string): Promise<BimModel[]>` —
    solo `is_public && status='ready'`, para el portfolio público.
  - `getBimModelById(id: string): Promise<BimModel | undefined>` — sin
    filtrar por visibilidad; RLS decide qué ve cada quien.
  - `getPublicBimModelsByProject(projectId: string): Promise<BimModel[]>`.

- [ ] **Step 1: Escribir el test**

Crear `data/bim-repository.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { mapBimModelRow, getBimModelsByAuthor, getBimModelById } from './bim-repository';
import type { BimModelRow } from '@/types/database';

const row: BimModelRow = {
  id: 'bim-1',
  author_id: 'user-1',
  project_id: null,
  title: 'Casa Patio',
  description: null,
  source_format: null,
  source_url: null,
  geometry_url: null,
  properties_url: null,
  gallery_images: ['https://x/1.png'],
  cover_image: null,
  stats: null,
  status: 'ready',
  error_message: null,
  is_public: true,
  created_at: '2026-09-14T10:00:00Z',
  updated_at: '2026-09-14T10:00:00Z',
};

describe('mapBimModelRow', () => {
  it('pasa snake_case a camelCase y normaliza los nulos de texto a string vacío', () => {
    const model = mapBimModelRow(row);
    expect(model.id).toBe('bim-1');
    expect(model.authorId).toBe('user-1');
    expect(model.projectId).toBeNull();
    expect(model.description).toBe('');
    expect(model.galleryImages).toEqual(['https://x/1.png']);
    expect(model.isPublic).toBe(true);
  });

  it('conserva los nulos de las columnas de archivo — distinguir "no hay modelo" de "" importa para canPublishBimModel', () => {
    const model = mapBimModelRow(row);
    expect(model.geometryUrl).toBeNull();
    expect(model.coverImage).toBeNull();
  });
});

describe('getBimModelsByAuthor', () => {
  beforeEach(() => vi.mocked(createClient).mockReset());

  it('devuelve las piezas mapeadas', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: [row] }] }) as never);
    const models = await getBimModelsByAuthor('user-1');
    expect(models).toHaveLength(1);
    expect(models[0].title).toBe('Casa Patio');
  });

  it('sin filas: array vacío, no undefined', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await getBimModelsByAuthor('user-1')).toEqual([]);
  });
});

describe('getBimModelById', () => {
  beforeEach(() => vi.mocked(createClient).mockReset());

  it('pieza inexistente (o que RLS oculta): undefined', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await getBimModelById('bim-404')).toBeUndefined();
  });

  it('pieza visible: la devuelve mapeada', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: row }] }) as never);
    expect((await getBimModelById('bim-1'))?.title).toBe('Casa Patio');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test data/bim-repository.test.ts`
Esperado: FAIL — `Failed to resolve import "./bim-repository"`.

- [ ] **Step 3: Escribir el repositorio**

Crear `data/bim-repository.ts`:

```ts
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { BimModel } from '@/types';
import type { BimModelRow } from '@/types/database';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Los nulos de texto se normalizan a '' porque los inputs del admin son
// controlados y React se queja si el value pasa de undefined a string.
// Los nulos de las columnas de archivo se CONSERVAN: canPublishBimModel
// necesita distinguir "todavía no hay modelo" de "hay un modelo".
export function mapBimModelRow(row: BimModelRow): BimModel {
  return {
    id: row.id,
    authorId: row.author_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? '',
    sourceFormat: row.source_format,
    sourceUrl: row.source_url,
    geometryUrl: row.geometry_url,
    propertiesUrl: row.properties_url,
    galleryImages: row.gallery_images ?? [],
    coverImage: row.cover_image,
    stats: row.stats,
    status: row.status,
    errorMessage: row.error_message,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Todas las piezas del autor — incluidas privadas, en processing y
// fallidas. La política RLS "author read own bim_models" es la que
// permite ver esas; con el cliente anónimo este query devuelve vacío.
export const getBimModelsByAuthor = cache(async (authorId: string): Promise<BimModel[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('bim_models')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as BimModelRow[]).map(mapBimModelRow);
});

// Para el portfolio público: el filtro va explícito además de RLS, para
// que el dueño mirando su propio perfil vea lo mismo que ve un visitante.
export const getPublicBimModelsByAuthor = cache(async (authorId: string): Promise<BimModel[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('bim_models')
    .select('*')
    .eq('author_id', authorId)
    .eq('is_public', true)
    .eq('status', 'ready')
    .order('created_at', { ascending: false });
  return ((data ?? []) as BimModelRow[]).map(mapBimModelRow);
});

// Sin filtro de visibilidad: RLS decide. El autor entra a su pieza en
// processing desde el admin; un visitante recibe undefined → notFound().
export const getBimModelById = cache(async (id: string): Promise<BimModel | undefined> => {
  if (!SUPABASE_CONFIGURED) return undefined;
  const supabase = await createClient();
  const { data } = await supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  return data ? mapBimModelRow(data as BimModelRow) : undefined;
});

export const getPublicBimModelsByProject = cache(async (projectId: string): Promise<BimModel[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('bim_models')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_public', true)
    .eq('status', 'ready')
    .order('created_at', { ascending: false });
  return ((data ?? []) as BimModelRow[]).map(mapBimModelRow);
});
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test data/bim-repository.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add data/bim-repository.ts data/bim-repository.test.ts
git commit -m "feat(bim): repositorio de lectura de piezas BIM

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: API de alta, edición y borrado

**Files:**
- Create: `app/api/admin/bim/route.ts`
- Create: `app/api/admin/bim/[id]/route.ts`
- Create: `lib/supabase/delete-bim-storage.ts`
- Test: `app/api/admin/bim/route.test.ts`
- Test: `app/api/admin/bim/[id]/route.test.ts`
- Test: `lib/supabase/delete-bim-storage.test.ts`

**Interfaces:**
- Consumes: `canPublishBimModel`, `MAX_GALLERY_IMAGES`, `BIM_BUCKET` de
  `lib/bim.ts`; `mapBimModelRow` de `data/bim-repository.ts`;
  `requireAdminUser` de `lib/supabase/require-admin.ts`; `createClient`
  de `lib/supabase/server.ts`; `createAdminClient` de
  `lib/supabase/admin.ts`.
- Produces:
  - `lib/supabase/delete-bim-storage.ts`:
    `bimStorageKeys(models: Pick<BimModelRow, 'geometry_url' | 'properties_url' | 'cover_image' | 'source_url' | 'gallery_images'>[]): string[]`
    y `deleteBimStorageFiles(supabase: SupabaseClient, models: ...[]): Promise<void>`.
    Las usa también la Task 5 (borrado de proyecto).
  - `POST /api/admin/bim` → `{ model: BimModel }` (201) | `{ error }`.
  - `PATCH /api/admin/bim/[id]` → `{ model: BimModel }` | `{ error }`.
  - `DELETE /api/admin/bim/[id]` → `{ success: true }` | `{ error }`.

- [ ] **Step 1: Escribir el test del helper de storage**

Crear `lib/supabase/delete-bim-storage.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { bimStorageKeys, deleteBimStorageFiles } from './delete-bim-storage';

const BASE = 'https://xxx.supabase.co/storage/v1/object/public/bim-models';

describe('bimStorageKeys', () => {
  it('junta todas las columnas de archivo y la galería, relativas al bucket', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: `${BASE}/u1/model.frag`,
        properties_url: `${BASE}/u1/props.json`,
        cover_image: `${BASE}/u1/cover.png`,
        source_url: null,
        gallery_images: [`${BASE}/u1/a.png`, `${BASE}/u1/b.png`],
      },
    ]);
    expect(keys.sort()).toEqual(['u1/a.png', 'u1/b.png', 'u1/cover.png', 'u1/model.frag', 'u1/props.json']);
  });

  it('ignora URLs de otro bucket o pegadas a mano', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: null,
        properties_url: null,
        cover_image: 'https://otro-host.com/imagen.png',
        source_url: null,
        gallery_images: ['https://xxx.supabase.co/storage/v1/object/public/project-media/x.png'],
      },
    ]);
    expect(keys).toEqual([]);
  });

  it('dedupea — la portada suele ser también la primera foto de la galería', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: null,
        properties_url: null,
        cover_image: `${BASE}/u1/a.png`,
        source_url: null,
        gallery_images: [`${BASE}/u1/a.png`],
      },
    ]);
    expect(keys).toEqual(['u1/a.png']);
  });
});

describe('deleteBimStorageFiles', () => {
  it('sin archivos: no llama a storage', async () => {
    const remove = vi.fn();
    const supabase = { storage: { from: vi.fn(() => ({ remove })) } };
    await deleteBimStorageFiles(supabase as never, [
      { geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('borra del bucket bim-models', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ remove }));
    const supabase = { storage: { from } };
    await deleteBimStorageFiles(supabase as never, [
      { geometry_url: `${BASE}/u1/model.frag`, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
    ]);
    expect(from).toHaveBeenCalledWith('bim-models');
    expect(remove).toHaveBeenCalledWith(['u1/model.frag']);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm test lib/supabase/delete-bim-storage.test.ts`
Esperado: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el helper**

Crear `lib/supabase/delete-bim-storage.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BIM_BUCKET } from '@/lib/bim';

const CHUNK = 100;

/** Las columnas de una fila de bim_models que guardan archivos. */
export interface BimStorageFields {
  geometry_url: string | null;
  properties_url: string | null;
  cover_image: string | null;
  source_url: string | null;
  gallery_images: string[];
}

// Mismo criterio que toStorageKey() en delete-project-storage.ts, pero
// contra el bucket bim-models: de la URL pública saca la key relativa al
// bucket, que es lo que pide storage.remove(). Cualquier URL que no sea
// de este bucket no tiene nada que borrar acá.
function toStorageKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BIM_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

export function bimStorageKeys(models: BimStorageFields[]): string[] {
  const keys = new Set<string>();
  for (const m of models) {
    const urls = [m.geometry_url, m.properties_url, m.cover_image, m.source_url, ...(m.gallery_images ?? [])];
    for (const url of urls) {
      const key = toStorageKey(url);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

// Se llama ANTES de borrar las filas: borrar filas nunca borra los
// objetos de Storage (mismo motivo por el que existe
// deleteProjectStorageFiles).
export async function deleteBimStorageFiles(supabase: SupabaseClient, models: BimStorageFields[]): Promise<void> {
  const keys = bimStorageKeys(models);
  if (keys.length === 0) return;
  for (let i = 0; i < keys.length; i += CHUNK) {
    await supabase.storage.from(BIM_BUCKET).remove(keys.slice(i, i + CHUNK));
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm test lib/supabase/delete-bim-storage.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Step 5: Escribir el test de POST /api/admin/bim**

Crear `app/api/admin/bim/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const URL_ = 'http://localhost/api/admin/bim';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', author_id: 'user-1', project_id: null, title: 'Casa Patio',
    description: null, source_format: null, source_url: null, geometry_url: null,
    properties_url: null, gallery_images: [], cover_image: null, stats: null,
    status: 'processing', error_message: null, is_public: true,
    created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
    ...over,
  };
}

describe('POST /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('sin título: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await POST(jsonRequest(URL_, { title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el título.');
  });

  it('más imágenes que el tope: 400 con el número concreto', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const galleryImages = Array.from({ length: 31 }, (_, i) => `https://x/${i}.png`);
    const res = await POST(jsonRequest(URL_, { title: 'Casa', galleryImages }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('30');
  });

  it('pieza vacía: se crea en processing, no en ready', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: row({ status: 'processing' }) }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(201);
    expect((await res.json()).model.status).toBe('processing');
  });

  it('con imágenes: se crea directamente en ready', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [{ data: row({ status: 'ready', gallery_images: ['https://x/1.png'] }) }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio', galleryImages: ['https://x/1.png'] }));
    expect(res.status).toBe(201);
    expect((await res.json()).model.status).toBe('ready');
    expect(supabase.from).toHaveBeenCalledWith('bim_models');
  });

  it('error de la base: 500 con el mensaje', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] }) as never
    );
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `pnpm test app/api/admin/bim/route.test.ts`
Esperado: FAIL — no existe `./route`.

- [ ] **Step 7: Escribir `app/api/admin/bim/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import type { BimModelRow } from '@/types/database';

const createSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  projectId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean().optional(),
});

// Lista las piezas del autor logueado. La lee el admin; el portfolio
// público usa getPublicBimModelsByAuthor del repositorio, no esta ruta.
export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bim_models')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ models: ((data ?? []) as BimModelRow[]).map(mapBimModelRow) });
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { title, description, projectId, isPublic } = parsed.data;
  const galleryImages = (parsed.data.galleryImages ?? []).filter(u => u.trim().length > 0);

  if (title.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el título.' }, { status: 400 });
  }
  if (galleryImages.length > MAX_GALLERY_IMAGES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_GALLERY_IMAGES} imágenes por pieza — subiste ${galleryImages.length}.` },
      { status: 400 }
    );
  }

  // Una pieza con contenido nace publicada; una vacía queda en
  // 'processing' esperando que le suban el modelo (Fase 2) o fotos.
  const status = canPublishBimModel({ geometryUrl: null, galleryImages }) ? 'ready' : 'processing';

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bim_models')
    .insert({
      author_id: user.id,
      project_id: projectId ?? null,
      title: title.trim(),
      description: description?.trim() || null,
      gallery_images: galleryImages,
      cover_image: galleryImages[0] ?? null,
      is_public: isPublic ?? true,
      status,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ model: mapBimModelRow(data as BimModelRow) }, { status: 201 });
}
```

- [ ] **Step 8: Correr y verificar que pasa**

Run: `pnpm test app/api/admin/bim/route.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 9: Escribir el test de PATCH y DELETE**

Crear `app/api/admin/bim/[id]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', author_id: 'user-1', project_id: null, title: 'Casa Patio',
    description: null, source_format: null, source_url: null, geometry_url: null,
    properties_url: null, gallery_images: [], cover_image: null, stats: null,
    status: 'processing', error_message: null, is_public: true,
    created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
    ...over,
  };
}

const URL_ = 'http://localhost/api/admin/bim/bim-1';

describe('PATCH /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(401);
  });

  it('pieza de otro autor (RLS la oculta): 404', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(404);
  });

  it('agregar la primera imagen a una pieza vacía la pasa a ready y le pone portada', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [
        { data: row() },                                                                  // lectura previa
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) }, // update
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(
      jsonRequest(URL_, { galleryImages: ['https://x/1.png'] }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(res.status).toBe(200);
    const { model } = await res.json();
    expect(model.status).toBe('ready');
    expect(model.coverImage).toBe('https://x/1.png');
  });

  it('sacar la última imagen de una pieza sin modelo la devuelve a processing', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) },
        { data: row({ status: 'processing', gallery_images: [], cover_image: null }) },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: [] }, { method: 'PATCH' }), params('bim-1'));
    expect((await res.json()).model.status).toBe('processing');
  });

  it('con modelo cargado, sacar todas las imágenes NO la saca de ready', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const withModel = row({ status: 'ready', geometry_url: 'https://x/m.frag', gallery_images: ['https://x/1.png'] });
    const supabase = mockSupabase({
      results: [{ data: withModel }, { data: { ...withModel, gallery_images: [] } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: [] }, { method: 'PATCH' }), params('bim-1'));
    expect((await res.json()).model.status).toBe('ready');
  });
});

describe('DELETE /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos ANTES que la fila', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [{ data: row({ gallery_images: ['https://x/1.png'] }) }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledTimes(1);
  });

  it('pieza inexistente o ajena: 404, no borra archivos', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Correr y verificar que falla**

Run: `pnpm test app/api/admin/bim/\[id\]/route.test.ts`
Esperado: FAIL — no existe `./route`.

- [ ] **Step 11: Escribir `app/api/admin/bim/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import type { BimModelRow } from '@/types/database';

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  projectId: z.string().uuid().nullable().optional(),
  isPublic: z.boolean().optional(),
});

// No hace falta chequear author_id a mano: el cliente de sesión pasa por
// RLS, así que una pieza ajena simplemente no aparece y sale 404.
async function loadOwn(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  return (data as BimModelRow | null) ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const supabase = await createClient();
  const current = await loadOwn(supabase, id);
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  const galleryImages = parsed.data.galleryImages
    ? parsed.data.galleryImages.filter(u => u.trim().length > 0)
    : current.gallery_images;

  if (galleryImages.length > MAX_GALLERY_IMAGES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_GALLERY_IMAGES} imágenes por pieza — mandaste ${galleryImages.length}.` },
      { status: 400 }
    );
  }
  if (parsed.data.title !== undefined && parsed.data.title.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el título.' }, { status: 400 });
  }

  // El estado se RECALCULA en cada edición: sacar la última foto de una
  // pieza sin modelo la despublica, y agregar la primera la publica. Una
  // pieza fallida se deja en 'failed' — eso lo resuelve reintentar la
  // conversión (Fase 2), no editar el título.
  const publishable = canPublishBimModel({ geometryUrl: current.geometry_url, galleryImages });
  const status = current.status === 'failed' ? 'failed' : publishable ? 'ready' : 'processing';

  // La portada solo se toca si la que había dejó de existir: si la Fase 2
  // ya puso una captura del modelo, editar la galería no debe pisarla.
  const coverStillThere = current.cover_image && galleryImages.includes(current.cover_image);
  const coverFromModel = current.cover_image && !current.gallery_images.includes(current.cover_image);
  const cover_image = coverStillThere || coverFromModel ? current.cover_image : galleryImages[0] ?? null;

  const { data, error } = await supabase
    .from('bim_models')
    .update({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() || null } : {}),
      ...(parsed.data.projectId !== undefined ? { project_id: parsed.data.projectId } : {}),
      ...(parsed.data.isPublic !== undefined ? { is_public: parsed.data.isPublic } : {}),
      gallery_images: galleryImages,
      cover_image,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ model: mapBimModelRow(data as BimModelRow) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const current = await loadOwn(supabase, id);
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  // Primero los archivos (hace falta la fila para saber qué URLs tenía),
  // después la fila. El cliente admin es el único que puede borrar del
  // bucket, igual que en /api/admin/upload.
  await deleteBimStorageFiles(createAdminClient(), [current]);

  const { error } = await supabase.from('bim_models').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 12: Correr y verificar que pasa**

Run: `pnpm test app/api/admin/bim`
Esperado: PASS, 13 tests entre los dos archivos.

- [ ] **Step 13: Commit**

```bash
git add app/api/admin/bim lib/supabase/delete-bim-storage.ts lib/supabase/delete-bim-storage.test.ts
git commit -m "feat(bim): API de alta, edición y borrado de piezas BIM

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Pantalla de admin `/admin/bim`

**Files:**
- Create: `app/admin/(authenticated)/bim/page.tsx`
- Create: `app/admin/(authenticated)/bim/BimAdminClient.tsx`
- Create: `components/admin/BimModelList.tsx`
- Create: `components/admin/BimModelEditor.tsx`
- Modify: `components/app/AppShell.tsx:159` (menú de cuenta)

**Interfaces:**
- Consumes: `getBimModelsByAuthor` (Task 2); `POST`/`PATCH`/`DELETE` de
  `/api/admin/bim` (Task 3); `MultiImageUploader`
  (`components/admin/MultiImageUploader.tsx`, props
  `{ values: string[]; onChange: (urls: string[]) => void; folder: string; label?: string }`);
  `useToast` de `components/ui/ToastProvider`; `Button` de
  `components/ui/Button`; `MAX_GALLERY_IMAGES` y `bimModelHref` de
  `lib/bim.ts`.
- Produces:
  - `BimModelList({ models, onSelect, selectedId })`.
  - `BimModelEditor({ model, projects, onSaved, onDeleted })` donde
    `projects: { id: string; name: string }[]`.

Esta task no lleva tests automáticos: son componentes de UI con estado y
subida de archivos, que el repo no testea en jsdom (mismo criterio que
`MultiImageUploader` y `TourEditor`). La verificación es manual, en el
Step 5.

- [ ] **Step 1: Escribir la lista**

Crear `components/admin/BimModelList.tsx`:

```tsx
'use client';

import type { BimModel } from '@/types';

const STATUS_LABEL: Record<BimModel['status'], { text: string; className: string }> = {
  ready: { text: 'Publicada', className: 'bg-green-50 text-green-700' },
  processing: { text: 'Sin publicar', className: 'bg-amber-50 text-amber-700' },
  failed: { text: 'Con error', className: 'bg-red-50 text-red-700' },
};

export default function BimModelList({
  models,
  selectedId,
  onSelect,
}: {
  models: BimModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (models.length === 0) {
    return (
      <p className="text-sm text-gray-500 px-1 py-6">
        Todavía no cargaste ninguna pieza. Creá la primera con el botón de arriba.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {models.map(m => {
        const status = STATUS_LABEL[m.status];
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
                selectedId === m.id
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                {m.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.coverImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
                  <p className="text-xs text-gray-500">
                    {m.galleryImages.length} {m.galleryImages.length === 1 ? 'imagen' : 'imágenes'}
                    {m.geometryUrl ? ' · con modelo 3D' : ''}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-md shrink-0 ${status.className}`}>
                  {status.text}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Escribir el editor**

Crear `components/admin/BimModelEditor.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { MAX_GALLERY_IMAGES, bimModelHref, canPublishBimModel } from '@/lib/bim';
import type { BimModel } from '@/types';

const labelStyle = 'block text-xs font-medium text-gray-500 mb-1.5';
const inputStyle =
  'w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none';

export default function BimModelEditor({
  model,
  projects,
  onSaved,
  onDeleted,
}: {
  model: BimModel;
  projects: { id: string; name: string }[];
  onSaved: (updated: BimModel) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(model.title);
  const [description, setDescription] = useState(model.description);
  const [galleryImages, setGalleryImages] = useState(model.galleryImages);
  const [projectId, setProjectId] = useState(model.projectId ?? '');
  const [isPublic, setIsPublic] = useState(model.isPublic);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Al cambiar de pieza en la lista, el formulario se recarga con la nueva.
  useEffect(() => {
    setTitle(model.title);
    setDescription(model.description);
    setGalleryImages(model.galleryImages);
    setProjectId(model.projectId ?? '');
    setIsPublic(model.isPublic);
  }, [model]);

  const publishable = canPublishBimModel({ geometryUrl: model.geometryUrl, galleryImages });
  const tooManyImages = galleryImages.filter(u => u.trim()).length > MAX_GALLERY_IMAGES;

  const save = async () => {
    if (!title.trim()) {
      toast('Ponele un título a la pieza.', 'error');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/bim/${model.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        galleryImages,
        projectId: projectId || null,
        isPublic,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? 'No se pudo guardar.', 'error');
      return;
    }
    toast('Guardado.');
    onSaved(data.model as BimModel);
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar "${model.title}"? Se borran también sus imágenes. No se puede deshacer.`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/bim/${model.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo eliminar.', 'error');
      return;
    }
    toast('Pieza eliminada.');
    onDeleted(model.id);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={labelStyle}>Título</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputStyle} />
      </div>

      <div>
        <label className={labelStyle}>Descripción</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className={inputStyle}
          placeholder="Qué es, dónde está, en qué software lo modelaste."
        />
      </div>

      <div>
        <MultiImageUploader
          values={galleryImages}
          onChange={setGalleryImages}
          folder={`bim/${model.id}`}
          label={`Imágenes (renders, cortes, láminas) — máximo ${MAX_GALLERY_IMAGES}`}
        />
        {tooManyImages && (
          <p className="text-xs text-red-600 mt-1.5">
            Te pasaste del máximo de {MAX_GALLERY_IMAGES} imágenes.
          </p>
        )}
      </div>

      <div>
        <label className={labelStyle}>Proyecto asociado (opcional)</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputStyle}>
          <option value="">Ninguno — solo en mi portfolio</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1.5">
          Si la asociás, además aparece en la landing de ese proyecto.
        </p>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-gray-700">
        <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
        Visible para cualquiera con el link
      </label>

      {!publishable && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          La pieza no se publica hasta que tenga al menos una imagen o un modelo 3D cargado.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button" onClick={save} disabled={saving || tooManyImages}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
        {model.status === 'ready' && (
          <a
            href={bimModelHref(model.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver página pública
          </a>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={saving}
          className="ml-auto text-sm text-red-600 hover:text-red-700 disabled:opacity-40"
        >
          Eliminar pieza
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Escribir la página**

Crear `app/admin/(authenticated)/bim/page.tsx`. Es un Server Component
que carga los datos y delega el estado a un cliente:

```tsx
import { redirect } from 'next/navigation';
import { getRequestUser } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getBimModelsByAuthor } from '@/data/bim-repository';
import BimAdminClient from './BimAdminClient';

export const metadata = { title: 'Modelos BIM' };

export default async function BimAdminPage() {
  const user = await getRequestUser();
  if (!user) redirect('/admin/login');

  const supabase = await createClient();
  const [models, { data: projectRows }] = await Promise.all([
    getBimModelsByAuthor(user.id),
    supabase.from('projects').select('id, name').eq('owner_id', user.id).order('name'),
  ]);

  return (
    <BimAdminClient
      initialModels={models}
      projects={(projectRows ?? []) as { id: string; name: string }[]}
    />
  );
}
```

Y `app/admin/(authenticated)/bim/BimAdminClient.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import BimModelList from '@/components/admin/BimModelList';
import BimModelEditor from '@/components/admin/BimModelEditor';
import type { BimModel } from '@/types';

export default function BimAdminClient({
  initialModels,
  projects,
}: {
  initialModels: BimModel[];
  projects: { id: string; name: string }[];
}) {
  const [models, setModels] = useState(initialModels);
  const [selectedId, setSelectedId] = useState<string | null>(initialModels[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const selected = models.find(m => m.id === selectedId) ?? null;

  const create = async () => {
    setCreating(true);
    const res = await fetch('/api/admin/bim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Pieza sin título' }),
    });
    setCreating(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? 'No se pudo crear la pieza.', 'error');
      return;
    }
    const model = data.model as BimModel;
    setModels(prev => [model, ...prev]);
    setSelectedId(model.id);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Modelos BIM</h1>
          <p className="text-sm text-gray-500 mt-1">
            Piezas de tu portfolio. Cada una puede tener imágenes y, más adelante, un modelo 3D navegable.
          </p>
        </div>
        <Button type="button" onClick={create} disabled={creating}>
          <Plus className="w-4 h-4" /> {creating ? 'Creando...' : 'Nueva pieza'}
        </Button>
      </div>

      <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
        <BimModelList models={models} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          {selected ? (
            <BimModelEditor
              model={selected}
              projects={projects}
              onSaved={updated => setModels(prev => prev.map(m => (m.id === updated.id ? updated : m)))}
              onDeleted={id => {
                setModels(prev => prev.filter(m => m.id !== id));
                setSelectedId(prev => (prev === id ? null : prev));
              }}
            />
          ) : (
            <p className="text-sm text-gray-500">Elegí una pieza de la lista o creá una nueva.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Sumar la entrada al menú de cuenta**

En `components/app/AppShell.tsx`, después del `<Link href="/admin/portfolio">`
(línea ~159), agregar en el mismo estilo:

```tsx
<Link href="/admin/bim" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors">
  Modelos BIM
</Link>
```

- [ ] **Step 5: Verificación manual**

Run: `pnpm dev`

Comprobar en `http://localhost:3000/admin/bim`, con sesión iniciada:
1. "Nueva pieza" crea una entrada llamada "Pieza sin título", marcada
   **Sin publicar**.
2. Cambiar título y descripción, Guardar, recargar: los cambios quedaron.
3. Subir 2 imágenes: el estado pasa a **Publicada** y la miniatura de la
   lista muestra la primera.
4. Arrastrar para reordenar las imágenes y Guardar: el orden queda.
5. Borrar todas las imágenes y Guardar: vuelve a **Sin publicar** y
   aparece el aviso ámbar.
6. Asociar un proyecto, Guardar, recargar: sigue asociado.
7. "Eliminar pieza" la saca de la lista; verificar en el panel de
   Supabase que los objetos bajo `bim/<id>/` ya no están en el bucket.

- [ ] **Step 6: Commit**

```bash
git add app/admin/\(authenticated\)/bim components/admin/BimModelList.tsx components/admin/BimModelEditor.tsx components/app/AppShell.tsx
git commit -m "feat(bim): pantalla de admin para crear y editar piezas BIM

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Borrado de proyecto con elección

**Files:**
- Modify: `app/api/admin/projects/[id]/route.ts`
- Modify: `app/api/admin/projects/[id]/route.test.ts`
- Create: `app/api/admin/projects/[id]/bim-count/route.ts`
- Test: `app/api/admin/projects/[id]/bim-count/route.test.ts`
- Modify: `components/admin/DeleteProjectModal.tsx`

**Interfaces:**
- Consumes: `deleteBimStorageFiles` (Task 3).
- Produces:
  - `DELETE /api/admin/projects/[id]?deleteBim=true` borra las piezas
    propias; sin el flag (o en `false`) no borra ninguna.
  - `GET /api/admin/projects/[id]/bim-count` → `{ own: number; other: number }`.

**Nota de diseño:** las dos pantallas que abren el modal
(`app/admin/(authenticated)/proyectos/page.tsx` y
`app/admin/(authenticated)/(project)/settings/page.tsx`) son Client
Components que traen sus datos por fetch, así que **el modal se pide los
conteos solo** al abrirse, en vez de que cada pantalla los cargue y los
pase por props. Resultado: ninguna de esas dos pantallas se toca, y la
prop `project` del modal sigue siendo `{ id, name }`.

- [ ] **Step 1: Agregar los tests al archivo existente**

En `app/api/admin/projects/[id]/route.test.ts`, agregar el mock del
helper arriba, junto a los otros:

```ts
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));
```

y el import:

```ts
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
```

Cambiar `req()` para que acepte el flag:

```ts
function req(id: string, deleteBim?: boolean) {
  const qs = deleteBim ? '?deleteBim=true' : '';
  return new Request(`http://localhost/api/admin/projects/${id}${qs}`, { method: 'DELETE' });
}
```

Agregar al `beforeEach`:

```ts
vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
```

Y agregar este bloque de tests al final del archivo:

```ts
describe('DELETE /api/admin/projects/[id] — piezas BIM asociadas', () => {
  const bimRows = [
    { id: 'bim-1', author_id: 'user-1', geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: ['https://x/1.png'] },
    { id: 'bim-2', author_id: 'otro-user', geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
  ];

  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteProjectStorageFiles).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('sin deleteBim: no toca ninguna pieza BIM', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    // .from(): bim_models (lectura), leads, projects
    const admin = mockSupabase({ results: [{ data: bimRows }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });

  it('con deleteBim: borra solo las propias, y sus archivos', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    // .from(): bim_models (lectura), bim_models (delete), leads, projects
    const admin = mockSupabase({ results: [{ data: bimRows }, { error: null }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1', true), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledWith(admin, [bimRows[0]]);
  });

  it('con deleteBim pero sin piezas propias: no llama al borrado de archivos', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ data: [bimRows[1]] }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1', true), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm test app/api/admin/projects`
Esperado: FAIL — los tres tests nuevos fallan porque la ruta todavía no
lee `bim_models` (el mock se queda con resultados sin consumir y/o
`deleteBimStorageFiles` nunca se llama).

- [ ] **Step 3: Modificar la ruta**

En `app/api/admin/projects/[id]/route.ts`, reemplazar el cuerpo de
`DELETE` a partir de `const admin = createAdminClient();`:

```ts
  const admin = createAdminClient();

  // Piezas BIM asociadas: viven en el portfolio del AUTOR, no del
  // proyecto, así que el modal pregunta qué hacer con ellas. Sin el flag
  // se quedan (project_id pasa a null por el on delete set null del
  // schema). Con el flag solo se borran las del que está borrando: el
  // dueño del proyecto no puede borrarle una pieza de portfolio a un
  // colaborador — esas se desvinculan igual que sin el flag.
  const deleteBim = new URL(request.url).searchParams.get('deleteBim') === 'true';
  const { data: bimRows } = await admin
    .from('bim_models')
    .select('id, author_id, geometry_url, properties_url, cover_image, source_url, gallery_images')
    .eq('project_id', id);

  const own = (bimRows ?? []).filter(m => m.author_id === access.user.id);
  if (deleteBim && own.length > 0) {
    await deleteBimStorageFiles(admin, own);
    await admin.from('bim_models').delete().in('id', own.map(m => m.id));
  }

  await deleteProjectStorageFiles(admin, id);
  await admin.from('leads').delete().eq('project_id', id);

  const { error } = await admin.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
```

Y agregar el import arriba:

```ts
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
```

> Nota para quien ejecuta: los tests que ya existían esperaban
> `admin.from` llamado 2 veces. Ahora son 3 (lectura de `bim_models` +
> leads + projects). Actualizar esa aserción a `3` y agregar a sus colas
> de `results` un primer `{ data: [] }` para la lectura de `bim_models`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm test app/api/admin/projects`
Esperado: PASS, todos los tests del archivo.

- [ ] **Step 5: Escribir la ruta de conteo, con su test**

Crear `app/api/admin/projects/[id]/bim-count/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(id: string) {
  return new Request(`http://localhost/api/admin/projects/${id}/bim-count`);
}

describe('GET /api/admin/projects/[id]/bim-count', () => {
  beforeEach(() => vi.mocked(requireProjectAccess).mockReset());

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(req('project-1'), params('project-1'));
    expect(res.status).toBe(401);
  });

  it('separa las piezas propias de las de otros colaboradores', async () => {
    const supabase = mockSupabase({
      results: [{ data: [{ author_id: 'user-1' }, { author_id: 'user-1' }, { author_id: 'otro' }] }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 2, other: 1 });
  });

  it('proyecto sin piezas: ceros', async () => {
    const supabase = mockSupabase({ results: [{ data: [] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 0, other: 0 });
  });
});
```

Correr (`pnpm test app/api/admin/projects`) y verificar que falla por
módulo inexistente. Después crear
`app/api/admin/projects/[id]/bim-count/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';

// Lo consulta DeleteProjectModal al abrirse, para saber si mostrar la
// elección "conservar / eliminar también" y cuántas piezas de otros
// colaboradores se van a desvincular.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data } = await access.supabase.from('bim_models').select('author_id').eq('project_id', id);
  const rows = (data ?? []) as { author_id: string }[];
  const own = rows.filter(r => r.author_id === access.user.id).length;

  return NextResponse.json({ own, other: rows.length - own });
}
```

Volver a correr: PASS, 3 tests.

- [ ] **Step 6: Agregar la elección al modal**

En `components/admin/DeleteProjectModal.tsx`. La interfaz
`DeleteProjectTarget` **no cambia** — el modal se trae los conteos solo:

```tsx
const [deleteBim, setDeleteBim] = useState(false);
const [bimCount, setBimCount] = useState<{ own: number; other: number } | null>(null);
```

```tsx
// Los conteos se piden acá y no en las dos pantallas que abren el modal:
// ambas son Client Components que ya traen sus datos por fetch, así que
// cargarlo en cada una sería el mismo request duplicado.
useEffect(() => {
  if (!project) {
    setBimCount(null);
    return;
  }
  let cancelled = false;
  fetch(`/api/admin/projects/${project.id}/bim-count`)
    .then(res => (res.ok ? res.json() : null))
    .then(data => { if (!cancelled && data) setBimCount(data); })
    .catch(() => {});
  return () => { cancelled = true; };
}, [project]);
```

(sumando `useEffect` al import de `react` que ya está arriba).

Cambiar el `fetch` de `handleConfirm`:

```tsx
const res = await fetch(`/api/admin/projects/${project.id}?deleteBim=${deleteBim}`, { method: 'DELETE' });
```

Resetear el estado en `handleClose` y tras borrar:

```tsx
setDeleteBim(false);
```

E insertar este bloque entre el `<p>` de advertencia y el `<label>` de
confirmación:

```tsx
{bimCount && bimCount.own > 0 && (
  <div className="mt-4 rounded-xl border border-gray-200 p-3.5">
    <p className="text-sm font-medium text-gray-900 mb-2">
      Este proyecto tiene {bimCount.own}{' '}
      {bimCount.own === 1 ? 'modelo BIM asociado' : 'modelos BIM asociados'}.
    </p>
    <label className="flex items-start gap-2.5 text-sm text-gray-700 mb-1.5">
      <input
        type="radio" name="bim-action" checked={!deleteBim}
        onChange={() => setDeleteBim(false)} disabled={deleting}
        className="mt-0.5"
      />
      <span>Conservarlos en mi portfolio <span className="text-gray-400">(recomendado)</span></span>
    </label>
    <label className="flex items-start gap-2.5 text-sm text-gray-700">
      <input
        type="radio" name="bim-action" checked={deleteBim}
        onChange={() => setDeleteBim(true)} disabled={deleting}
        className="mt-0.5"
      />
      <span>Eliminarlos también</span>
    </label>
    {bimCount.other > 0 && (
      <p className="text-xs text-gray-500 mt-2.5">
        {bimCount.other === 1
          ? '1 modelo de otro colaborador se desvinculará, no se elimina.'
          : `${bimCount.other} modelos de otros colaboradores se desvincularán, no se eliminan.`}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 7: Verificación manual**

Run: `pnpm dev`

1. Crear una pieza BIM con una imagen y asociarla a un proyecto.
2. Borrar ese proyecto eligiendo **Conservarlos**: la pieza sigue en
   `/admin/bim`, ahora sin proyecto asociado.
3. Repetir eligiendo **Eliminarlos también**: la pieza desaparece y sus
   archivos ya no están en el bucket.
4. Con un proyecto sin piezas asociadas, el bloque no aparece.

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/projects components/admin/DeleteProjectModal.tsx
git commit -m "feat(bim): al borrar un proyecto, elegir si se borran sus piezas BIM

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Página pública `/bim/[id]`

**Files:**
- Create: `app/bim/[id]/page.tsx`
- Create: `components/bim/BimGallery.tsx`

**Interfaces:**
- Consumes: `getBimModelById` (Task 2); `shimmerDataUrl` de
  `lib/imagePlaceholder`.
- Produces: `BimGallery({ images, title })`. La Fase 3 monta el visor 3D
  arriba de este componente, sin tocarlo.

- [ ] **Step 1: Escribir la galería**

Crear `components/bim/BimGallery.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';

export default function BimGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-gray-100">
        <Image
          src={images[active]}
          alt={`${title} — imagen ${active + 1}`}
          fill
          sizes="(min-width: 1024px) 900px, 100vw"
          placeholder="blur"
          blurDataURL={shimmerDataUrl()}
          className="object-contain"
          priority={active === 0}
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver imagen ${i + 1}`}
              aria-current={i === active}
              className={`relative w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${
                i === active ? 'border-gray-900' : 'border-transparent hover:border-gray-300'
              }`}
            >
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir la página**

Crear `app/bim/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getBimModelById } from '@/data/bim-repository';
import BimGallery from '@/components/bim/BimGallery';

interface PageProps { params: Promise<{ id: string }>; }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const model = await getBimModelById(id);
  if (!model) return { title: 'Modelo no encontrado' };

  const description = model.description || `Modelo BIM publicado en Atrium.`;
  return {
    title: model.title,
    description,
    openGraph: {
      title: model.title,
      description,
      images: model.coverImage ? [model.coverImage] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: model.title,
      description,
      images: model.coverImage ? [model.coverImage] : undefined,
    },
  };
}

export default async function BimModelPage({ params }: PageProps) {
  const { id } = await params;
  const model = await getBimModelById(id);

  // RLS ya oculta las piezas privadas y las no publicadas a quien no sea
  // el autor; este chequeo cubre el caso del propio autor entrando a una
  // pieza suya que todavía no publicó.
  if (!model || model.status !== 'ready') notFound();

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium text-gray-900 tracking-tight">{model.title}</h1>
        {model.description && (
          <p className="text-gray-600 whitespace-pre-line max-w-2xl">{model.description}</p>
        )}
      </header>

      {/* El visor 3D lo monta la Fase 3 acá arriba, cuando geometryUrl deje de ser null. */}

      <BimGallery images={model.galleryImages} title={model.title} />
    </main>
  );
}
```

- [ ] **Step 3: Verificación manual**

Run: `pnpm dev`

1. Abrir `/bim/<id>` de una pieza publicada: título, descripción y
   galería con miniaturas que cambian la imagen grande.
2. Abrir `/bim/<id>` de una pieza **sin publicar**: 404.
3. Marcar una pieza como no pública y abrirla en una ventana de
   incógnito: 404.
4. Pegar el link en WhatsApp Web o usar
   `https://www.opengraph.xyz/` contra la URL desplegada: la tarjeta
   muestra la portada.

- [ ] **Step 4: Commit**

```bash
git add app/bim components/bim
git commit -m "feat(bim): página pública de una pieza BIM con galería y OG

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Pestaña BIM en el portfolio

**Files:**
- Modify: `data/profile-repository.ts` (interfaz `Portfolio` y
  `getPortfolioByHandle`)
- Modify: `app/(social)/portfolio/[handle]/page.tsx` (pasar la prop)
- Modify: `components/social/ProfileTabs.tsx` (`TabKey` y el panel)
- Create: `components/social/BimGrid.tsx`

**Interfaces:**
- Consumes: `getPublicBimModelsByAuthor` (Task 2); `bimModelHref`
  (Task 1).
- Produces: `Portfolio.bimModels: BimModel[]`;
  `BimGrid({ models }: { models: BimModel[] })`;
  `TabKey` incluye `'bim'`.

- [ ] **Step 1: Cargar las piezas en el repositorio de perfil**

En `data/profile-repository.ts`, agregar el campo a la interfaz
`Portfolio`:

```ts
  /** Piezas BIM públicas y publicadas de esta cuenta — pestaña "BIM" del perfil. */
  bimModels: BimModel[];
```

con el import correspondiente (`import type { BimModel } from '@/types';`
sumado al import de tipos que ya existe), y dentro de
`getPortfolioByHandle`, después de resolver el `profile.id`, sumar la
llamada al `Promise.all` que ya arma proyectos y colaboraciones:

```ts
getPublicBimModelsByAuthor(profile.id),
```

destructurando el resultado en una variable `bimModels` y devolviéndola
en el objeto final. El import va arriba:

```ts
import { getPublicBimModelsByAuthor } from './bim-repository';
```

- [ ] **Step 2: Escribir la grilla**

Crear `components/social/BimGrid.tsx`:

```tsx
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { bimModelHref } from '@/lib/bim';
import type { BimModel } from '@/types';

export default function BimGrid({ models }: { models: BimModel[] }) {
  if (models.length === 0) {
    return (
      <p className="text-sm text-trevo-dark/50 py-10 text-center">
        Todavía no hay modelos publicados.
      </p>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {models.map(m => (
        <Link
          key={m.id}
          href={bimModelHref(m.id)}
          className="group rounded-[16px] overflow-hidden bg-white border border-trevo-dark/[0.09] hover:border-trevo-dark/30 transition-colors flex flex-col"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_18px,#dcd8d0_18px,#dcd8d0_36px)]">
            {m.coverImage ? (
              <Image
                src={m.coverImage} alt={m.title} fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                placeholder="blur" blurDataURL={shimmerDataUrl()}
                className="object-cover"
              />
            ) : null}
            {m.geometryUrl && (
              <span className="absolute top-3 left-3 h-6 px-2.5 rounded-md bg-[#1c1a17]/80 text-white text-[10.5px] font-medium tracking-[0.06em] flex items-center">
                3D
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 py-[14px] px-[15px]">
            <p className="text-sm font-medium text-trevo-dark truncate">{m.title}</p>
            {m.description && (
              <p className="text-[12.5px] text-trevo-dark/55 line-clamp-2">{m.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Sumar la pestaña**

En `components/social/ProfileTabs.tsx`:

```ts
type TabKey = 'proyectos' | 'bim' | 'publicaciones' | 'trayectoria';
```

Agregar la prop a `ProfileTabsProps`:

```ts
  bimModels: BimModel[];
```

(con `import type { BimModel } from '@/types';` sumado al import de tipos
que ya existe, y `import BimGrid from '@/components/social/BimGrid';`).

En la lista de pestañas que arma el componente, insertar la entrada
`{ key: 'bim', label: 'BIM', count: bimModels.length }` después de
"Proyectos", **condicionada a que haya al menos una pieza o que el
visitante sea el dueño** — así un perfil sin BIM no muestra una pestaña
vacía:

```tsx
...(bimModels.length > 0 || isOwner ? [{ key: 'bim' as const, label: 'BIM', count: bimModels.length }] : []),
```

Y en el render del panel activo:

```tsx
{active === 'bim' && <BimGrid models={bimModels} />}
```

- [ ] **Step 4: Pasar la prop desde la página**

En `app/(social)/portfolio/[handle]/page.tsx`, donde se renderiza
`<ProfileTabs ... />`, agregar:

```tsx
bimModels={portfolio.bimModels}
```

- [ ] **Step 5: Verificar tipos y correr toda la suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores de tipos, toda la suite en PASS.

- [ ] **Step 6: Verificación manual**

Run: `pnpm dev`

1. Con una pieza publicada, abrir `/portfolio/<handle>`: aparece la
   pestaña **BIM** con la pieza, y el click lleva a `/bim/<id>`.
2. Despublicar la pieza (desmarcar "Visible para cualquiera"): en
   incógnito la pestaña ya no aparece; logueado como dueño, la pestaña
   aparece vacía con el mensaje.
3. Abrir el perfil de otra cuenta sin piezas: la pestaña no está.

- [ ] **Step 7: Commit**

```bash
git add data/profile-repository.ts app/\(social\)/portfolio components/social/ProfileTabs.tsx components/social/BimGrid.tsx
git commit -m "feat(bim): pestaña BIM en el portfolio público

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verificación final de la fase

- [ ] `pnpm exec tsc --noEmit` — sin errores.
- [ ] `pnpm test` — toda la suite en verde.
- [ ] `pnpm lint` — sin errores nuevos.
- [ ] `pnpm build` — compila.
- [ ] Crear el bucket `bim-models` en Supabase (público en lectura) si no
      se hizo en la Task 1. **Sin esto la subida de imágenes de la
      galería funciona igual** (van a `project-media` vía
      `/api/admin/upload`), pero la Fase 2 lo necesita.
- [ ] Correr el bloque nuevo de `supabase/schema.sql` contra la base de
      producción.

---

## Fuera de esta fase

Lo que sigue, cada uno con su propio plan cuando esta fase esté
mergeada. El modelo de datos de la Task 1 ya los contempla: ninguna
requiere migración adicional.

**Fase 2 — Ingesta del modelo.** `POST /api/bim/sign` que devuelve
signed upload URLs del bucket `bim-models`; Web Worker con `web-ifc` que
parsea el IFC y emite geometría + propiedades + árbol; captura del canvas
como portada; UI de progreso; límites de la decisión 7
(`MAX_GEOMETRY_BYTES` y compañía, ya definidos en `lib/bim.ts`); bloqueo
en móvil; estado `failed` con `error_message`. Al terminar, llena
`geometry_url`, `properties_url`, `source_format`, `stats` y `cover_image`
de una pieza que ya existe.

**Fase 3 — Visor.** Componente `BimViewer` sobre `@react-three/fiber`,
que se monta en `app/bim/[id]/page.tsx` donde el comentario lo marca:
órbita/pan/zoom, encuadre automático, árbol de elementos por piso y
categoría, panel de propiedades al click, aislar/ocultar, plano de
sección arrastrable, vistas preseteadas, fullscreen con salida por
Escape, y hoja inferior en móvil. Fallback a la portada si no hay WebGL2.

**Fase 4 — Sección en la landing.** Key `'bim'` en `SECTION_REGISTRY`
(`lib/project-sections.ts`), componente `BimSection` registrado en
`components/project-landing/registry.ts`, `bimModels` sumado al tipo
`Project` y a `getProjectBySlug` (`data/project-repository.ts`), entrada
en `sectionHint` y `sectionEditHref` (apuntando a `/admin/bim`), y
`computeEmptySectionKeys` marcando la sección vacía cuando no hay pieza
asociada.
