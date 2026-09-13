# Landings de proyecto — coherencia del recorrido (Fase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el theme del proyecto y una navegación global única estén
presentes en las seis sub-rutas del sitio público de un proyecto, y cerrar los
dos callejones sin salida del recorrido del comprador ("Ver similares" que
apunta a la misma unidad vendida, y la imposibilidad de volver al listado
filtrado).

**Architecture:** El trabajo se apoya en dos módulos de lógica pura nuevos en
`lib/` (serialización de filtros a URL, y criterio de unidades similares), que
son la única superficie testeable. Sobre eso, `app/proyecto/[slug]/layout.tsx`
pasa a ser el dueño del "chrome" (theme + `Navbar`) para que las sub-rutas lo
hereden, y cinco componentes de vista se ajustan para no duplicar esa
navegación y para propagar el contexto de "volver".

**Tech Stack:** Next.js 16 App Router (Server Components + `'use client'`),
React 19, Tailwind, vitest para los tests de `lib/`.

**Spec:** docs/superpowers/specs/2026-09-13-landing-coherencia-recorrido-design.md

## Global Constraints

- Esta fase **no** reemplaza ninguna clase de color hardcodeada
  (`trevo-*`/`gray-*`/`brand-*`) en las vistas del explorador. Mover el theme
  pone las variables en scope; usarlas es una fase posterior. Un diff de esta
  fase que cambie colores de esas vistas está fuera de alcance.
- **No agregar llamadas nuevas a `headers()` ni a `cookies()`** en
  `app/proyecto/[slug]/layout.tsx`. La Fase C va a atacar el render dinámico
  causado justamente por esas llamadas. `getPublicProjectBySlug` ya está
  memoizado con `cache()` (`data/project-repository.ts:208`), así que pedir el
  proyecto en el layout no agrega un query.
- No se toca el modo `saleMode: 'showcase'` ni `ContactSection`: que showcase no
  capture leads es intencional (`lib/project-types.ts:222-227`, `showLeads: false`).
- No se tocan `DuplicateFloorModal`/`ApplyTemplateModal` ni ninguna ruta de
  `app/api/**`.
- Ningún test de componente: el repo corre vitest con `include: ['**/*.test.ts']`
  (sólo `.ts`, sin `.tsx`). Los tests de este plan van únicamente en
  `lib/unit-filters-url.test.ts` y `lib/similar-units.test.ts`.
- Atribución de commits: terminar cada commit con
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` — copiar
  esta línea literal, sin importar el modelo real del implementador.

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/unit-filters-url.ts` (nuevo) | serializar/parsear el estado de filtros de la lista de unidades ↔ `URLSearchParams` | 1 |
| `lib/similar-units.ts` (nuevo) | criterio de "unidades similares disponibles" a una dada | 2 |
| `components/ui/Navbar.tsx` | nav global; deja de hardcodear la marca de la plataforma | 3 |
| `app/proyecto/[slug]/layout.tsx` | dueño del chrome: theme + fuentes + `Navbar` | 4 |
| `app/proyecto/[slug]/page.tsx` | pierde el chrome, conserva hero/secciones/footer | 4 |
| `components/units/UnitsListView.tsx` | saca su nav ad hoc (5), sincroniza filtros a URL (6), arregla "Ver similares" (8) | 5, 6, 8 |
| `components/amenities/AmenitiesView.tsx` | saca sus dos navs ad hoc | 5 |
| `components/location/LocationView.tsx` | saca su nav ad hoc; reetiqueta el control del mapa | 5 |
| `components/unit/UnitViewer.tsx` | acepta `backHref`; control de volver en mobile y escritorio | 7 |
| `components/unit/UnitViewerWrapper.tsx` | pasa `backHref` al viewer | 7 |
| `app/proyecto/[slug]/edificio/[buildingId]/unidad/[unitId]/page.tsx` | lee `volver` de searchParams y lo pasa | 7 |

---

## Task 1: `lib/unit-filters-url.ts` — filtros ↔ URL

**Files:**
- Create: `lib/unit-filters-url.ts`
- Test: `lib/unit-filters-url.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface UnitFilters {
    edificio: string;      // id de edificio, o 'all'
    tipo: string;          // UnitType, o 'all'
    estado: string;        // UnitStatus, o 'all'
    precioMax: number;     // 0 = sin tope
    m2Min: number;         // 0 = sin mínimo
    favs: boolean;
    feats: string[];
    orden: string;
  }
  export const DEFAULT_UNIT_FILTERS: UnitFilters;
  export function filtersToQuery(filters: UnitFilters): string;
  export function filtersFromQuery(params: URLSearchParams): UnitFilters;
  ```
  Consumido por las Tasks 6 y 8.

Nota de diseño: `filtersToQuery` omite todo valor que sea igual al default, para
que una lista sin filtrar no ensucie la URL. Devuelve el query string **sin** el
`?` inicial (cadena vacía si no hay nada que serializar), para que quien lo use
decida cómo concatenarlo.

- [ ] **Step 1: Escribir los tests, deben fallar**

Crear `lib/unit-filters-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  filtersToQuery,
  filtersFromQuery,
  DEFAULT_UNIT_FILTERS,
  type UnitFilters,
} from './unit-filters-url';

function make(overrides: Partial<UnitFilters> = {}): UnitFilters {
  return { ...DEFAULT_UNIT_FILTERS, ...overrides };
}

describe('filtersToQuery', () => {
  it('sin filtros activos devuelve cadena vacía', () => {
    expect(filtersToQuery(DEFAULT_UNIT_FILTERS)).toBe('');
  });

  it('omite los valores que son el default', () => {
    expect(filtersToQuery(make({ tipo: '2 dormitorios' }))).toBe('tipo=2+dormitorios');
  });

  it('serializa varios filtros a la vez', () => {
    const q = filtersToQuery(make({ edificio: 'b1', precioMax: 150000, favs: true }));
    const params = new URLSearchParams(q);
    expect(params.get('edificio')).toBe('b1');
    expect(params.get('precioMax')).toBe('150000');
    expect(params.get('favs')).toBe('1');
  });

  it('serializa feats como lista separada por comas', () => {
    const q = filtersToQuery(make({ feats: ['plano', 'tour'] }));
    expect(new URLSearchParams(q).get('feats')).toBe('plano,tour');
  });

  it('no serializa feats cuando la lista está vacía', () => {
    expect(filtersToQuery(make({ feats: [] }))).toBe('');
  });

  it('no serializa favs cuando es false', () => {
    expect(filtersToQuery(make({ favs: false }))).toBe('');
  });

  it('no serializa los numéricos cuando son 0', () => {
    expect(filtersToQuery(make({ precioMax: 0, m2Min: 0 }))).toBe('');
  });
});

describe('filtersFromQuery', () => {
  it('sin params devuelve los defaults', () => {
    expect(filtersFromQuery(new URLSearchParams(''))).toEqual(DEFAULT_UNIT_FILTERS);
  });

  it('parsea cada filtro a su tipo', () => {
    const f = filtersFromQuery(new URLSearchParams('edificio=b1&precioMax=150000&m2Min=60&favs=1&feats=plano,tour&orden=precio-asc'));
    expect(f.edificio).toBe('b1');
    expect(f.precioMax).toBe(150000);
    expect(f.m2Min).toBe(60);
    expect(f.favs).toBe(true);
    expect(f.feats).toEqual(['plano', 'tour']);
    expect(f.orden).toBe('precio-asc');
  });

  it('ignora numéricos no parseables y cae al default', () => {
    const f = filtersFromQuery(new URLSearchParams('precioMax=abc&m2Min='));
    expect(f.precioMax).toBe(0);
    expect(f.m2Min).toBe(0);
  });

  it('ida y vuelta preserva los filtros activos', () => {
    const original = make({ edificio: 'b2', tipo: '1 dormitorio', estado: 'available', precioMax: 90000, m2Min: 45, favs: true, feats: ['balcon'], orden: 'm2-desc' });
    expect(filtersFromQuery(new URLSearchParams(filtersToQuery(original)))).toEqual(original);
  });
});
```

- [ ] **Step 2: Correr los tests, confirmar que fallan**

Run: `npx vitest run lib/unit-filters-url.test.ts`
Expected: FAIL — `Cannot find module './unit-filters-url'`.

- [ ] **Step 3: Implementar `lib/unit-filters-url.ts`**

```ts
// Estado de filtros de la lista de unidades, serializado a query string para
// que un listado filtrado sea una dirección a la que se puede volver (y que
// se puede compartir). Sólo se serializa lo que cambia el conjunto de
// resultados — el estado puramente visual (vista grid/tabla, panel avanzado
// abierto, selección del comparador) se queda en memoria a propósito.
export interface UnitFilters {
  edificio: string;
  tipo: string;
  estado: string;
  precioMax: number;
  m2Min: number;
  favs: boolean;
  feats: string[];
  orden: string;
}

export const DEFAULT_UNIT_FILTERS: UnitFilters = {
  edificio: 'all',
  tipo: 'all',
  estado: 'all',
  precioMax: 0,
  m2Min: 0,
  favs: false,
  feats: [],
  orden: 'piso',
};

export function filtersToQuery(filters: UnitFilters): string {
  const params = new URLSearchParams();
  if (filters.edificio !== DEFAULT_UNIT_FILTERS.edificio) params.set('edificio', filters.edificio);
  if (filters.tipo !== DEFAULT_UNIT_FILTERS.tipo) params.set('tipo', filters.tipo);
  if (filters.estado !== DEFAULT_UNIT_FILTERS.estado) params.set('estado', filters.estado);
  if (filters.precioMax > 0) params.set('precioMax', String(filters.precioMax));
  if (filters.m2Min > 0) params.set('m2Min', String(filters.m2Min));
  if (filters.favs) params.set('favs', '1');
  if (filters.feats.length > 0) params.set('feats', filters.feats.join(','));
  if (filters.orden !== DEFAULT_UNIT_FILTERS.orden) params.set('orden', filters.orden);
  return params.toString();
}

export function filtersFromQuery(params: URLSearchParams): UnitFilters {
  const num = (key: string) => {
    const parsed = Number(params.get(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const feats = params.get('feats');
  return {
    edificio: params.get('edificio') || DEFAULT_UNIT_FILTERS.edificio,
    tipo: params.get('tipo') || DEFAULT_UNIT_FILTERS.tipo,
    estado: params.get('estado') || DEFAULT_UNIT_FILTERS.estado,
    precioMax: num('precioMax'),
    m2Min: num('m2Min'),
    favs: params.get('favs') === '1',
    feats: feats ? feats.split(',').filter(Boolean) : [],
    orden: params.get('orden') || DEFAULT_UNIT_FILTERS.orden,
  };
}
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

Run: `npx vitest run lib/unit-filters-url.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/unit-filters-url.ts lib/unit-filters-url.test.ts
git commit -m "$(cat <<'EOF'
feat(units): serializar los filtros de la lista de unidades a query string

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `lib/similar-units.ts` — criterio de unidades similares

**Files:**
- Create: `lib/similar-units.ts`
- Test: `lib/similar-units.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SimilarUnitsInput {
    buildingId: string;
    type: string;
    status: string;
  }
  export function findSimilarUnits<T extends SimilarUnitsInput & { id: string }>(
    unit: T,
    allUnits: T[],
  ): T[];
  ```
  Consumido por la Task 8.

Criterio, tal cual el spec: mismo `buildingId`, misma tipología (`type`), y
`status === 'available'`. La unidad de origen nunca se incluye a sí misma. Si no
hay ninguna, devuelve lista vacía — quien lo consuma decide qué hacer, pero
**nunca debe ofrecer "Ver similares" cuando la lista es vacía** (el spec: la
etiqueta no debe prometer algo que no existe).

- [ ] **Step 1: Escribir los tests, deben fallar**

Crear `lib/similar-units.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findSimilarUnits } from './similar-units';

interface TestUnit {
  id: string;
  buildingId: string;
  type: string;
  status: string;
}

const sold: TestUnit = { id: 'u1', buildingId: 'b1', type: '2 dormitorios', status: 'sold' };

describe('findSimilarUnits', () => {
  it('devuelve las disponibles del mismo edificio y tipología', () => {
    const all: TestUnit[] = [
      sold,
      { id: 'u2', buildingId: 'b1', type: '2 dormitorios', status: 'available' },
      { id: 'u3', buildingId: 'b1', type: '2 dormitorios', status: 'available' },
    ];
    expect(findSimilarUnits(sold, all).map(u => u.id)).toEqual(['u2', 'u3']);
  });

  it('nunca incluye la unidad de origen', () => {
    const available: TestUnit = { id: 'u1', buildingId: 'b1', type: '2 dormitorios', status: 'available' };
    expect(findSimilarUnits(available, [available]).map(u => u.id)).toEqual([]);
  });

  it('excluye otras tipologías', () => {
    const all: TestUnit[] = [sold, { id: 'u2', buildingId: 'b1', type: '1 dormitorio', status: 'available' }];
    expect(findSimilarUnits(sold, all)).toEqual([]);
  });

  it('excluye otros edificios', () => {
    const all: TestUnit[] = [sold, { id: 'u2', buildingId: 'b2', type: '2 dormitorios', status: 'available' }];
    expect(findSimilarUnits(sold, all)).toEqual([]);
  });

  it('excluye las que no están disponibles', () => {
    const all: TestUnit[] = [
      sold,
      { id: 'u2', buildingId: 'b1', type: '2 dormitorios', status: 'sold' },
      { id: 'u3', buildingId: 'b1', type: '2 dormitorios', status: 'reserved' },
    ];
    expect(findSimilarUnits(sold, all)).toEqual([]);
  });

  it('sin candidatas devuelve lista vacía', () => {
    expect(findSimilarUnits(sold, [sold])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr los tests, confirmar que fallan**

Run: `npx vitest run lib/similar-units.test.ts`
Expected: FAIL — `Cannot find module './similar-units'`.

- [ ] **Step 3: Implementar `lib/similar-units.ts`**

```ts
// Unidades comparables a una dada, para ofrecer una salida real cuando el
// comprador llega a una unidad vendida. Criterio deliberadamente simple —
// mismo edificio, misma tipología, disponible — usando sólo campos que Unit
// ya tiene: no hace falta infraestructura de datos nueva.
export interface SimilarUnitsInput {
  buildingId: string;
  type: string;
  status: string;
}

export function findSimilarUnits<T extends SimilarUnitsInput & { id: string }>(
  unit: T,
  allUnits: T[],
): T[] {
  return allUnits.filter(
    candidate =>
      candidate.id !== unit.id &&
      candidate.buildingId === unit.buildingId &&
      candidate.type === unit.type &&
      candidate.status === 'available',
  );
}
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

Run: `npx vitest run lib/similar-units.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/similar-units.ts lib/similar-units.test.ts
git commit -m "$(cat <<'EOF'
feat(units): agregar criterio de unidades similares disponibles

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `Navbar` muestra el nombre del proyecto

**Files:**
- Modify: `components/ui/Navbar.tsx:8-15` (firma), `:39-46` (la marca)

**Interfaces:**
- Produces: `Navbar` gana una prop **requerida** `projectName: string`.
  Consumido por la Task 4, que es quien lo monta.

Hoy el nav muestra un badge "360" y el texto "InteractiveRE" hardcodeados,
mientras el footer de la misma página muestra `project.name.toUpperCase()`
(`app/proyecto/[slug]/page.tsx:132`). Esta tarea alinea el nav con el footer.

- [ ] **Step 1: Agregar la prop a la firma**

En `components/ui/Navbar.tsx`, reemplazar la firma actual:

```tsx
export default function Navbar({ showCalculator, hasTour, singleUnit, unitsLabel: unitsLabelProp }: {
  showCalculator: boolean;
  hasTour: boolean;
  /** Tipo "casa": una sola unidad — el link va directo a ella y se llama como la casa. */
  singleUnit?: { buildingId: string; unitId: string; label: string };
  /** Plural de unitLabel del tipo de proyecto (ej. "Lotes", "Unidades") — para el link cuando no hay singleUnit. */
  unitsLabel?: string;
}) {
```

por:

```tsx
export default function Navbar({ projectName, showCalculator, hasTour, singleUnit, unitsLabel: unitsLabelProp }: {
  /** Nombre del proyecto — este sitio es white-label, el nav lleva la marca del proyecto, no la de la plataforma. */
  projectName: string;
  showCalculator: boolean;
  hasTour: boolean;
  /** Tipo "casa": una sola unidad — el link va directo a ella y se llama como la casa. */
  singleUnit?: { buildingId: string; unitId: string; label: string };
  /** Plural de unitLabel del tipo de proyecto (ej. "Lotes", "Unidades") — para el link cuando no hay singleUnit. */
  unitsLabel?: string;
}) {
```

- [ ] **Step 2: Reemplazar la marca hardcodeada**

Reemplazar el bloque del logo (`:39-46`):

```tsx
          <Link href={projectHref} className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-[var(--theme-accent)] flex items-center justify-center text-[var(--theme-text-on-dark)] font-bold text-sm transition-transform group-hover:scale-110">
              360
            </div>
            <span className="font-[family-name:var(--theme-font-heading)] text-lg font-semibold tracking-tight text-[var(--theme-text-on-dark)]/90">
              InteractiveRE
            </span>
          </Link>
```

por:

```tsx
          <Link href={projectHref} className="flex items-center gap-3 group">
            <span className="font-[family-name:var(--theme-font-heading)] text-lg font-semibold tracking-tight text-[var(--theme-text-on-dark)]/90 truncate max-w-[40vw] md:max-w-[280px]">
              {projectName}
            </span>
          </Link>
```

El `truncate` con `max-w` es necesario: los nombres de proyecto son libres y uno
largo empujaría los links de navegación fuera de la barra.

- [ ] **Step 3: Verificar que el único consumidor rompe (es lo esperado)**

Run: `npx tsc --noEmit`
Expected: FAIL con un error en `app/proyecto/[slug]/page.tsx` (donde hoy se
monta `<Navbar>` sin `projectName`). Ese error lo resuelve la Task 4, que mueve
ese montaje al layout. Es la única referencia: confirmalo con
`grep -rn "<Navbar" --include="*.tsx" app components`.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Navbar.tsx
git commit -m "$(cat <<'EOF'
feat(nav): el nav del sitio público lleva el nombre del proyecto

El sitio es white-label: mostrar la marca de la plataforma en el nav
contradecía al footer de la misma página, que ya usa el nombre del
proyecto.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: theme y `Navbar` al layout

**Files:**
- Modify: `app/proyecto/[slug]/layout.tsx` (archivo completo, 21 líneas)
- Modify: `app/proyecto/[slug]/page.tsx:1-15` (imports), `:31-69` (pierde theme y Navbar), `:141` (cierre)

**Interfaces:**
- Consumes: `Navbar` con su prop `projectName` (Task 3).

Este es el cambio estructural del plan: hoy el theme y el `Navbar` los monta
`page.tsx`, y las seis sub-rutas son **hermanas** de esa página, no hijas — por
eso no heredan nada. Moviendo el envoltorio al layout, las heredan todas sin
tocarlas.

- [ ] **Step 1: Reescribir `app/proyecto/[slug]/layout.tsx`**

Reemplazar el contenido completo del archivo:

```tsx
import { notFound } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { getProjectBasePath } from '@/lib/project-base-path';
import { ProjectBasePathProvider } from '@/lib/project-base-path-context';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveTheme } from '@/lib/resolve-theme';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

// Dueño del "chrome" del sitio público de un proyecto: el theme (variables
// CSS + fuentes) y la navegación global. Vive acá y no en page.tsx porque
// las sub-rutas (/unidades, /amenities, /ubicacion, /masterplan, /recorrido,
// /edificio/[buildingId]) son HERMANAS de page.tsx, no hijas — montado en la
// página, el theme no llegaba a ninguna de ellas y el explorador quedaba sin
// la identidad visual que la desarrolladora personalizó.
//
// El fetch del proyecto no agrega un query: getPublicProjectBySlug está
// memoizado con cache() de React, así que esta llamada y la que hace cada
// página en la misma request se deduplican.
export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const [basePath, project] = await Promise.all([
    getProjectBasePath(slug),
    getPublicProjectBySlug(slug),
  ]);
  if (!project) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  const theme = resolveTheme(project.themeConfig);

  return (
    <ProjectBasePathProvider basePath={basePath}>
      <div
        className={`${ALL_FONT_CLASSNAMES} theme-bg-image theme-bg-image--fixed bg-[var(--theme-bg)] min-h-screen`}
        style={{ ...theme.cssVars, fontFamily: 'var(--theme-font-body)' } as React.CSSProperties}
      >
        {theme.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: theme.fontFaceCss }} />}
        <Navbar
          projectName={project.name}
          showCalculator={typeConfig.showCalculator}
          hasTour={!!project.commonAreasTour}
          singleUnit={!typeConfig.hasUnitStep && project.units[0]
            ? { buildingId: project.units[0].buildingId, unitId: project.units[0].id, label: typeConfig.unitLabel }
            : undefined}
          unitsLabel={`${typeConfig.unitLabel}s`}
        />
        {/* El Navbar es fixed h-16: este padding es el único lugar donde se
            compensa su alto, para las seis sub-rutas a la vez. La landing lo
            neutraliza con un margen negativo (ver page.tsx) porque su hero es
            a pantalla completa y va por debajo del nav a propósito. */}
        <div className="pt-16">{children}</div>
      </div>
    </ProjectBasePathProvider>
  );
}
```

- [ ] **Step 2: Sacar el theme y el `Navbar` de `page.tsx`**

En `app/proyecto/[slug]/page.tsx`, borrar estos imports que ya no se usan
(quedan en el layout):

```tsx
import Navbar from '@/components/ui/Navbar';
import { resolveTheme } from '@/lib/resolve-theme';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';
```

Borrar también la línea que resuelve el theme (`:39`):

```tsx
  const theme = resolveTheme(project.themeConfig);
```

Reemplazar el `<div>` de apertura, el `<style>` y el `<Navbar>` (`:56-69`):

```tsx
  return (
    <div
      className={`${ALL_FONT_CLASSNAMES} theme-bg-image theme-bg-image--fixed bg-[var(--theme-bg)] min-h-screen`}
      style={{ ...theme.cssVars, fontFamily: 'var(--theme-font-body)' } as React.CSSProperties}
    >
      {theme.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: theme.fontFaceCss }} />}
      <Navbar
        showCalculator={typeConfig.showCalculator}
        hasTour={!!project.commonAreasTour}
        singleUnit={!typeConfig.hasUnitStep && project.units[0]
          ? { buildingId: project.units[0].buildingId, unitId: project.units[0].id, label: typeConfig.unitLabel }
          : undefined}
        unitsLabel={`${typeConfig.unitLabel}s`}
      />

      {/* Hero Section */}
```

por:

```tsx
  return (
    // -mt-16 anula el pt-16 que el layout aplica para despejar el Navbar
    // fixed: acá el hero es a pantalla completa y tiene que pasar POR DEBAJO
    // del nav, que es translúcido a propósito.
    <div className="-mt-16">
      {/* Hero Section */}
```

Y el `</div>` de cierre del componente (`:141`) se mantiene tal cual: sigue
cerrando este mismo `<div>`.

- [ ] **Step 3: Verificar que compila y que el hero no perdió su compensación**

Run: `npx tsc --noEmit && npx eslint "app/proyecto/[slug]/layout.tsx" "app/proyecto/[slug]/page.tsx"`
Expected: 0 errores de tsc (el error que la Task 3 dejó abierto queda resuelto
acá), 0 warnings nuevos de eslint.

Confirmá además con `grep -n "mt-16" "app/proyecto/[slug]/page.tsx"` que el hero
conserva su `mt-16` original en el bloque de contenido (`:87`) — ese margen es
para separar el texto del nav y NO es el que esta tarea cambia; el que se agrega
es el `-mt-16` del contenedor.

- [ ] **Step 4: Commit**

```bash
git add "app/proyecto/[slug]/layout.tsx" "app/proyecto/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
refactor(proyecto): mover theme y Navbar al layout del sitio del proyecto

Las sub-rutas del explorador son hermanas de page.tsx, no hijas, así que
nunca heredaban el theme ni la navegación global. Moviendo el chrome al
layout, las seis lo heredan sin tocarlas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: reconciliar las navegaciones ad hoc

**Files:**
- Modify: `components/units/UnitsListView.tsx:243-270`
- Modify: `components/amenities/AmenitiesView.tsx:97-101` y `:112-124`
- Modify: `components/location/LocationView.tsx:147-158` y `:219-226`

**Interfaces:**
- Consumes: el `Navbar` global que la Task 4 dejó montado en el layout.

Con el nav global presente, las filas de navegación propias de cada vista pasan
a ser una segunda navegación redundante y contradictoria entre sí. **Las barras
sticky de filtros y controles NO se tocan** — son controles de la vista, no
navegación.

- [ ] **Step 1: `UnitsListView` — sacar la nav, conservar "Contactar"**

En `components/units/UnitsListView.tsx`, reemplazar el bloque `:243-270`:

```tsx
          <div className="flex items-center justify-between gap-[16px] flex-wrap">
            <Link
              href={basePath || '/'}
              className="flex items-center gap-[8px] font-medium text-[11px] leading-none tracking-[.16em] text-white/[.62] hover:text-white transition-colors"
            >
              ← {project.name.toUpperCase()}
            </Link>
            <div className="flex gap-[8px]">
              <Link
                href={`${basePath}/masterplan`}
                className="h-[34px] px-[14px] flex items-center gap-[7px] border border-white/[.28] rounded-full text-[11.5px] font-medium text-white"
              >
                Masterplan
              </Link>
              <Link
                href={`${basePath}/amenities`}
                className="h-[34px] px-[14px] flex items-center gap-[7px] border border-white/[.28] rounded-full text-[11.5px] font-medium text-white"
              >
                Amenities
              </Link>
              <button
                onClick={() => openLead()}
                className="h-[34px] px-[14px] flex items-center gap-[7px] bg-white rounded-full text-[11.5px] font-semibold text-trevo-dark"
              >
                Contactar
              </button>
            </div>
          </div>
```

por:

```tsx
          <div className="flex items-center justify-end">
            {/* Masterplan y Amenities salieron de acá: el Navbar global del
                layout ya los ofrece. "Contactar" se queda porque el nav no
                tiene ninguna acción de contacto — su CTA va al masterplan. */}
            <button
              onClick={() => openLead()}
              className="h-[34px] px-[14px] flex items-center gap-[7px] bg-white rounded-full text-[11.5px] font-semibold text-trevo-dark"
            >
              Contactar
            </button>
          </div>
```

- [ ] **Step 2: `AmenitiesView` — sacar las dos navs**

En `components/amenities/AmenitiesView.tsx`, en el estado vacío, reemplazar el
bloque `:96-103`:

```tsx
      <div className="min-h-screen bg-trevo-dark">
        <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">
          <Link href={basePath || '/'} className="text-[11px] font-medium tracking-[.16em] text-white/[.55] hover:text-white transition-colors">
            ← {project.name.toUpperCase()}
          </Link>
        </div>
        <div className="text-center py-20 text-white/40 font-light">Todavía no hay amenidades cargadas.</div>
      </div>
```

por:

```tsx
      <div className="min-h-screen bg-trevo-dark">
        <div className="text-center py-20 text-white/40 font-light">Todavía no hay amenidades cargadas.</div>
      </div>
```

Y en el hero, borrar el bloque completo `:112-124` (el `<div className="flex items-center justify-between gap-[16px] flex-wrap">` con su link `←` y los dos
pills de sección, hasta su `</div>` de cierre inclusive). Queda entonces:

```tsx
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="max-w-[1240px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">

        <div className="flex items-end justify-between gap-[34px] flex-wrap mt-[26px]">
```

Nota: el `mt-[26px]` de ese bloque siguiente existía para separarlo de la fila de
navegación que ahora se borra. Dejalo igual — el `pt-[26px]` del contenedor y el
espacio del nav global alcanzan; ajustarlo "a ojo" sin navegador sería adivinar.

Verificá al terminar con
`grep -n "← {project.name" components/amenities/AmenitiesView.tsx` que no queda
ninguna ocurrencia.

- [ ] **Step 3: `LocationView` — sacar la nav**

En `components/location/LocationView.tsx`, borrar el bloque completo `:147-159`:

```tsx
        <div className="flex items-center justify-between gap-[16px] flex-wrap">
          <Link href={basePath || '/'} className="text-[11px] font-medium tracking-[.16em] text-white/[.55] hover:text-white transition-colors">
            ← {project.name.toUpperCase()}
          </Link>
          <div className="flex gap-[8px]">
            <Link href={`${basePath}/unidades`} className="h-[34px] px-[14px] flex items-center border border-white/20 rounded-full text-[11.5px] font-medium text-white">
              {pluralize(typeConfig.unitLabel)}
            </Link>
            <Link href={`${basePath}/amenities`} className="h-[34px] px-[14px] flex items-center border border-white/20 rounded-full text-[11.5px] font-medium text-white">
              Amenities
            </Link>
          </div>
        </div>
```

Queda entonces:

```tsx
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="max-w-[1300px] mx-auto px-[16px] sm:px-[28px] pt-[26px]">

        <div className="flex items-end justify-between gap-[30px] flex-wrap mt-[24px]">
```

Verificá con `grep -n "← {project.name" components/location/LocationView.tsx`
que no queda ninguna ocurrencia.

- [ ] **Step 4: `LocationView` — reetiquetar el control del mapa**

El botón de `:219-226` **no es navegación**: llama `setSelectedId(null)`, que
deselecciona el punto de interés activo. Con un nav global que ahora sí ofrece
"Inicio", su etiqueta actual promete algo que no hace. Reemplazar:

```tsx
                    Volver al proyecto ×
```

por:

```tsx
                    Quitar selección ×
```

- [ ] **Step 5: Verificar que compila sin imports huérfanos**

Run: `npx tsc --noEmit && npx eslint components/units/UnitsListView.tsx components/amenities/AmenitiesView.tsx components/location/LocationView.tsx`
Expected: 0 errores, 0 warnings nuevos.

Si `Link` o `pluralize` quedaron sin uso en `AmenitiesView`/`LocationView` tras
borrar los pills, eslint lo va a marcar — borrá esos imports. **No borres
`Link` sin confirmar primero con grep que no se usa en otra parte del archivo**:
estas vistas tienen links de contenido además de los de navegación.

- [ ] **Step 6: Commit**

```bash
git add components/units/UnitsListView.tsx components/amenities/AmenitiesView.tsx components/location/LocationView.tsx
git commit -m "$(cat <<'EOF'
refactor(proyecto): sacar las navegaciones ad hoc de las vistas del explorador

El Navbar global del layout las cubre. Se conserva "Contactar" en la lista
de unidades porque el nav no tiene acción de contacto, y se reetiqueta el
control del mapa de ubicación, que deselecciona un punto y no navega.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: sincronizar los filtros de la lista con la URL

**Files:**
- Modify: `components/units/UnitsListView.tsx:68-84` (estado inicial), y agregar un efecto de sincronización
- Modify: `app/proyecto/[slug]/unidades/page.tsx:7-9,23-31`

**Interfaces:**
- Consumes: `filtersFromQuery`, `filtersToQuery`, `DEFAULT_UNIT_FILTERS`,
  `type UnitFilters` de `@/lib/unit-filters-url` (Task 1).
- Produces: la URL de `/unidades` pasa a reflejar los filtros activos. La
  Task 7 construye el `backHref` a partir de esa misma URL.

Hoy sólo el filtro de edificio llega por query param
(`initialBuildingFilter`, `unidades/page.tsx:8,26`); el resto del estado vive
sólo en memoria, así que un listado filtrado no es una dirección a la que se
pueda volver.

- [ ] **Step 1: Ampliar los searchParams de la página**

En `app/proyecto/[slug]/unidades/page.tsx`, reemplazar la interfaz de props y
el render:

```tsx
interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edificio?: string }>;
}
```

por:

```tsx
interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
```

y reemplazar el cuerpo del componente:

```tsx
export default async function UnidadesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { edificio } = await searchParams;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <UnitsListView project={project} initialBuildingFilter={edificio} typeConfig={typeConfig} />;
}
```

por:

```tsx
export default async function UnidadesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  // Los filtros llegan por query string para que un listado filtrado sea una
  // dirección a la que se puede volver desde la ficha de una unidad (y que se
  // puede compartir). La vista los sincroniza de vuelta a la URL — ver
  // UnitsListView.
  const initialQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      typeof v === 'string' ? [[k, v] as [string, string]] : [],
    ),
  ).toString();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <UnitsListView project={project} initialQuery={initialQuery} typeConfig={typeConfig} />;
}
```

- [ ] **Step 2: Inicializar el estado de `UnitsListView` desde la URL**

En `components/units/UnitsListView.tsx`, agregar el import:

```tsx
import { filtersFromQuery, filtersToQuery, type UnitFilters } from '@/lib/unit-filters-url';
```

Reemplazar en la firma del componente la prop `initialBuildingFilter?: string`
por `initialQuery?: string`, y reemplazar el bloque de estado `:68-81`:

```tsx
  const [buildingFilter, setBuildingFilter] = useState<string>(
    initialBuildingFilter && project.buildings.some(b => b.id === initialBuildingFilter)
      ? initialBuildingFilter
      : 'all'
  );
  const [typeFilter, setTypeFilter] = useState<UnitType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const [selectedFeats, setSelectedFeats] = useState<FeatKey[]>([]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [minArea, setMinArea] = useState(0);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [orden, setOrden] = useState<Orden>('piso');
  const [vista, setVista] = useState<Vista>('grid');
```

por:

```tsx
  const initialFilters = useMemo(() => {
    const parsed = filtersFromQuery(new URLSearchParams(initialQuery ?? ''));
    // Un id de edificio que no existe en este proyecto (link viejo, proyecto
    // editado) se descarta en vez de dejar la lista vacía sin explicación.
    return project.buildings.some(b => b.id === parsed.edificio)
      ? parsed
      : { ...parsed, edificio: 'all' };
  }, [initialQuery, project.buildings]);

  const [buildingFilter, setBuildingFilter] = useState<string>(initialFilters.edificio);
  const [typeFilter, setTypeFilter] = useState<UnitType | 'all'>(initialFilters.tipo as UnitType | 'all');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>(initialFilters.estado as UnitStatus | 'all');
  const [selectedFeats, setSelectedFeats] = useState<FeatKey[]>(initialFilters.feats as FeatKey[]);
  const [maxPrice, setMaxPrice] = useState(initialFilters.precioMax);
  const [minArea, setMinArea] = useState(initialFilters.m2Min);
  const [onlyFavs, setOnlyFavs] = useState(initialFilters.favs);
  const [advOpen, setAdvOpen] = useState(false);
  const [orden, setOrden] = useState<Orden>(initialFilters.orden as Orden);
  const [vista, setVista] = useState<Vista>('grid');
```

- [ ] **Step 3: Sincronizar el estado de vuelta a la URL**

Agregar, después del bloque de estado, este `useMemo` + `useEffect`:

```tsx
  // El estado de filtros se refleja en la URL con history.replaceState y NO
  // con el router de Next: replaceState no dispara navegación ni re-render
  // del Server Component, que es justo lo que queremos — la lista ya tiene
  // todos los datos en memoria y volver a pedirlos al servidor en cada tecla
  // del slider de precio sería absurdo. Tampoco ensucia el historial, así que
  // el botón "atrás" sigue saliendo de la lista en vez de deshacer filtros
  // uno por uno.
  const currentFilters: UnitFilters = useMemo(() => ({
    edificio: buildingFilter,
    tipo: typeFilter,
    estado: statusFilter,
    precioMax: maxPrice,
    m2Min: minArea,
    favs: onlyFavs,
    feats: selectedFeats,
    orden,
  }), [buildingFilter, typeFilter, statusFilter, maxPrice, minArea, onlyFavs, selectedFeats, orden]);

  const filtersQuery = filtersToQuery(currentFilters);

  useEffect(() => {
    const url = filtersQuery
      ? `${window.location.pathname}?${filtersQuery}`
      : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filtersQuery]);
```

Asegurate de que `useEffect` y `useMemo` estén en el import de React del
archivo (ya importa `useMemo`; agregá `useEffect` si falta).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npx eslint components/units/UnitsListView.tsx "app/proyecto/[slug]/unidades/page.tsx"`
Expected: 0 errores de tsc, todos los tests en verde (esta tarea no agrega
tests propios; los de `lib/unit-filters-url.test.ts` de la Task 1 ya cubren la
serialización), 0 warnings nuevos de eslint.

Confirmá con `grep -n "initialBuildingFilter" components/units/UnitsListView.tsx "app/proyecto/[slug]/unidades/page.tsx"`
que no queda ninguna referencia a la prop vieja.

- [ ] **Step 5: Commit**

```bash
git add components/units/UnitsListView.tsx "app/proyecto/[slug]/unidades/page.tsx"
git commit -m "$(cat <<'EOF'
feat(units): reflejar los filtros de la lista en la URL

Un listado filtrado pasa a ser una dirección a la que se puede volver
desde la ficha de una unidad, y que se puede compartir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: "Volver a resultados" en la ficha de unidad

**Files:**
- Modify: `components/unit/UnitViewerWrapper.tsx:9-24` (props)
- Modify: `components/unit/UnitViewer.tsx` (firma; barra mobile `:632-645`; barra de escritorio `:676`)
- Modify: `app/proyecto/[slug]/edificio/[buildingId]/unidad/[unitId]/page.tsx:10-13,32-62`
- Modify: `components/units/UnitsListView.tsx` (los `href` de las tarjetas y filas pasan a llevar el `volver`)

**Interfaces:**
- Consumes: `filtersQuery` de la Task 6 (el query string de filtros activos).
- Produces: `UnitViewer`/`UnitViewerWrapper` ganan `backHref?: string`.

Hoy `UnitViewer` tiene un único control de retroceso (`:632-637`) y su
contenedor es `md:hidden`: **en escritorio no hay ninguno**. Lo que parece el
equivalente de escritorio (`:712-717`, "Cambiar planta") es una acción de cambio
de piso, no un retroceso — no se reutiliza ni se le cambia el significado.

- [ ] **Step 1: Pasar el filtro activo en los links a la unidad**

En `components/units/UnitsListView.tsx`, las tarjetas y las filas arman su
`href` a la unidad. Buscá las dos definiciones con
`grep -n "const href = \`\${basePath}/edificio" components/units/UnitsListView.tsx`
y hacé que ambas incluyan el query de filtros como parámetro `volver`:

```tsx
  const href = `${basePath}/edificio/${unit.buildingId}/unidad/${unit.id}`;
```

pasa a recibir el query por prop desde el componente padre (las tarjetas y filas
son subcomponentes: `UnitCard` y `UnitRow`). Agregá a ambos una prop
`filtersQuery: string` y construí:

```tsx
  const href = `${basePath}/edificio/${unit.buildingId}/unidad/${unit.id}`
    + (filtersQuery ? `?volver=${encodeURIComponent(filtersQuery)}` : '');
```

En los puntos donde se renderizan `<UnitCard ... />` y `<UnitRow ... />`,
pasales `filtersQuery={filtersQuery}` (la variable que definió la Task 6).

- [ ] **Step 2: Leer `volver` en la página de la unidad**

En `app/proyecto/[slug]/edificio/[buildingId]/unidad/[unitId]/page.tsx`,
reemplazar la interfaz de props:

```tsx
  searchParams: Promise<{ tab?: string }>;
```

por:

```tsx
  searchParams: Promise<{ tab?: string; volver?: string }>;
```

reemplazar la desestructuración:

```tsx
  const { tab } = await searchParams;
```

por:

```tsx
  const { tab, volver } = await searchParams;
```

y agregar, junto al resto de las props de `<UnitViewerWrapper>`:

```tsx
      backHref={volver ? `${basePath}/unidades?${volver}` : undefined}
```

Para eso hace falta `basePath` en esta página, que hoy no lo calcula. Agregá el
import y la llamada:

```tsx
import { getProjectBasePath } from '@/lib/project-base-path';
```

```tsx
  const basePath = await getProjectBasePath(slug);
```

(Esta llamada a `getProjectBasePath` es en una **página**, no en el layout — la
restricción de Global Constraints es sobre no agregar `headers()` nuevos *al
layout*, que ya lo llama una vez. Esta página es dinámica igual.)

- [ ] **Step 3: Propagar la prop por el wrapper**

En `components/unit/UnitViewerWrapper.tsx`, agregar a `UnitViewerWrapperProps`:

```tsx
  /** Listado filtrado del que vino el usuario, para poder volver a él. Ausente si llegó por un link directo. */
  backHref?: string;
```

El componente ya hace `<UnitViewer {...props} />`, así que no hay que tocar el
cuerpo.

- [ ] **Step 4: Usar `backHref` en la barra mobile de `UnitViewer`**

En `components/unit/UnitViewer.tsx`, agregar `backHref` a la firma del
componente (como `backHref?: string`), y en la barra superior mobile
(`:633-641`) reemplazar:

```tsx
        <button
          onClick={() => router.push(`${basePath}/edificio/${buildingId}`)}
          aria-label="Volver al plano"
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
```

por:

```tsx
        <button
          onClick={() => router.push(backHref ?? `${basePath}/edificio/${buildingId}`)}
          aria-label={backHref ? 'Volver a resultados' : 'Volver al plano'}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
        >
```

- [ ] **Step 5: Agregar el control de volver en escritorio**

En la barra superior de escritorio (`:676`, el `<div className="hidden md:flex absolute top-0 left-0 right-0 z-20 flex-wrap items-center justify-between gap-2 px-4 pt-4 pointer-events-none">`),
agregar como primer hijo un botón de volver que **sólo se renderiza si hay
`backHref`** — el spec es explícito en que un `backHref` ausente no debe dejar
controles muertos:

```tsx
          {backHref && (
            <button
              onClick={() => router.push(backHref)}
              className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white shadow text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Volver a resultados
            </button>
          )}
```

El `pointer-events-auto` es necesario: el contenedor tiene `pointer-events-none`
para dejar pasar los clicks al plano que está debajo, así que cada control
interactivo tiene que recuperarlos explícitamente. Verificá cómo lo hacen los
controles hermanos de ese contenedor y seguí el mismo patrón.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npx eslint components/unit/UnitViewer.tsx components/unit/UnitViewerWrapper.tsx components/units/UnitsListView.tsx "app/proyecto/[slug]/edificio/[buildingId]/unidad/[unitId]/page.tsx"`
Expected: 0 errores de tsc, tests en verde, 0 warnings nuevos.

- [ ] **Step 7: Commit**

```bash
git add components/unit/UnitViewer.tsx components/unit/UnitViewerWrapper.tsx components/units/UnitsListView.tsx "app/proyecto/[slug]/edificio/[buildingId]/unidad/[unitId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(unit): volver al listado filtrado desde la ficha de unidad

En escritorio no existía ningún control de retroceso: el único estaba en
la barra mobile. Ahora ambos vuelven al listado del que vino el usuario,
conservando sus filtros.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: "Ver similares" lleva a unidades similares

**Files:**
- Modify: `components/units/UnitsListView.tsx:814-816` (tarjeta) y `:888-890` (fila)

**Interfaces:**
- Consumes: `findSimilarUnits` de `@/lib/similar-units` (Task 2);
  `filtersToQuery` de `@/lib/unit-filters-url` (Task 1).

Hoy el `href` es idéntico para una unidad vendida y una disponible; sólo cambia
la etiqueta. Una unidad vendida ofrece "Ver similares" y lleva a sí misma.

- [ ] **Step 1: Calcular el destino de "similares" en `UnitCard` y `UnitRow`**

Ambos subcomponentes ya reciben `unit` y `basePath`. Agregales una prop
`allUnits: Unit[]` (pasada desde el componente padre, que tiene
`project.units`), y el import:

```tsx
import { findSimilarUnits } from '@/lib/similar-units';
import { DEFAULT_UNIT_FILTERS, filtersToQuery } from '@/lib/unit-filters-url';
```

En cada uno, junto al `const sold = unit.status === 'sold';` existente, agregar:

```tsx
  // Una unidad vendida ofrece alternativas reales en vez de llevar a sí misma.
  // Si no hay ninguna comparable disponible, no se promete lo que no existe:
  // no se muestra el link (ver lib/similar-units.ts).
  const similares = sold ? findSimilarUnits(unit, allUnits) : [];
  const similaresHref = `${basePath}/unidades?` + filtersToQuery({
    ...DEFAULT_UNIT_FILTERS,
    edificio: unit.buildingId,
    tipo: unit.type,
    estado: 'available',
  });
```

`similares` se calcula sólo cuando la unidad está vendida (el `sold ? … : []`),
que es el único caso donde se usa.

- [ ] **Step 2: Usar ese destino en la tarjeta**

Reemplazar el bloque `:814-816`:

```tsx
          <Link href={href} className={'text-[11.5px] font-semibold ' + (sold ? 'text-trevo-dark/50' : 'text-trevo-green')}>
            {sold ? 'Ver similares' : `Ver ${unitLabelLower} →`}
          </Link>
```

por:

```tsx
          {sold ? (
            similares.length > 0 && (
              <Link href={similaresHref} className="text-[11.5px] font-semibold text-trevo-dark/50">
                Ver {similares.length} similar{similares.length === 1 ? '' : 'es'} →
              </Link>
            )
          ) : (
            <Link href={href} className="text-[11.5px] font-semibold text-trevo-green">
              Ver {unitLabelLower} →
            </Link>
          )}
```

- [ ] **Step 3: Usar ese destino en la fila**

Reemplazar el bloque `:888-890`:

```tsx
            <Link href={href} className={'text-[11.5px] font-semibold whitespace-nowrap ' + (sold ? 'text-trevo-dark/50' : 'text-trevo-green')}>
              {sold ? 'Ver similares' : `Ver ${unitLabelLower} →`}
            </Link>
```

por:

```tsx
            {sold ? (
              similares.length > 0 && (
                <Link href={similaresHref} className="text-[11.5px] font-semibold whitespace-nowrap text-trevo-dark/50">
                  Ver {similares.length} similar{similares.length === 1 ? '' : 'es'} →
                </Link>
              )
            ) : (
              <Link href={href} className="text-[11.5px] font-semibold whitespace-nowrap text-trevo-green">
                Ver {unitLabelLower} →
              </Link>
            )}
```

Sólo se reemplaza ese `<Link>`; el `</div>` que cierra el contenedor de acciones
(`:891`) queda intacto.

- [ ] **Step 4: Pasar `allUnits` desde el padre**

En los puntos donde se renderizan `<UnitCard ... />` y `<UnitRow ... />`,
agregales `allUnits={project.units}`.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx vitest run && npx eslint components/units/UnitsListView.tsx`
Expected: 0 errores de tsc, tests en verde, 0 warnings nuevos.

- [ ] **Step 6: Commit**

```bash
git add components/units/UnitsListView.tsx
git commit -m "$(cat <<'EOF'
fix(units): "Ver similares" lleva a unidades similares, no a la misma

El href de una unidad vendida era idéntico al de una disponible: sólo
cambiaba la etiqueta, así que "Ver similares" llevaba a la misma unidad
vendida. Ahora lleva al listado filtrado por comparables disponibles, y
no se ofrece cuando no hay ninguna.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: verificación

**Files:** ninguno (sólo verificación).

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: todos en verde, incluidos los 11 de `lib/unit-filters-url.test.ts` y
los 6 de `lib/similar-units.test.ts`.

- [ ] **Step 2: Tipos y lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: 0 errores, 0 warnings nuevos.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0. Anotá si alguna ruta `/proyecto/**` cambió de tamaño de bundle
de forma llamativa respecto del build anterior.

- [ ] **Step 4: Recorrido en navegador**

Este es el paso más importante de esta tarea y el spec lo dice explícitamente:
montar un `Navbar` `fixed` sobre seis vistas que nunca convivieron con él es
exactamente el tipo de cambio cuyo defecto es visual (contenido tapado) y no lo
detecta ninguna herramienta automática.

Con `npm run dev`, en un proyecto con unidades, verificá:

1. **Nav global presente y temizado** en las seis: `/proyecto/[slug]`,
   `/unidades`, `/amenities`, `/ubicacion`, `/masterplan`, `/recorrido`, y en
   `/edificio/[id]` y una ficha de unidad.
2. **Nada tapado por el nav** en ninguna de ellas — especialmente el primer
   bloque de `/unidades` y `/amenities`, que tenían su propio `pt-[26px]`.
3. **El hero de la landing sigue a pantalla completa** y pasa por debajo del nav
   translúcido, sin una franja vacía arriba.
4. **El nav muestra el nombre del proyecto**, y un nombre largo no rompe la
   barra ni empuja los links fuera.
5. **No hay doble navegación** en `/unidades`, `/amenities` ni `/ubicacion`, y
   el botón "Contactar" de `/unidades` sigue abriendo el modal de lead.
6. **Filtrar en `/unidades` cambia la URL** sin recargar la página; recargar con
   esa URL reconstruye los mismos filtros; el botón "atrás" sale de la lista en
   vez de deshacer filtros uno por uno.
7. **Entrar a una unidad desde la lista filtrada** y volver con "Volver a
   resultados" — en mobile (barra superior) y en escritorio (el control nuevo) —
   devuelve al listado con los filtros puestos.
8. **Entrar a una unidad por link directo** (sin `?volver=`) no muestra el
   control de escritorio y en mobile sigue volviendo al plano de piso.
9. **Una unidad vendida** ofrece "Ver N similares" y lleva al listado filtrado
   por comparables disponibles; una vendida sin comparables no ofrece el link.

Si el navegador no está disponible (el perfil de Chrome puede estar tomado por
otra sesión, como pasó en fases anteriores de este proyecto), documentá el gap y
seguí sólo con la verificación automatizada — pero dejá constancia de que los
puntos 2 y 3 quedaron sin verificar, porque son los de mayor riesgo de esta
fase.
