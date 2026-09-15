# BIM — repliegue de portfolio a proyecto (pieza A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un modelo BIM deje de ser una pieza del portfolio del autor y pase a ser contenido de un proyecto — se carga desde adentro del proyecto (asistente guiado o después), se ve en la landing de ese proyecto, y muere con él.

**Architecture:** `bim_models.project_id` pasa a `not null` con `on delete cascade`; `author_id` se elimina. Las rutas de API dejan de comparar contra `author_id` y pasan a resolver el proyecto (por cookie de "proyecto activo" o subiendo la cadena de FKs desde el id de la pieza) y llamar a `requireProjectAccess`, el mismo patrón que ya usan `amenities`/`points_of_interest`. El admin se muda de `/admin/bim` (nivel cuenta) a `/admin/proyecto/bim` (nivel proyecto) más un paso nuevo del asistente guiado. Toda la superficie a nivel cuenta (ícono de nav, ítem de menú, pestaña de portfolio, `BimGrid`) se elimina.

**Tech Stack:** Next 16 (App Router), React 19, Supabase (Postgres + RLS + Storage), TypeScript, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-bim-repliegue-a-proyecto-design.md`

## Global Constraints

- **Idioma:** todo el texto de UI y los comentarios de código en castellano rioplatense, como el resto del repo. Los identificadores en inglés.
- **Sin `author_id`:** la columna se elimina de la base, del tipo `BimModel`/`BimModelRow`, y de todo lector. Ninguna ruta vuelve a comparar contra `auth.uid()` directo sobre `bim_models` — la autorización pasa siempre por `requireProjectAccess(projectId)`.
- **`project_id` es `not null`, `on delete cascade`:** borrar un proyecto se lleva sus piezas BIM sin preguntar. No hay flag `deleteBim`, no hay elección en el modal de borrado.
- **"Tiene BIM" se deriva, nunca se guarda:** no existe una columna `has_bim` en `projects`. La sección de landing y cualquier otra UI lo calculan de si hay piezas con `status = 'ready'`.
- **`bim` no entra en `computeEmptySectionKeys`:** mismo criterio que ya aplica a `calculator`/`contact` (secciones que existen pero nunca se marcan "vacías" para no generar un aviso falso en un proyecto que legítimamente no la usa).
- **RLS del proyecto, no de autoría:** pública = `is_public && status='ready' && projects.published`; dueño = `projects.owner_id = auth.uid()`, sin distinción de quién subió qué.
- **Patrón de rutas a seguir:** `resolveRequestedProjectId(request)` + `requireProjectAccess(projectId)` para las rutas de colección; `resolveProjectIdFrom<Recurso>(id)` + `requireProjectAccess(projectId)` para las rutas de un recurso puntual — exactamente como ya hacen `app/api/admin/amenities/route.ts` y `app/api/admin/amenities/[id]/route.ts`.
- **Tests:** `pnpm test`. Mock de Supabase con `mockSupabase()` de `lib/test-helpers/supabase-mock.ts`.

---

## File Structure

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `components/admin/section-editors/BimEditor.tsx` | Editor de BIM autosuficiente (resuelve el proyecto activo por su cuenta, como `AmenitiesEditor`/`LocationEditor`) — usado en el asistente Y en `/admin/proyecto/bim`. Con cero piezas muestra la decisión "¿querés mostrar un modelo BIM?"; con una o más, la lista + editor de siempre. |
| `app/admin/(authenticated)/(project)/proyecto/bim/page.tsx` | Wrapper con header, igual patrón que `proyecto/amenities/page.tsx`. |
| `components/project-landing/BimSection.tsx` | Sección de la landing pública — grilla de piezas `ready`, cada una linkeando a `/bim/[id]`. |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | `project_id not null` + `on delete cascade`, elimina `author_id`, RLS nueva basada en `projects`. |
| `types/database.ts` | `BimModelRow` sin `author_id`. |
| `types/index.ts` | `BimModel` sin `authorId`; `project_id`/`projectId` documentados como obligatorios; `Project` gana `bimModels: BimModel[]`. |
| `lib/bim.ts` | Corrige el comentario de `BIM_BUCKET` (no "barre el bucket entero"). |
| `data/bim-repository.ts` | `mapBimModelRow` sin `authorId`; `getBimModelsByAuthor`/`getPublicBimModelsByAuthor` se eliminan; nueva `getBimModelsByProject`. |
| `data/bim-repository.test.ts` | Se actualiza para el nuevo shape. |
| `lib/supabase/require-project-access.ts` | Nueva `resolveProjectIdFromBimModel(bimModelId)`. |
| `app/api/admin/bim/route.ts` | POST/GET pasan a resolver el proyecto por cookie, sin `author_id` ni `projectId` en el body. |
| `app/api/admin/bim/route.test.ts` | Reescrito para el nuevo contrato. |
| `app/api/admin/bim/[id]/route.ts` | PATCH/DELETE resuelven el proyecto desde el id de la pieza. |
| `app/api/admin/bim/[id]/route.test.ts` | Reescrito. |
| `app/api/admin/projects/[id]/route.ts` | Limpieza de Storage de BIM incondicional, sin filtro de autor ni flag `deleteBim`; el cascade se lleva las filas solo. |
| `app/api/admin/projects/[id]/route.test.ts` | El describe "piezas BIM asociadas" se simplifica a un solo caso. |
| `components/admin/DeleteProjectModal.tsx` | Se saca todo el bloque de elección BIM (props, estado, fetch, JSX). |
| `components/admin/BimModelEditor.tsx` | Se saca el prop `projects` y el `<select>` "Proyecto asociado". |
| `app/admin/(authenticated)/(project)/wizard/page.tsx` | Nuevo paso `bim` en `ProjectStep` y en el `Step` de `casa`; copy actualizado. |
| `app/admin/(authenticated)/(project)/ProjectAdminShell.tsx` | Nueva entrada "Modelo BIM" en `projectSubItems`. |
| `lib/project-sections.ts` | Nueva key `bim` en el registro, sin entrada en `AVAILABILITY` ni en `computeEmptySectionKeys`. |
| `components/project-landing/registry.ts` | `bim: BimSection`. |
| `data/project-repository.ts` | `getProjectBySlug` suma `bimModels` vía `getBimModelsByProject`. |
| `components/app/AppShell.tsx` | Se saca el ícono de nav y el ítem del menú de cuenta. |
| `app/(social)/portfolio/[handle]/page.tsx` | Se saca la card "Subí tu primer modelo BIM" y el prop `bimModels` a `ProfileTabs`. |
| `components/social/ProfileTabs.tsx` | Se saca la pestaña BIM completa (tipo, prop, tab, panel). |
| `data/profile-repository.ts` | Se saca `bimModels` de `Portfolio` y la llamada a `getPublicBimModelsByAuthor`. |

**Eliminar:**

| Archivo |
|---|
| `app/admin/(authenticated)/bim/page.tsx` |
| `app/admin/(authenticated)/bim/BimAdminClient.tsx` |
| `components/social/BimGrid.tsx` |
| `app/api/admin/projects/[id]/bim-count/route.ts` |
| `app/api/admin/projects/[id]/bim-count/route.test.ts` |

**Sin cambios:** `components/admin/BimModelList.tsx` (ya es agnóstico de dueño), `components/bim/BimGallery.tsx`, `app/bim/[id]/page.tsx` (su 404 doble ya cubre lo que hace falta — ver Task 9), `lib/supabase/delete-bim-storage.ts` (se sigue usando tal cual).

---

### Task 1: Schema — el proyecto pasa a ser dueño

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `bim_models` con `project_id not null references projects(id) on delete cascade`, sin columna `author_id`, y RLS nueva. Todas las tasks siguientes asumen este schema.

- [ ] **Step 1: Escribir la migración**

Buscar el bloque `bim_models` en `supabase/schema.sql` (el `create table if not exists bim_models (...)` y sus políticas RLS, agregado en la Fase 1) y agregar, inmediatamente después de ese bloque completo (después de la última política `create policy "author write bim_models"...`):

```sql
-- ─── Repliegue de BIM: del autor al proyecto ────────────────────────
-- La Fase 1 modeló bim_models como una pieza de PORTFOLIO (author_id
-- obligatorio, project_id opcional). El producto pide lo contrario: BIM
-- es contenido DEL PROYECTO. Esta feature nunca llegó a un usuario real
-- — no hay filas que perder — así que la migración no necesita backfill,
-- solo barrer cualquier fila de prueba que haya quedado sin proyecto.
delete from bim_models where project_id is null;

alter table bim_models alter column project_id set not null;

alter table bim_models drop constraint if exists bim_models_project_id_fkey;
alter table bim_models add constraint bim_models_project_id_fkey
  foreign key (project_id) references projects(id) on delete cascade;

-- author_id solo servía para la autorización (comparado contra
-- auth.uid() en las políticas de abajo) y referenciaba profiles(id), una
-- tabla opt-in — eso fue lo que causó el bug real encontrado probando en
-- vivo (una cuenta sin portfolio no podía crear su primera pieza). Con
-- el proyecto como dueño, esa columna queda sin un solo lector.
alter table bim_models drop column if exists author_id;

drop policy if exists "public read bim_models" on bim_models;
drop policy if exists "author read own bim_models" on bim_models;
drop policy if exists "author write bim_models" on bim_models;

-- Pública: la pieza se ve si está lista, marcada visible, y su proyecto
-- publicado. El dueño del proyecto la ve igual sin publicar (política de
-- abajo) — es previsualización, mismo criterio que ya usa /admin/sitio.
create policy "public read bim_models" on bim_models for select to anon, authenticated
  using (
    is_public and status = 'ready'
    and exists (select 1 from projects where projects.id = bim_models.project_id and projects.published)
  );

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

- [ ] **Step 2: Correr esto contra la base de Supabase real**

Copiar el bloque nuevo (o el `schema.sql` completo) al SQL Editor del dashboard de Supabase y ejecutar. No hay test automático para esto — es DDL contra una base viva, y el resto de las tasks lo ejercitan indirectamente vía sus propios tests con Supabase mockeado.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(bim): el proyecto pasa a ser dueño de bim_models, se elimina author_id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos y repositorio

**Files:**
- Modify: `types/database.ts`
- Modify: `types/index.ts`
- Modify: `lib/bim.ts`
- Modify: `data/bim-repository.ts`
- Modify: `data/bim-repository.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (es la base de tipos que todo lo demás usa).
- Produces:
  - `BimModelRow` (types/database.ts) sin `author_id`.
  - `BimModel` (types/index.ts) sin `authorId`; `projectId: string` (ya no `string | null`).
  - `mapBimModelRow(row: BimModelRow): BimModel`.
  - `getBimModelsByProject(projectId: string): Promise<BimModel[]>` — todas las piezas del proyecto, cualquier estado (para el admin).
  - `getPublicBimModelsByProject(projectId: string): Promise<BimModel[]>` — sin cambios, ya existía.
  - `getBimModelById(id: string): Promise<BimModel | undefined>` — sin cambios de firma.

- [ ] **Step 1: Actualizar `types/database.ts`**

Sacar la línea `author_id: string;` de `BimModelRow`.

- [ ] **Step 2: Actualizar `types/index.ts`**

En `BimModel`, sacar el campo `authorId: string;` y cambiar el tipo de `projectId`:

```ts
export interface BimModel {
  id: string;
  /** Proyecto dueño de la pieza — nunca null: BIM es contenido de un proyecto. */
  projectId: string;
  title: string;
  description: string;
  sourceFormat: BimSourceFormat | null;
  sourceUrl: string | null;
  geometryUrl: string | null;
  propertiesUrl: string | null;
  galleryImages: string[];
  coverImage: string | null;
  stats: BimModelStats | null;
  status: BimModelStatus;
  errorMessage: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Corregir el comentario de `lib/bim.ts`**

Reemplazar:

```ts
/** Bucket propio: NO es project-media, porque delete-project-storage.ts
 *  barre ese bucket entero al borrar un proyecto y una pieza BIM tiene que
 *  sobrevivir a eso salvo que su autor decida lo contrario. */
export const BIM_BUCKET = 'bim-models';
```

por:

```ts
/** Bucket propio: NO es project-media. Ese bucket lo vacía
 *  deleteProjectStorageFiles() de las URLs que encuentra en las tablas
 *  del proyecto al borrarlo — un mecanismo distinto del que usa este
 *  archivo (ver lib/supabase/delete-bim-storage.ts), así que conviene
 *  mantenerlos separados aunque ahora una pieza BIM SÍ muera junto con
 *  su proyecto (cascade de la base). */
export const BIM_BUCKET = 'bim-models';
```

El resto de `lib/bim.ts` (`canPublishBimModel`, `bimModelHref`, los límites) no cambia.

- [ ] **Step 4: Escribir el test de `getBimModelsByProject` (reemplaza a `getBimModelsByAuthor`)**

Reescribir `data/bim-repository.test.ts` completo:

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import type { BimModel } from '@/types';
import type { BimModelRow } from '@/types/database';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

let mapBimModelRow: (row: BimModelRow) => BimModel;
let getBimModelsByProject: (projectId: string) => Promise<BimModel[]>;
let getBimModelById: (id: string) => Promise<BimModel | undefined>;

beforeAll(async () => {
  const bimRepository = await import('./bim-repository');
  mapBimModelRow = bimRepository.mapBimModelRow;
  getBimModelsByProject = bimRepository.getBimModelsByProject;
  getBimModelById = bimRepository.getBimModelById;
});

const row: BimModelRow = {
  id: 'bim-1',
  project_id: 'project-1',
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
    expect(model.projectId).toBe('project-1');
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

describe('getBimModelsByProject', () => {
  beforeAll(() => {
    vi.mocked(createClient).mockReset();
  });

  it('devuelve las piezas mapeadas', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: [row] }] }) as never);
    const models = await getBimModelsByProject('project-1');
    expect(models).toHaveLength(1);
    expect(models[0].title).toBe('Casa Patio');
  });

  it('sin filas: array vacío, no undefined', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await getBimModelsByProject('project-1')).toEqual([]);
  });
});

describe('getBimModelById', () => {
  beforeAll(() => {
    vi.mocked(createClient).mockReset();
  });

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

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `pnpm test data/bim-repository.test.ts`
Esperado: FAIL — `getBimModelsByProject` no existe todavía.

- [ ] **Step 6: Reescribir `data/bim-repository.ts`**

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

// Todas las piezas del proyecto — incluidas privadas, en processing y
// fallidas. La política RLS "project owner read bim_models" es la que
// permite verlas; con el cliente anónimo este query devuelve vacío.
export const getBimModelsByProject = cache(async (projectId: string): Promise<BimModel[]> => {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('bim_models')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as BimModelRow[]).map(mapBimModelRow);
});

// Para la landing pública: el filtro va explícito además de RLS, mismo
// criterio que ya usa amenities/pointsOfInterest en project-repository.ts.
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

// Sin filtro de visibilidad: RLS decide. El dueño del proyecto entra a
// una pieza en processing o de un proyecto sin publicar desde el admin;
// un visitante recibe undefined → notFound().
export const getBimModelById = cache(async (id: string): Promise<BimModel | undefined> => {
  if (!SUPABASE_CONFIGURED) return undefined;
  const supabase = await createClient();
  const { data } = await supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  return data ? mapBimModelRow(data as BimModelRow) : undefined;
});
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `pnpm test data/bim-repository.test.ts`
Esperado: PASS, 6 tests.

- [ ] **Step 8: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Esperado: van a aparecer errores en los archivos que todavía usan `getBimModelsByAuthor`/`getPublicBimModelsByAuthor`/`authorId` — son exactamente los que tocan las tasks siguientes. Confirmar que la lista de errores coincide con: `app/admin/(authenticated)/bim/page.tsx`, `app/api/admin/bim/route.ts`, `app/api/admin/bim/[id]/route.ts`, `data/profile-repository.ts`, `components/social/ProfileTabs.tsx`. No hace falta arreglarlos en esta task.

- [ ] **Step 9: Commit**

```bash
git add types/database.ts types/index.ts lib/bim.ts data/bim-repository.ts data/bim-repository.test.ts
git commit -m "feat(bim): tipos y repositorio project-scoped, sin author_id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Helper de autorización — resolver el proyecto desde una pieza

**Files:**
- Modify: `lib/supabase/require-project-access.ts`
- Modify: `lib/supabase/require-project-access.test.ts`

**Interfaces:**
- Consumes: nada nuevo — sigue el patrón exacto de `resolveProjectIdFromAmenity` que ya existe en el mismo archivo.
- Produces: `resolveProjectIdFromBimModel(bimModelId: string): Promise<string | null>` — usada por la Task 4.

- [ ] **Step 1: Leer el test existente para el patrón de mock**

`lib/supabase/require-project-access.test.ts` ya mockea `createClient` a mano (no usa `mockSupabase()` de `lib/test-helpers`) con un objeto que responde a `.from().select().eq().eq().maybeSingle()`. Buscar en ese archivo el describe de `resolveProjectIdFromAmenity` (u otro `resolveProjectIdFrom*` de un solo `.eq()`) para copiar exactamente su forma de mock — `resolveProjectIdFromBimModel` hace una sola consulta con un solo `.eq()`, como `resolveProjectIdFromAmenity`, no una cadena de dos como `resolveProjectIdFromFloor`.

- [ ] **Step 2: Escribir el test**

Agregar al final de `lib/supabase/require-project-access.test.ts`:

```ts
describe('resolveProjectIdFromBimModel', () => {
  it('devuelve el project_id de la pieza', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { project_id: 'project-1' } }),
          }),
        }),
      }),
    } as never);
    expect(await resolveProjectIdFromBimModel('bim-1')).toBe('project-1');
  });

  it('pieza inexistente: null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    } as never);
    expect(await resolveProjectIdFromBimModel('bim-404')).toBeNull();
  });
});
```

Y sumar `resolveProjectIdFromBimModel` al import de `./require-project-access` que ya está arriba del archivo.

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `pnpm test lib/supabase/require-project-access.test.ts`
Esperado: FAIL — `resolveProjectIdFromBimModel` no existe.

- [ ] **Step 4: Agregar la función**

En `lib/supabase/require-project-access.ts`, después de `resolveProjectIdFromAmenity`:

```ts
export async function resolveProjectIdFromBimModel(bimModelId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('bim_models').select('project_id').eq('id', bimModelId).maybeSingle();
  return data?.project_id ?? null;
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm test lib/supabase/require-project-access.test.ts`
Esperado: PASS, con los 2 tests nuevos incluidos.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/require-project-access.ts lib/supabase/require-project-access.test.ts
git commit -m "feat(bim): resolver el proyecto dueño desde el id de una pieza BIM

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: API — POST/GET/PATCH/DELETE project-scoped

**Files:**
- Modify: `app/api/admin/bim/route.ts`
- Modify: `app/api/admin/bim/route.test.ts`
- Modify: `app/api/admin/bim/[id]/route.ts`
- Modify: `app/api/admin/bim/[id]/route.test.ts`

**Interfaces:**
- Consumes: `resolveRequestedProjectId`, `requireProjectAccess`, `resolveProjectIdFromBimModel` (de `@/lib/supabase/require-project-access`); `mapBimModelRow`, `getBimModelsByProject` (de `@/data/bim-repository`, Task 2); `canPublishBimModel`, `MAX_GALLERY_IMAGES` (de `@/lib/bim`, sin cambios).
- Produces:
  - `GET /api/admin/bim` → `{ models: BimModel[] }` de la cookie de proyecto activo.
  - `POST /api/admin/bim` → `{ model: BimModel }` (201), sin `projectId` en el body — el proyecto es siempre el activo.
  - `PATCH /api/admin/bim/[id]` → `{ model: BimModel }`, sin `projectId` en el body (ya no se puede reasociar una pieza a otro proyecto — nace y muere en el suyo).
  - `DELETE /api/admin/bim/[id]` → `{ success: true }`.

- [ ] **Step 1: Escribir el test de `GET`/`POST`**

Reescribir `app/api/admin/bim/route.test.ts` completo:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  resolveRequestedProjectId: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const URL_ = 'http://localhost/api/admin/bim';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', project_id: 'project-1', title: 'Casa Patio',
    description: null, source_format: null, source_url: null, geometry_url: null,
    properties_url: null, gallery_images: [], cover_image: null, stats: null,
    status: 'processing', error_message: null, is_public: true,
    created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
    ...over,
  };
}

/**
 * Cliente que ECOA lo que la ruta realmente pasó a `.insert(...)`
 * fusionado sobre una fila base — para verificar lo que la ruta CALCULÓ
 * (status/cover_image), no lo que un mock canned devolvería igual.
 */
function echoInsertClient(base: Record<string, unknown>) {
  let payload: Record<string, unknown> = {};
  const from = vi.fn(() => {
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'insert') {
          return (p: unknown) => { payload = p as Record<string, unknown>; return proxy; };
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: { ...base, ...payload }, error: null });
        }
        if (prop === 'then') {
          return (resolve: (r: unknown) => void) => resolve({ data: { ...base, ...payload }, error: null });
        }
        return (..._args: unknown[]) => proxy;
      },
    });
    return proxy;
  });
  return { from, capturedPayload: () => payload };
}

describe('GET /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('proyecto ajeno: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(401);
  });

  it('lista las piezas del proyecto activo', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: mockSupabase({ results: [{ data: [row()] }] }) } as never);
    const res = await GET(new Request(URL_));
    expect(res.status).toBe(200);
    const { models } = await res.json();
    expect(models).toHaveLength(1);
    expect(models[0].projectId).toBe('project-1');
  });
});

describe('POST /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(404);
  });

  it('proyecto ajeno: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(401);
  });

  it('sin título: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: {} } as never);
    const res = await POST(jsonRequest(URL_, { title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el título.');
  });

  it('más imágenes que el tope: 400 con el número concreto', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase: {} } as never);
    const galleryImages = Array.from({ length: 31 }, (_, i) => `https://x/${i}.png`);
    const res = await POST(jsonRequest(URL_, { title: 'Casa', galleryImages }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('30');
  });

  it('pieza vacía: se crea en processing, asociada al proyecto activo', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = echoInsertClient(row());
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().project_id).toBe('project-1');
    expect(supabase.capturedPayload().status).toBe('processing');
    expect(supabase.capturedPayload()).not.toHaveProperty('author_id');
  });

  it('con imágenes: se crea directamente en ready', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = echoInsertClient(row());
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio', galleryImages: ['https://x/1.png'] }));
    expect(res.status).toBe(201);
    expect(supabase.capturedPayload().status).toBe('ready');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test app/api/admin/bim/route.test.ts`
Esperado: FAIL — la ruta actual todavía usa `requireAdminUser`/`author_id`/`projectId` del body.

- [ ] **Step 3: Reescribir `app/api/admin/bim/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import type { BimModelRow } from '@/types/database';

const createSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

// Lista las piezas del proyecto activo (cookie de "proyecto activo", ver
// resolveRequestedProjectId) — la usa /admin/proyecto/bim y el paso del
// asistente guiado. El portfolio público ya no existe: la vitrina pública
// es la sección de la landing (getPublicBimModelsByProject).
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await access.supabase
    .from('bim_models')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ models: ((data ?? []) as BimModelRow[]).map(mapBimModelRow) });
}

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { title, description, isPublic } = parsed.data;
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
  // 'processing' esperando que le suban el modelo (Fase C) o fotos.
  const status = canPublishBimModel({ geometryUrl: null, galleryImages }) ? 'ready' : 'processing';

  const { data, error } = await access.supabase
    .from('bim_models')
    .insert({
      project_id: projectId,
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

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test app/api/admin/bim/route.test.ts`
Esperado: PASS, 8 tests.

- [ ] **Step 5: Escribir el test de `PATCH`/`DELETE`**

Reescribir `app/api/admin/bim/[id]/route.test.ts` completo:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({
  resolveProjectIdFromBimModel: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { resolveProjectIdFromBimModel, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', project_id: 'project-1', title: 'Casa Patio',
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
    vi.mocked(resolveProjectIdFromBimModel).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('pieza inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue(null);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('pieza de un proyecto ajeno: 401', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(401);
  });

  it('agregar la primera imagen a una pieza vacía la pasa a ready y le pone portada', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [
        { data: row() },
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: ['https://x/1.png'] }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(200);
    const { model } = await res.json();
    expect(model.status).toBe('ready');
    expect(model.coverImage).toBe('https://x/1.png');
  });

  it('un proyectId en el body se ignora — la pieza no se puede reasociar', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: row() }, { data: row({ title: 'Nuevo título' }) }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await PATCH(
      jsonRequest(URL_, { title: 'Nuevo título', projectId: 'otro-proyecto' }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(res.status).toBe(200);
    expect((await res.json()).model.projectId).toBe('project-1');
  });
});

describe('DELETE /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromBimModel).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos ANTES que la fila', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: row({ gallery_images: ['https://x/1.png'] }) }, { error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledTimes(1);
  });

  it('pieza inexistente: 404, no borra archivos', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue(null);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });

  it('pieza de un proyecto ajeno: 401', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(401);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `pnpm test app/api/admin/bim/\[id\]/route.test.ts`
Esperado: FAIL — la ruta actual todavía usa `loadOwn`/`author_id`.

- [ ] **Step 7: Reescribir `app/api/admin/bim/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveProjectIdFromBimModel, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { mapBimModelRow } from '@/data/bim-repository';
import { canPublishBimModel, MAX_GALLERY_IMAGES } from '@/lib/bim';
import type { BimModelRow } from '@/types/database';

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBimModel(id);
  if (!projectId) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { data: currentData } = await access.supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  const current = currentData as BimModelRow | null;
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
  // conversión (Fase C), no editar el título.
  const publishable = canPublishBimModel({ geometryUrl: current.geometry_url, galleryImages });
  const status = current.status === 'failed' ? 'failed' : publishable ? 'ready' : 'processing';

  // La portada solo se toca si la que había dejó de existir: si la Fase C
  // ya puso una captura del modelo, editar la galería no debe pisarla.
  const coverStillThere = current.cover_image && galleryImages.includes(current.cover_image);
  const coverFromModel = current.cover_image && !current.gallery_images.includes(current.cover_image);
  const cover_image = coverStillThere || coverFromModel ? current.cover_image : galleryImages[0] ?? null;

  // projectId ya no se acepta del body — la pieza nace y muere en su
  // proyecto, no se reasocia (ver spec, decisión 1).
  const { data, error } = await access.supabase
    .from('bim_models')
    .update({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() || null } : {}),
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
  const projectId = await resolveProjectIdFromBimModel(id);
  if (!projectId) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: currentData } = await access.supabase.from('bim_models').select('*').eq('id', id).maybeSingle();
  const current = currentData as BimModelRow | null;
  if (!current) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

  // Primero los archivos (hace falta la fila para saber qué URLs tenía),
  // después la fila. El cliente admin es el único que puede borrar del
  // bucket, igual que en /api/admin/upload.
  await deleteBimStorageFiles(createAdminClient(), [current]);

  const { error } = await access.supabase.from('bim_models').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `pnpm test app/api/admin/bim`
Esperado: PASS, todos los tests de ambos archivos.

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/bim
git commit -m "feat(bim): API de piezas BIM autorizada por proyecto, no por autor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Simplificar el borrado de proyecto — el cascade se lleva las piezas

**Files:**
- Modify: `app/api/admin/projects/[id]/route.ts`
- Modify: `app/api/admin/projects/[id]/route.test.ts`
- Modify: `components/admin/DeleteProjectModal.tsx`
- Delete: `app/api/admin/projects/[id]/bim-count/route.ts`
- Delete: `app/api/admin/projects/[id]/bim-count/route.test.ts`

**Interfaces:**
- Consumes: `deleteBimStorageFiles` (sin cambios de firma).
- Produces: `DELETE /api/admin/projects/[id]` siempre limpia el Storage de todas las piezas BIM del proyecto, sin query param, sin condicional. `DeleteProjectModal` vuelve a ser el componente simple de antes de la Fase 1 (sin estado ni fetch de BIM).

- [ ] **Step 1: Escribir el test simplificado**

Reemplazar en `app/api/admin/projects/[id]/route.test.ts` el `describe('DELETE /api/admin/projects/[id] — piezas BIM asociadas', ...)` completo (y su helper `req(id, deleteBim?)`) por esto — el resto del archivo (el primer describe, sin el sufijo "— piezas BIM asociadas") no cambia:

```ts
function req(id: string) {
  return new Request(`http://localhost/api/admin/projects/${id}`, { method: 'DELETE' });
}
```

(reemplaza a la función `req` de dos parámetros que había antes — usarla en todos los `it` del primer describe también, sacando el segundo argumento donde aparezca)

```ts
describe('DELETE /api/admin/projects/[id] — limpieza de piezas BIM', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteProjectStorageFiles).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos de Storage de TODAS las piezas del proyecto, sin preguntar', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const bimRows = [
      { id: 'bim-1', geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: ['https://x/1.png'] },
      { id: 'bim-2', geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
    ];
    // .from(): bim_models (lectura), leads, projects
    const admin = mockSupabase({ results: [{ data: bimRows }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledWith(admin, bimRows);
  });

  it('proyecto sin piezas BIM: no llama al borrado de archivos', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ data: [] }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test app/api/admin/projects/\[id\]/route.test.ts`
Esperado: FAIL — la ruta actual todavía filtra por `author_id` y espera el query param.

- [ ] **Step 3: Simplificar `app/api/admin/projects/[id]/route.ts`**

Reemplazar el cuerpo de `DELETE` desde `const admin = createAdminClient();` en adelante:

```ts
  const admin = createAdminClient();

  // Piezas BIM del proyecto: el cascade de la base (bim_models.project_id
  // on delete cascade, ver supabase/schema.sql) borra las FILAS solo al
  // borrar el proyecto — pero nunca los archivos de Storage que
  // apuntaban. Hay que juntarlos y borrarlos ANTES, con el cliente admin,
  // igual que ya hace deleteProjectStorageFiles con el resto del proyecto.
  const { data: bimRows } = await admin
    .from('bim_models')
    .select('id, geometry_url, properties_url, cover_image, source_url, gallery_images')
    .eq('project_id', id);

  if (bimRows && bimRows.length > 0) {
    await deleteBimStorageFiles(admin, bimRows);
  }

  await deleteProjectStorageFiles(admin, id);
  await admin.from('leads').delete().eq('project_id', id);

  const { error } = await admin.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
```

Y actualizar el comentario del bloque completo (arriba de la función `DELETE`), que hoy dice "El cascade de la base ... se lleva edificios/pisos/unidades..." — agregar `bim_models` a esa lista:

```ts
// Borra un proyecto entero. El cascade de la base (ver supabase/schema.sql)
// se lleva edificios/pisos/unidades, vistas aéreas, amenidades, ubicación,
// colaboradores, comentarios y piezas BIM solo. Dos cosas que el cascade
// NO resuelve:
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test app/api/admin/projects/\[id\]/route.test.ts`
Esperado: PASS, todos los tests del archivo.

- [ ] **Step 5: Borrar la ruta de conteo**

```bash
rm app/api/admin/projects/[id]/bim-count/route.ts
rm app/api/admin/projects/[id]/bim-count/route.test.ts
rmdir "app/api/admin/projects/[id]/bim-count" 2>/dev/null || true
```

- [ ] **Step 6: Simplificar `DeleteProjectModal.tsx`**

Reescribir el archivo completo — vuelve a ser el modal simple de antes de la Fase 1, sin ningún estado ni fetch de BIM:

```tsx
'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

interface DeleteProjectTarget {
  id: string;
  name: string;
}

// Confirmación reforzada para borrar un proyecto entero (a diferencia del
// resto de los borrados de la app, que usan el ConfirmProvider genérico
// con un solo click) — hay que escribir el nombre exacto, porque esto se
// lleva puesto TODO lo cargado (edificios, unidades, fotos, planos,
// tours, leads, piezas BIM) sin vuelta atrás. Se usa tanto desde "Mis
// proyectos" como desde "Configuración" del proyecto activo.
export default function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: DeleteProjectTarget | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  if (!project) return null;

  const handleConfirm = async () => {
    if (confirmText !== project.name) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) {
      toast('Proyecto eliminado.');
      setConfirmText('');
      onDeleted();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Error al eliminar el proyecto.', 'error');
    }
  };

  const handleClose = () => {
    if (deleting) return;
    setConfirmText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[300] p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-1.5">¿Eliminar &quot;{project.name}&quot;?</h3>
        <p className="text-sm text-gray-600">
          Se eliminará todo lo cargado en este proyecto — edificios, unidades, fotos, planos, tours, leads, piezas BIM. Esta acción no se puede deshacer.
        </p>
        <label className="block text-xs font-medium text-gray-500 mt-4 mb-1.5">
          Para confirmar, escribí el nombre exacto del proyecto:
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={project.name}
          autoFocus
          disabled={deleting}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-3 mt-5 justify-end">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={deleting} className="bg-transparent hover:bg-gray-100">
            Cancelar
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting || confirmText !== project.name}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2 transition-colors active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600"
          >
            {deleting ? 'Eliminando...' : 'Eliminar proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verificar tipos y correr toda la suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores de tipos en los archivos tocados por esta task (van a seguir apareciendo los de las tasks 6 en adelante — ver la lista de la Task 2 Step 8). La suite pasa salvo los archivos que las tasks siguientes todavía no tocaron.

- [ ] **Step 8: Commit**

```bash
git add app/api/admin/projects components/admin/DeleteProjectModal.tsx
git commit -m "feat(bim): borrar un proyecto se lleva sus piezas BIM sin preguntar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: El editor de BIM se muda a nivel proyecto

**Files:**
- Delete: `app/admin/(authenticated)/bim/page.tsx`
- Delete: `app/admin/(authenticated)/bim/BimAdminClient.tsx`
- Modify: `components/admin/BimModelEditor.tsx`
- Create: `components/admin/section-editors/BimEditor.tsx`
- Create: `app/admin/(authenticated)/(project)/proyecto/bim/page.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/admin/bim`, `PATCH`/`DELETE /api/admin/bim/[id]` (Task 4); `BimModelList` (sin cambios); `BimModelEditor` (esta task le saca el prop `projects`).
- Produces: `BimEditor` — componente sin props, autosuficiente, usado por esta task en `/admin/proyecto/bim` y por la Task 7 dentro del asistente guiado.

Esta task no lleva tests automáticos — son componentes de UI con estado y fetch, mismo criterio que ya se usó para `AmenitiesEditor`/`LocationEditor` y para la Task 4 de la Fase 1 de BIM. La verificación es manual, en el Step 5.

- [ ] **Step 1: Sacar el prop `projects` de `BimModelEditor`**

En `components/admin/BimModelEditor.tsx`:

Sacar del tipo de props: `projects: { id: string; name: string }[];`

Sacar del cuerpo del componente: `const [projectId, setProjectId] = useState(model.projectId ?? '');`

En `save()`, sacar `projectId: projectId || null,` del body del `fetch`.

Sacar del JSX todo este bloque:

```tsx
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
```

Y en `BimAdminClient.tsx` (que se borra en el Step 3) y en `BimEditor.tsx` (que se crea en el Step 2) dejar de pasarle `projects` a `<BimModelEditor>`.

- [ ] **Step 2: Crear `BimEditor`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import BimModelList from '@/components/admin/BimModelList';
import BimModelEditor from '@/components/admin/BimModelEditor';
import type { BimModel } from '@/types';

// Editor de BIM autosuficiente — resuelve el proyecto activo por su
// cuenta (la ruta de API lee la cookie, ver resolveRequestedProjectId),
// mismo patrón que AmenitiesEditor/LocationEditor. Se usa en dos lugares:
// el paso "Modelo BIM" del asistente guiado, y /admin/proyecto/bim para
// activarlo o seguir cargando después. Con cero piezas muestra la
// decisión explícita "¿querés mostrar un modelo BIM?" — con una o más,
// la lista + editor de siempre, sin volver a preguntar.
export default function BimEditor() {
  const [models, setModels] = useState<BimModel[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/bim')
      .then(res => (res.ok ? res.json() : { models: [] }))
      .then(data => {
        if (cancelled) return;
        setModels(data.models as BimModel[]);
        setSelectedId((data.models as BimModel[])[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, []);

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
    setModels(prev => [model, ...(prev ?? [])]);
    setSelectedId(model.id);
  };

  if (models === null) {
    return <LoadingSpinner text="Cargando..." />;
  }

  if (models.length === 0 && !skipped) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-base font-medium text-gray-900">¿Querés mostrar un modelo BIM de este proyecto?</p>
        <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
          Título, descripción e imágenes por ahora — más adelante, un modelo 3D navegable.
        </p>
        <div className="flex items-center justify-center gap-4 mt-5">
          <Button type="button" onClick={create} disabled={creating}>
            <Plus className="w-4 h-4" /> {creating ? 'Creando...' : 'Agregar modelo BIM'}
          </Button>
          <button type="button" onClick={() => setSkipped(true)} className="text-sm text-gray-400 hover:text-gray-600">
            Saltear — no tengo uno
          </button>
        </div>
      </div>
    );
  }

  if (models.length === 0 && skipped) {
    return (
      <p className="text-sm text-gray-500 px-1 py-6">
        Sin problema — podés agregarlo cuando quieras desde Proyecto → Modelo BIM.
      </p>
    );
  }

  const selected = models.find(m => m.id === selectedId) ?? null;

  return (
    <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
      <div className="flex flex-col gap-3">
        <Button type="button" onClick={create} disabled={creating} className="self-start">
          <Plus className="w-4 h-4" /> {creating ? 'Creando...' : 'Nueva pieza'}
        </Button>
        <BimModelList models={models} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        {selected ? (
          <BimModelEditor
            key={selected.id}
            model={selected}
            onSaved={updated => setModels(prev => (prev ?? []).map(m => (m.id === updated.id ? updated : m)))}
            onDeleted={id => {
              setModels(prev => (prev ?? []).filter(m => m.id !== id));
              setSelectedId(prev => (prev === id ? null : prev));
            }}
          />
        ) : (
          <p className="text-sm text-gray-500">Elegí una pieza de la lista o creá una nueva.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Borrar la pantalla vieja**

```bash
rm app/admin/\(authenticated\)/bim/page.tsx
rm app/admin/\(authenticated\)/bim/BimAdminClient.tsx
rmdir "app/admin/(authenticated)/bim" 2>/dev/null || true
```

- [ ] **Step 4: Crear la pantalla nueva**

```tsx
import BimEditor from '@/components/admin/section-editors/BimEditor';

export const metadata = { title: 'Modelo BIM' };

export default function AdminProjectBimPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Modelo BIM</h2>
        <p className="text-sm text-gray-500 mt-1">
          Mostrá tu trabajo con imágenes y, más adelante, un modelo 3D navegable de este proyecto.
        </p>
      </div>
      <BimEditor />
    </div>
  );
}
```

Guardarlo en `app/admin/(authenticated)/(project)/proyecto/bim/page.tsx` (crear el directorio `bim/` si no existe).

- [ ] **Step 5: Verificación manual**

Run: `pnpm dev`

Con un proyecto activo elegido en `/admin/proyectos`:
1. Entrar a `/admin/proyecto/bim` directo por URL: aparece "¿Querés mostrar un modelo BIM de este proyecto?".
2. "Agregar modelo BIM": crea la pieza, muestra la lista + el editor (sin ningún desplegable de "Proyecto asociado").
3. Cargar una imagen, guardar: pasa a "Publicada".
4. Recargar la página (`/admin/proyecto/bim`): la pieza sigue ahí, entra directo a la lista (no vuelve a preguntar).
5. "Nueva pieza": agrega una segunda sin volver a preguntar.
6. Eliminar las dos piezas una por una: al llegar a cero, vuelve a aparecer la pregunta inicial.
7. Elegir "Saltear — no tengo uno": muestra el mensaje de "sin problema, podés agregarlo después".

- [ ] **Step 6: Commit**

```bash
git add app/admin/\(authenticated\)/bim app/admin/\(authenticated\)/\(project\)/proyecto/bim components/admin/section-editors/BimEditor.tsx components/admin/BimModelEditor.tsx
git commit -m "feat(bim): el editor se muda de /admin/bim a /admin/proyecto/bim

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Paso "Modelo BIM" en el asistente guiado

**Files:**
- Modify: `app/admin/(authenticated)/(project)/wizard/page.tsx`

**Interfaces:**
- Consumes: `BimEditor` (Task 6), sin props.
- Produces: nada que otra task consuma — es el último punto de entrada.

Sin test automático — es el mismo tipo de pantalla de asistente que ya existe sin tests (`LocationEditor`/`AmenitiesEditor` dentro del wizard tampoco los tienen). Verificación manual en el Step 5.

- [ ] **Step 1: Importar `BimEditor`**

Agregar al bloque de imports de `app/admin/(authenticated)/(project)/wizard/page.tsx`, junto a `AmenitiesEditor`:

```ts
import BimEditor from '@/components/admin/section-editors/BimEditor';
```

- [ ] **Step 2: Sumar `'bim'` al tipo `ProjectStep` y a `PROJECT_STEPS`**

```ts
type ProjectStep = 'ubicacion' | 'amenities' | 'bim';
```

```ts
const PROJECT_STEPS: { id: ProjectStep; label: string }[] = [
  { id: 'ubicacion', label: 'Ubicación' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'bim', label: 'Modelo BIM' },
];
```

- [ ] **Step 3: Renderizar el paso y actualizar el copy**

En el bloque `if (screen === 'proyecto') { ... }`, cambiar el título y bajada:

```tsx
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Ya está la estructura — faltan estas cosas del proyecto</h2>
          <p className="text-sm text-gray-500 mt-1">
            Ubicación, Amenities y Modelo BIM no son de {agree.esta} {buildingLabelLower} en particular, sino de todo el proyecto — se cargan una sola vez, no en cada {buildingLabelLower}.
          </p>
        </div>
```

Y sumar el render del paso, junto a los otros dos:

```tsx
        <div>
          {projectStep === 'ubicacion' && <LocationEditor />}
          {projectStep === 'amenities' && <AmenitiesEditor />}
          {projectStep === 'bim' && <BimEditor />}
        </div>
```

- [ ] **Step 4: Sumar `'bim'` al `Step` de `casa` (flujo lineal)**

```ts
type Step = 'edificio' | 'piso' | 'unidades' | 'delimitacion' | 'ambientes' | 'ubicacion' | 'amenities' | 'bim';
```

En el bloque de `STEPS` de `casa` (la rama `else` final del `const STEPS = hasFloorStep ? [...] : hasUnitStep ? [...] : [...]`), agregar el quinto paso:

```ts
      [
        { id: 'unidades', label: 'Datos' },
        { id: 'ambientes', label: 'Ambientes y Tour' },
        { id: 'ubicacion', label: 'Ubicación' },
        { id: 'amenities', label: 'Amenities' },
        { id: 'bim', label: 'Modelo BIM' },
      ];
```

Y en el render principal del wizard (donde están los `{step === 'ubicacion' && <LocationEditor />}` y `{step === 'amenities' && <AmenitiesEditor />}` para el flujo de `casa` — buscar esas líneas exactas cerca de `{step === 'edificio' && (...)}`), agregar:

```tsx
        {step === 'bim' && <BimEditor />}
```

- [ ] **Step 5: Verificación manual**

Run: `pnpm dev`

1. Crear un proyecto **edificio** nuevo, completar el asistente hasta la pantalla "faltan estas cosas del proyecto": aparecen tres pasos (Ubicación, Amenities, Modelo BIM). Entrar al paso Modelo BIM: aparece la pregunta de siempre; elegir "Agregar", cargar una imagen. "Terminar →" lleva al resumen.
2. Crear un proyecto **casa** nuevo, completar Datos → Ambientes y Tour → Ubicación → Amenities → llega a un quinto paso "Modelo BIM" con la misma pregunta.
3. Confirmar en ambos casos que la pieza cargada en el asistente es la misma que después aparece en `/admin/proyecto/bim`.

- [ ] **Step 6: Commit**

```bash
git add app/admin/\(authenticated\)/\(project\)/wizard/page.tsx
git commit -m "feat(bim): paso 'Modelo BIM' en el asistente guiado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Entrada en el nav del proyecto

**Files:**
- Modify: `app/admin/(authenticated)/(project)/ProjectAdminShell.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otra task consuma.

Sin test automático — cambio puramente de navegación, mismo criterio que el resto de `projectSubItems`.

- [ ] **Step 1: Sumar la entrada**

En `ProjectAdminShell.tsx`, agregar `{ label: 'Modelo BIM', href: '/admin/proyecto/bim' }` al array `projectSubItems`, después de Recorrido 360°:

```ts
  const projectSubItems = [
    { label: structureItemLabel, href: singleBuildingHref ?? '/admin/edificios' },
    { label: 'Amenidades', href: '/admin/proyecto/amenities' },
    { label: 'Ubicación', href: '/admin/proyecto/ubicacion' },
    { label: 'Recorrido 360°', href: '/admin/proyecto/recorrido' },
    { label: 'Modelo BIM', href: '/admin/proyecto/bim' },
  ];
```

Y sumar `/admin/proyecto/bim` al chequeo `isProjectSection` que decide si el grupo "Proyecto" del menú aparece expandido — buscar la línea:

```ts
  const isProjectSection = pathname === '/admin/proyecto' || pathname.startsWith('/admin/proyecto/') || pathname.startsWith('/admin/edificios');
```

Esta línea YA cubre `/admin/proyecto/bim` porque usa `startsWith('/admin/proyecto/')` — no hace falta tocarla, solo confirmarlo al verificar a mano.

- [ ] **Step 2: Verificación manual**

Run: `pnpm dev`

Entrar a cualquier pantalla de proyecto, abrir el menú "Proyecto": aparece "Modelo BIM" en la lista, entre Recorrido 360° y el cierre del grupo. Click: navega a `/admin/proyecto/bim` y el grupo "Proyecto" queda expandido/resaltado.

- [ ] **Step 3: Commit**

```bash
git add app/admin/\(authenticated\)/\(project\)/ProjectAdminShell.tsx
git commit -m "feat(bim): entrada 'Modelo BIM' en el nav del proyecto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Sección de landing pública

**Files:**
- Modify: `lib/project-sections.ts`
- Modify: `lib/project-sections.test.ts`
- Modify: `components/project-landing/registry.ts`
- Create: `components/project-landing/BimSection.tsx`
- Modify: `data/project-repository.ts`
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: `getPublicBimModelsByProject` (Task 2, ya existía); `bimModelHref` (`@/lib/bim`, sin cambios); `SectionProps` (`@/components/project-landing/types`, sin cambios).
- Produces: `Project.bimModels: BimModel[]`; sección `bim` disponible en `SECTION_REGISTRY`/`SECTION_COMPONENTS`.

- [ ] **Step 1: Sumar `bimModels` al tipo `Project`**

En `types/index.ts`, en la interfaz `Project`, agregar después de `tourOrientationDegrees?: number;`:

```ts
  /** Piezas BIM públicas y listas de este proyecto — sección "bim" de la landing. */
  bimModels: BimModel[];
```

- [ ] **Step 2: Sumar `bim` a `SectionKey`, `SECTION_REGISTRY` y `sectionHint`**

Nota sobre el orden de esta task: el test del Step 4 verifica una AUSENCIA de comportamiento (`bim` nunca se marca vacía) — `vitest` transpila sin chequear tipos, así que ese test "pasaría" trivialmente incluso antes de que `bim` exista como `SectionKey` real (no hay ningún código que lo marque vacío en ningún escenario). El único chequeo que de verdad puede fallar antes de este paso es `tsc --noEmit`. Por eso acá el orden es implementación → test de regresión → verificación de tipos, en vez del RED/GREEN de siempre.

En `lib/project-sections.ts`:

```ts
export type SectionKey =
  | 'about'
  | 'before_after'
  | 'process'
  | 'team'
  | 'amenities'
  | 'masterplan'
  | 'bim'
  | 'typologies'
  | 'location'
  | 'calculator'
  | 'contact';
```

(se inserta después de `masterplan`, como decidió el spec)

```ts
export const SECTION_REGISTRY: SectionMeta[] = [
  { key: 'about', label: 'Sobre el proyecto' },
  { key: 'before_after', label: 'Antes / Después' },
  { key: 'process', label: 'Galería de proceso' },
  { key: 'team', label: 'Equipo' },
  { key: 'amenities', label: 'Amenidades' },
  { key: 'masterplan', label: 'Masterplan interactivo' },
  { key: 'bim', label: 'Modelo BIM' },
  { key: 'typologies', label: 'Tipologías / unidades' },
  { key: 'location', label: 'Ubicación' },
  { key: 'calculator', label: 'Calculadora' },
  { key: 'contact', label: 'Contacto' },
];
```

**No** agregar `bim` a `AVAILABILITY` (está disponible para todo tipo de proyecto, sin condición — el default `?? true` de `isSectionAvailable` ya cubre eso) ni a `UNAVAILABLE_REASON`.

En `sectionEditHref`, sumar el case:

```ts
    case 'bim':
      return '/admin/proyecto/bim';
```

En `sectionHint`, sumar al `Record<SectionKey, string>` (es exhaustivo — TypeScript va a exigir esta entrada):

```ts
    bim: 'Modelo BIM del proyecto — imágenes y, más adelante, un modelo 3D navegable.',
```

**No** agregar ningún chequeo de `bim` dentro de `computeEmptySectionKeys`. El comentario que ya está arriba de esa función (empieza con "Qué secciones DISPONIBLES no tienen nada para mostrar todavía...") se actualiza agregando una frase:

```ts
// Qué secciones DISPONIBLES no tienen nada para mostrar todavía — mismo
// criterio de contenido que usa cada componente de
// components/project-landing/ para devolver null. Lo usa /admin/sitio
// para marcar el estado "vacía" en la lista y en el resumen.
//
// 'masterplan' SÍ se marca vacío sin aerialSlides — antes se asumía que
// "siempre tiene fallback" y se dejaba afuera de este chequeo, pero el
// fallback real (components/aerial/AerialView.tsx) era una pantalla en
// blanco sin ningún aviso cuando no había ninguna vista aérea cargada.
//
// 'bim' queda AFUERA a propósito, igual que 'calculator'/'contact': es
// opcional (no todo proyecto necesita un modelo BIM), así que marcarla
// "vacía" generaría un aviso de "te falta esto" en cualquier proyecto que
// legítimamente decidió no cargar uno. El componente de la sección igual
// resuelve solo si tiene o no piezas para mostrar.
```

- [ ] **Step 3: Escribir el test de regresión para `computeEmptySectionKeys`**

Buscar en `lib/project-sections.test.ts` el describe de `computeEmptySectionKeys` y agregar:

```ts
it('NUNCA marca "bim" como vacía — mismo criterio que calculator/contact, es opcional y no debe generar un aviso falso', () => {
  const project = {
    description: '', beforeAfter: [], processGallery: [], collaborators: [],
    amenities: [], pointsOfInterest: [], units: [], aerialSlides: [],
  };
  expect(computeEmptySectionKeys(project).has('bim')).toBe(false);
});
```

(Usar el mismo objeto base `EmptyCheckProject` que ya arman los tests vecinos de ese describe — copiar su forma exacta si difiere de este ejemplo.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test lib/project-sections.test.ts`
Esperado: PASS — incluido el test nuevo.

- [ ] **Step 5: Verificar tipos**

Run: `pnpm exec tsc --noEmit`
Esperado: error en `components/project-landing/registry.ts` (`SECTION_COMPONENTS` es `Record<SectionKey, ...>` exhaustivo, le falta `bim`) y en `data/project-repository.ts` (el objeto `Project` devuelto por `getProjectBySlug` no tiene `bimModels`) — son los siguientes dos steps.

- [ ] **Step 6: Crear `BimSection`**

```tsx
import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { bimModelHref } from '@/lib/bim';
import type { SectionProps } from './types';

export default function BimSection({ project }: SectionProps) {
  if (project.bimModels.length === 0) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-7xl mx-auto px-4 md:px-6 mb-12">
        <div className="flex flex-col gap-2">
          <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-medium text-[var(--theme-text)]">
            MODELO BIM
          </h2>
          <p className="text-[var(--theme-text-muted)] font-light">
            Recorré el proyecto en detalle.
          </p>
        </div>
      </Reveal>

      <div className="max-w-7xl mx-auto px-4 md:px-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {project.bimModels.map((m, i) => (
          <Reveal key={m.id} delay={i * 0.05}>
            <Link
              href={bimModelHref(m.id)}
              className="group block rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-bg-alt)] border border-[var(--theme-text)]/10 hover:border-[var(--theme-text)]/30 transition-colors"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_18px,#dcd8d0_18px,#dcd8d0_36px)]">
                {m.coverImage && (
                  <Image
                    src={m.coverImage} alt={m.title} fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    placeholder="blur" blurDataURL={shimmerDataUrl()}
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
              </div>
              <div className="p-4">
                <p className="font-[family-name:var(--theme-font-heading)] text-[var(--theme-text)] font-medium truncate">
                  {m.title}
                </p>
                {m.description && (
                  <p className="text-sm text-[var(--theme-text-muted)] font-light line-clamp-2 mt-1">{m.description}</p>
                )}
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Registrar la sección**

En `components/project-landing/registry.ts`:

```ts
import BimSection from './BimSection';
```

```ts
export const SECTION_COMPONENTS: Record<SectionKey, ComponentType<SectionProps>> = {
  about: AboutSection,
  before_after: BeforeAfterSection,
  process: ProcessSection,
  team: TeamSection,
  amenities: AmenitiesSection,
  masterplan: MasterplanCtaSection,
  bim: BimSection,
  typologies: TypologiesSection,
  location: LocationSection,
  calculator: CalculatorSection,
  contact: ContactSection,
};
```

- [ ] **Step 8: Cargar `bimModels` en `getProjectBySlug`**

En `data/project-repository.ts`, sumar el import:

```ts
import { getPublicBimModelsByProject } from './bim-repository';
```

En el `Promise.all` que ya trae `buildingsResult`, `{ slides, hotspots }`, `amenities`, `pointsOfInterest`, `collaborators`, agregar una entrada más:

```ts
  const [buildingsResult, { slides, hotspots }, amenities, pointsOfInterest, collaborators, bimModels] = await Promise.all([
    supabase.from('buildings').select('*').eq('project_id', project.id),
    (async () => {
      /* ...sin cambios... */
    })(),
    supabase
      .from('amenities')
      /* ...sin cambios... */,
    supabase
      .from('points_of_interest')
      /* ...sin cambios... */,
    supabase
      .from('project_collaborators')
      /* ...sin cambios... */,
    getPublicBimModelsByProject(project.id),
  ]);
```

(Solo se agrega el elemento `bimModels` a la desestructuración y la llamada `getPublicBimModelsByProject(project.id)` como último elemento del array — las cinco promesas que ya estaban no cambian una coma.)

Y en el `return { ... }` final de la función, sumar `bimModels,` junto a `amenities,`/`pointsOfInterest,`.

- [ ] **Step 9: Verificar tipos y correr toda la suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores de tipos, toda la suite pasa salvo los archivos de las Tasks 10-11 (todavía sin tocar).

- [ ] **Step 10: Verificación manual**

Run: `pnpm dev`

1. Un proyecto **sin** piezas BIM: su landing pública no muestra ninguna sección BIM (ni un hueco vacío).
2. Cargar una pieza con imagen desde `/admin/proyecto/bim`, marcarla pública: la sección "MODELO BIM" aparece sola en la landing, sin tocar `/admin/sitio`.
3. En `/admin/sitio`, la sección "Modelo BIM" aparece en la lista de Secciones, se puede reordenar y apagar/prender — y **nunca** se marca con el badge de "vacía" aunque el proyecto no tenga ninguna pieza.
4. Click en la tarjeta de la sección: lleva a `/bim/[id]`.

- [ ] **Step 11: Commit**

```bash
git add lib/project-sections.ts lib/project-sections.test.ts components/project-landing/registry.ts components/project-landing/BimSection.tsx data/project-repository.ts types/index.ts
git commit -m "feat(bim): sección 'Modelo BIM' en la landing pública del proyecto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Sacar toda la superficie a nivel cuenta

**Files:**
- Modify: `components/app/AppShell.tsx`
- Modify: `app/(social)/portfolio/[handle]/page.tsx`
- Modify: `components/social/ProfileTabs.tsx`
- Modify: `data/profile-repository.ts`
- Delete: `components/social/BimGrid.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada — es la última pieza, limpieza pura.

Sin test automático nuevo — son eliminaciones de UI ya cubiertas (o no) por los tests existentes de esos archivos; si algún test de `ProfileTabs`/`profile-repository` referencia `bimModels`, se actualiza en el mismo paso.

- [ ] **Step 1: Sacar el ícono de nav y el ítem de menú de `AppShell.tsx`**

Borrar el bloque completo:

```tsx
            {loggedIn && (
              <Link
                href="/admin/bim"
                className={`hidden sm:inline-flex p-2 rounded-lg transition-colors ${isActive('/admin/bim') ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                title="Modelos BIM"
                aria-label="Modelos BIM"
              >
                <Box className="w-5 h-5" />
              </Link>
            )}
```

Y borrar el bloque completo:

```tsx
                      <Link href="/admin/bim" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors">
                        <Box className="w-4 h-4 text-trevo-dark/40" />
                        Modelos BIM
                      </Link>
```

Sacar `Box` del import de `lucide-react` en ese archivo si queda sin usar en ningún otro lado del archivo (confirmar con un `grep -n "Box" components/app/AppShell.tsx` antes de sacarlo — si aparece en otro lado, dejarlo).

- [ ] **Step 2: Sacar la card del portfolio en `page.tsx`**

Borrar el bloque completo (comentario incluido):

```tsx
              {/* Aparte del checklist de arriba, a propósito — BIM es una
                  feature opcional (no todo arquitecto modela en 3D), así
                  que no suma al % de "perfil completo": eso dejaría a
                  cualquiera que no la use permanentemente por debajo del
                  100%. Desaparece sola apenas hay al menos una pieza. */}
              {portfolio.bimModels.length === 0 && (
                <Link
                  href="/admin/bim"
                  className="flex items-center gap-[13px] bg-white rounded-[13px] border border-trevo-dark/10 py-[16px] px-[17px] hover:border-trevo-dark/25 transition-colors"
                >
                  <div className="w-[34px] h-[34px] rounded-full bg-[#5c7a58]/10 flex items-center justify-center shrink-0">
                    <Box className="w-4 h-4 text-[#5c7a58]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-trevo-dark">Subí tu primer modelo BIM</p>
                    <p className="text-[11.5px] leading-[1.5] text-trevo-dark/50 font-light mt-0.5">
                      Mostrá tu trabajo con imágenes y, más adelante, un modelo 3D navegable.
                    </p>
                  </div>
                </Link>
              )}
```

Sacar la línea `bimModels={portfolio.bimModels}` del `<ProfileTabs ... />`.

Sacar `Box` del import de `lucide-react` de este archivo si queda sin usar (mismo chequeo que en el Step 1).

- [ ] **Step 3: Sacar la pestaña BIM de `ProfileTabs.tsx`**

Sacar el import: `import BimGrid from '@/components/social/BimGrid';`

En el import de tipos, sacar `BimModel` de la lista.

Cambiar:

```ts
type TabKey = 'proyectos' | 'bim' | 'publicaciones' | 'trayectoria';
```

por:

```ts
type TabKey = 'proyectos' | 'publicaciones' | 'trayectoria';
```

Sacar `bimModels: BimModel[];` de `ProfileTabsProps`.

Sacar `bimModels,` de la desestructuración de props del componente.

Cambiar:

```ts
  const requestedTab: TabKey =
    paramTab === 'bim' || paramTab === 'publicaciones' || paramTab === 'trayectoria' ? paramTab : 'proyectos';
```

por:

```ts
  const requestedTab: TabKey =
    paramTab === 'publicaciones' || paramTab === 'trayectoria' ? paramTab : 'proyectos';
```

Sacar la línea `...(bimModels.length > 0 || isOwner ? [{ key: 'bim' as TabKey, label: 'BIM', count: String(bimModels.length) }] : []),` del array `tabs`.

Actualizar el comentario que la precede (que menciona "?tab=bim en un perfil sin piezas BIM públicas") a algo genérico:

```tsx
  // El tab pedido por la URL puede no existir de verdad (p.ej. ?tab=trayectoria
  // en un perfil sin experiencias cargadas) — en ese caso cae a 'proyectos'
  // en vez de renderizar un panel vacío sin tab activo.
```

Sacar la línea `{tab === 'bim' && <BimGrid models={bimModels} />}`.

- [ ] **Step 4: Sacar `bimModels` de `data/profile-repository.ts`**

Sacar `BimModel` del import de `@/types`.

Sacar `import { getPublicBimModelsByAuthor } from './bim-repository';`.

Sacar el comentario y campo `bimModels: BimModel[];` de la interfaz `Portfolio`.

Sacar la línea `const bimModels = await getPublicBimModelsByAuthor(row.id);` y su comentario.

Sacar `bimModels,` del objeto que devuelve `getPortfolioByHandle`.

- [ ] **Step 5: Borrar `BimGrid`**

```bash
rm components/social/BimGrid.tsx
```

- [ ] **Step 6: Verificar tipos y correr toda la suite completa**

Run: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores de tipos en ningún archivo del repo, toda la suite pasa. Este es el primer punto del plan donde el árbol entero vuelve a estar limpio — todas las referencias sueltas de la lista de la Task 2 Step 8 ya fueron resueltas por las Tasks 4, 6, y esta.

- [ ] **Step 7: Verificación manual**

Run: `pnpm dev`

1. La barra de navegación ya no tiene el ícono de caja.
2. El menú de "Mi cuenta" ya no tiene "Modelos BIM".
3. `/portfolio/[handle]` ya no tiene pestaña BIM ni la card "Subí tu primer modelo".
4. `/admin/bim` da 404 (la ruta ya no existe).
5. `/admin/proyecto/bim` sigue funcionando (Task 6).

- [ ] **Step 8: Commit**

```bash
git add components/app/AppShell.tsx app/\(social\)/portfolio components/social/ProfileTabs.tsx data/profile-repository.ts
git rm components/social/BimGrid.tsx
git commit -m "feat(bim): eliminar toda la superficie de BIM a nivel cuenta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Verificación final del plan

- [ ] `pnpm exec tsc --noEmit` — sin errores.
- [ ] `pnpm test` — toda la suite en verde.
- [ ] `pnpm lint` — sin errores nuevos (los 3 preexistentes de `components/admin/unit-groups/registry.test.ts`, no relacionados, siguen igual).
- [ ] `pnpm build` — compila.
- [ ] Correr el bloque de la Task 1 contra la base de producción de Supabase, si todavía no se hizo.
- [ ] Recorrido manual completo: crear un proyecto nuevo (edificio o casa), cargar un modelo BIM en el asistente, verificar que aparece en la landing y en `/bim/[id]`, borrar el proyecto y confirmar en el dashboard de Supabase que los archivos del bucket `bim-models` de esa pieza ya no están.

## Fuera de esta fase

Sin cambios respecto del spec — piezas B (tipo de proyecto "BIM"), C (ingesta real de IFC y visor 3D) y D (BIM colgando de piso/unidad/planta/ambiente), cada una con su propio brainstorming, spec y plan cuando llegue el momento.
