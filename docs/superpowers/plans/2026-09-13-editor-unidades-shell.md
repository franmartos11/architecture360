# Shell de rutas para UnitsEditor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el panel lateral de 400px de `UnitsEditor` por un shell de rutas (`/unidades/[unitId]/<grupo>`) que divide sus ~16 campos en 7 grupos navegables, cada uno con un punto de estado (cargado/a medias/vacío), sin tocar `FloorUnitsEditor` (fase 2, fuera de este plan).

**Architecture:** Tres capas — (1) `lib/unit-fields.ts` traduce entre las columnas snake_case de la fila de unidad y una forma canónica `UnitFormValues` en camelCase; (2) `components/admin/unit-groups/` son componentes de campos puramente presentacionales, cada uno recibe `{ values, onChange }`; (3) un `layout.tsx` client-side carga la unidad UNA vez, expone `{ unit, values, patch }` por contexto a las sub-rutas, y renderiza el menú lateral + navegación entre unidades del piso.

**Tech Stack:** Next.js App Router (client components, `use(params)`), React Context, Vitest (solo para lógica en `.ts`, no hay tests de componentes `.tsx` en este repo — ver Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-13-editor-unidades-por-grupos-design.md`

## Global Constraints

- Vitest solo corre archivos `**/*.test.ts` (ver `vitest.config.ts`) — ningún componente `.tsx` de este repo tiene test propio hoy. No crear archivos `.test.tsx`; los componentes de grupo y las páginas se verifican con `tsc --noEmit` + verificación manual en el navegador (Task 11).
- Todo copy visible va en español, tono informal (igual que el resto del admin) — copiar el texto exacto de los bloques que se mueven, no reinventar.
- Los estilos usan las mismas clases Tailwind que el resto de `components/admin/` (inputs `h-9 px-2.5 rounded-lg border border-gray-300 text-xs`, etc.) — copiar, no rediseñar.
- No cambiar el modelo de datos ni `/api/admin/units` (ya acepta `galleryImages`, `tourData`, etc. vía `FIELD_MAP` en `app/api/admin/units/[id]/route.ts`).
- No tocar `components/admin/FloorUnitsEditor.tsx` salvo el único link a `unidades/${u.id}` de la Task 10 — esa fase queda para un plan aparte.
- `UnitRoomsEditor` (Ambientes) sigue haciendo su propio fetch/persist — se reusa tal cual también embebido en "Delimitar deptos en el plano", donde no existe el contexto del shell. No engancharlo al contexto.

## Decisiones de esta implementación no fijadas por el spec

El spec deja estos detalles a criterio de implementación; se resuelven así, para que quien ejecute el plan no tenga que volver a decidirlos:

- **Moneda no es un campo editable hoy** (solo se ve formateada con `formatPrice`). El grupo Comercial mueve Precio + Estado tal cual existen — no se inventa un selector de moneda nuevo.
- **El botón "Borrar unidad" del panel desaparece** en vez de moverse al shell: la lista (`UnitsEditor`) ya tiene borrar por fila y borrado masivo; mantenerlo en el shell duplicaría la acción y complica qué hacer con la navegación después de borrar la unidad que se está viendo.
- **`Recorrido 360°` SÍ pasa a usar el contexto del shell** (a diferencia de `Ambientes`): `TourEditor` solo se monta sin contexto en pantallas no relacionadas con esta ruta (tour de edificio/proyecto), así que agregar `tourData` a `UnitFormValues` y que `/tour` lea `unit.tour_data` del contexto en vez de hacer su propio fetch es seguro y evita una segunda llamada a la API.
- **`Ambientes` NO usa el contexto**: `UnitRoomsEditor` es reusado embebido en otra pantalla sin shell alrededor, así que se queda con su fetch/persist propio — solo cambia de ruta.

---

### Task 1: `lib/unit-fields.ts` — forma canónica de los campos

**Files:**
- Create: `lib/unit-fields.ts`
- Test: `lib/unit-fields.test.ts`

**Interfaces:**
- Produces: `UnitFormValues` (interface), `toFormValues(row: DbUnitRow): UnitFormValues`, `toDbShape(patch: Partial<UnitFormValues>): Partial<DbUnitRow>`, `UnitGroupProps` (interface `{ values: UnitFormValues; onChange: (patch: Partial<UnitFormValues>) => void }`) — usados por todas las tasks siguientes.

- [ ] **Step 1: Escribir el test (falla porque el módulo no existe todavía)**

```ts
// lib/unit-fields.test.ts
import { describe, it, expect } from 'vitest';
import { toFormValues, toDbShape } from './unit-fields';
import type { UnitRow as DbUnitRow } from '@/types/database';

function makeRow(overrides: Partial<DbUnitRow> = {}): DbUnitRow {
  return {
    id: 'u1', floor_id: 'f1', code: 'A01', model_name: 'SUITE', type: '2 dormitorios',
    total_area: 65.5, inner_area: 55, balcony_area: 10.5, external_area: 0,
    bedrooms: 2, bathrooms: 2, has_service_room: false,
    lot_size: null, ceiling_height: null, garage_spaces: 0, garage_type: null,
    garage_covered: 0, garage_uncovered: 0, condition: null, features: [],
    living_rooms: 1, kitchens: 1, other_rooms_count: 0, other_rooms_description: null,
    hoa_fee: null, floors_count: 1,
    price: 150000, currency: 'USD', status: 'available', orientation: 'NE',
    interior_image_url: null, gallery_images: [],
    floor_plan_3d_url: null, plan_3d_url: null, technical_plan_url: null,
    room_plan_image: null, polygon: null, rooms: null, levels: null,
    tour_image_url: null, tour_data: null,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

describe('toFormValues / toDbShape', () => {
  it('ida y vuelta preserva todos los campos del formulario', () => {
    const row = makeRow();
    const values = toFormValues(row);
    expect(values.code).toBe('A01');
    expect(values.balconyArea).toBe(10.5);
    expect(values.tourData).toBeNull();
    const patch = toDbShape(values);
    expect(patch).toMatchObject({
      code: 'A01', total_area: 65.5, model_name: 'SUITE', type: '2 dormitorios',
      inner_area: 55, balcony_area: 10.5, external_area: 0,
      bedrooms: 2, bathrooms: 2, has_service_room: false, orientation: 'NE',
      price: 150000, currency: 'USD', status: 'available',
    });
  });

  it('preserva balconyArea/externalArea en 0 (no los trata como vacío)', () => {
    const values = toFormValues(makeRow({ balcony_area: 0, external_area: 0 }));
    const patch = toDbShape({ balconyArea: values.balconyArea, externalArea: values.externalArea });
    expect(patch.balcony_area).toBe(0);
    expect(patch.external_area).toBe(0);
  });

  it('toDbShape ignora keys que no son de UnitFormValues', () => {
    const patch = toDbShape({ code: 'B02', notAField: 'x' } as unknown as Partial<import('./unit-fields').UnitFormValues>);
    expect(Object.keys(patch)).toEqual(['code']);
  });

  it('total_area null se preserva (unidad sin superficie cargada)', () => {
    const values = toFormValues(makeRow({ total_area: null }));
    expect(values.totalArea).toBeNull();
    expect(toDbShape({ totalArea: null })).toEqual({ total_area: null });
  });

  it('tourData viaja completo (para que /tour lo persista vía patch)', () => {
    const tourData = { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Living', imageUrl: 'x' }] };
    const values = toFormValues(makeRow({ tour_data: tourData }));
    expect(values.tourData).toEqual(tourData);
    expect(toDbShape({ tourData })).toEqual({ tour_data: tourData });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/unit-fields.test.ts`
Expected: FAIL — `Cannot find module './unit-fields'` (o similar, el archivo no existe).

- [ ] **Step 3: Implementar `lib/unit-fields.ts`**

```ts
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType, TourData } from '@/types';

// Forma canónica en camelCase de los campos editables de una unidad —
// puente entre la fila snake_case que devuelve Supabase y los componentes
// de grupo (components/admin/unit-groups/*), que no conocen la forma de
// la tabla. bedrooms/bathrooms quedan `number | null` (no `number`, aunque
// así está tipada la columna) porque el form permite vaciar el input y
// mandar null en el PATCH — comportamiento preexistente, no un campo nuevo.
export interface UnitFormValues {
  code: string;
  totalArea: number | null;
  modelName: string | null;
  type: UnitType;
  bedrooms: number | null;
  bathrooms: number | null;
  hasServiceRoom: boolean;
  orientation: string | null;
  innerArea: number | null;
  balconyArea: number;
  externalArea: number;
  price: number | null;
  currency: string;
  status: UnitStatus;
  interiorImageUrl: string | null;
  galleryImages: string[];
  floorPlan3dUrl: string | null;
  plan3dUrl: string | null;
  technicalPlanUrl: string | null;
  tourData: TourData | null;
}

export function toFormValues(row: DbUnitRow): UnitFormValues {
  return {
    code: row.code,
    totalArea: row.total_area,
    modelName: row.model_name,
    type: row.type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    hasServiceRoom: row.has_service_room,
    orientation: row.orientation,
    innerArea: row.inner_area,
    balconyArea: row.balcony_area,
    externalArea: row.external_area,
    price: row.price,
    currency: row.currency,
    status: row.status,
    interiorImageUrl: row.interior_image_url,
    galleryImages: row.gallery_images,
    floorPlan3dUrl: row.floor_plan_3d_url,
    plan3dUrl: row.plan_3d_url,
    technicalPlanUrl: row.technical_plan_url,
    tourData: row.tour_data,
  };
}

const FIELD_TO_COLUMN: Record<keyof UnitFormValues, keyof DbUnitRow> = {
  code: 'code',
  totalArea: 'total_area',
  modelName: 'model_name',
  type: 'type',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  hasServiceRoom: 'has_service_room',
  orientation: 'orientation',
  innerArea: 'inner_area',
  balconyArea: 'balcony_area',
  externalArea: 'external_area',
  price: 'price',
  currency: 'currency',
  status: 'status',
  interiorImageUrl: 'interior_image_url',
  galleryImages: 'gallery_images',
  floorPlan3dUrl: 'floor_plan_3d_url',
  plan3dUrl: 'plan_3d_url',
  technicalPlanUrl: 'technical_plan_url',
  tourData: 'tour_data',
};

// Traduce un patch en camelCase (lo que manda un grupo por onChange, y lo
// que ya acepta el PATCH de /api/admin/units/[id]) a las columnas
// snake_case de la fila — para el merge optimista del estado local.
export function toDbShape(patch: Partial<UnitFormValues>): Partial<DbUnitRow> {
  const out: Partial<DbUnitRow> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = FIELD_TO_COLUMN[key as keyof UnitFormValues];
    if (column) (out as Record<string, unknown>)[column] = value;
  }
  return out;
}

// Props comunes a todos los componentes de grupo de campos
// (components/admin/unit-groups/*Group.tsx) — no saben si onChange termina
// en un PATCH optimista (shell) o en un borrador local (wizard, fase 2).
export interface UnitGroupProps {
  values: UnitFormValues;
  onChange: (patch: Partial<UnitFormValues>) => void;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/unit-fields.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/unit-fields.ts lib/unit-fields.test.ts
git commit -m "$(cat <<'EOF'
feat(units): agregar forma canónica UnitFormValues para el editor de unidades

Traduce entre las columnas snake_case de units y camelCase, base para
los componentes de grupo de la fase 1 del shell de unidades.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `components/admin/unit-groups/registry.ts` — navegación de grupos

**Files:**
- Create: `components/admin/unit-groups/registry.ts`
- Test: `components/admin/unit-groups/registry.test.ts`

**Interfaces:**
- Consumes: nada de tasks previas (usa `ProjectTypeConfig` de `@/lib/project-types`, `UnitRow as DbUnitRow` de `@/types/database`, `getTourStats` de `@/lib/tour-stats`).
- Produces: `UnitGroupStatus` (`'complete' | 'partial' | 'empty'`), `UnitGroupNavItem` (`{ key, label, slug, applies(tc), status(unit, tc) }`), `UNIT_GROUP_NAV: UnitGroupNavItem[]` — usado por `layout.tsx` (Task 5) para el menú lateral.

- [ ] **Step 1: Escribir el test**

```ts
// components/admin/unit-groups/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getProjectTypeConfig } from '@/lib/project-types';
import { UNIT_GROUP_NAV } from './registry';
import type { UnitRow as DbUnitRow } from '@/types/database';

const dwelling = getProjectTypeConfig('edificio', 'venta');
const land = getProjectTypeConfig('loteo', 'venta');

function makeRow(overrides: Partial<DbUnitRow> = {}): DbUnitRow {
  return {
    id: 'u1', floor_id: 'f1', code: 'A01', model_name: 'SUITE', type: '2 dormitorios',
    total_area: 65.5, inner_area: 55, balcony_area: 10.5, external_area: 0,
    bedrooms: 2, bathrooms: 2, has_service_room: false,
    lot_size: null, ceiling_height: null, garage_spaces: 0, garage_type: null,
    garage_covered: 0, garage_uncovered: 0, condition: null, features: [],
    living_rooms: 1, kitchens: 1, other_rooms_count: 0, other_rooms_description: null,
    hoa_fee: null, floors_count: 1,
    price: 150000, currency: 'USD', status: 'available', orientation: 'NE',
    interior_image_url: null, gallery_images: [],
    floor_plan_3d_url: null, plan_3d_url: null, technical_plan_url: null,
    room_plan_image: null, polygon: null, rooms: null, levels: null,
    tour_image_url: null, tour_data: null,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

function find(key: string) {
  const item = UNIT_GROUP_NAV.find(g => g.key === key);
  if (!item) throw new Error(`no existe el grupo ${key}`);
  return item;
}

describe('UNIT_GROUP_NAV.applies', () => {
  it('superficies/planos/ambientes/tour no aplican a un lote', () => {
    for (const key of ['superficies', 'planos', 'ambientes', 'tour']) {
      expect(find(key).applies(land)).toBe(false);
      expect(find(key).applies(dwelling)).toBe(true);
    }
  });

  it('datos e imagenes aplican siempre', () => {
    for (const key of ['datos', 'imagenes']) {
      expect(find(key).applies(land)).toBe(true);
      expect(find(key).applies(dwelling)).toBe(true);
    }
  });
});

describe('UNIT_GROUP_NAV.status', () => {
  it('imagenes: empty / partial / complete', () => {
    const item = find('imagenes');
    expect(item.status(makeRow({ interior_image_url: null, gallery_images: [] }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ interior_image_url: 'x', gallery_images: [] }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ interior_image_url: 'x', gallery_images: ['y'] }), dwelling)).toBe('complete');
  });

  it('planos: cuenta los tres campos', () => {
    const item = find('planos');
    expect(item.status(makeRow({ floor_plan_3d_url: null, plan_3d_url: null, technical_plan_url: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ floor_plan_3d_url: 'a', plan_3d_url: null, technical_plan_url: null }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ floor_plan_3d_url: 'a', plan_3d_url: 'b', technical_plan_url: 'c' }), dwelling)).toBe('complete');
  });

  it('tour: usa getTourStats (nodeCount, orphanCount, hasStart)', () => {
    const item = find('tour');
    expect(item.status(makeRow({ tour_data: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({
      tour_data: { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Living', imageUrl: 'x', linkHotspots: [] }] },
    }), dwelling)).toBe('complete');
    expect(item.status(makeRow({
      tour_data: {
        initialNodeId: '',
        nodes: [
          { id: 'n1', name: 'Living', imageUrl: 'x', linkHotspots: [{ id: 'h1', targetNodeId: 'n2', yaw: 0, pitch: 0 }] as any },
          { id: 'n2', name: 'Cocina', imageUrl: 'y', linkHotspots: [] },
          { id: 'n3', name: 'Baño', imageUrl: 'z', linkHotspots: [] },
        ],
      },
    }), dwelling)).toBe('partial');
  });

  it('ambientes: depende de rooms', () => {
    const item = find('ambientes');
    expect(item.status(makeRow({ rooms: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ rooms: [{ id: 'r1', kind: 'bedroom', name: 'Dorm 1' } as any] }), dwelling)).toBe('complete');
  });

  it('datos: lote depende de total_area; vivienda de orientacion+dormitorios', () => {
    const item = find('datos');
    expect(item.status(makeRow({ total_area: null }), land)).toBe('empty');
    expect(item.status(makeRow({ total_area: 100 }), land)).toBe('complete');
    expect(item.status(makeRow({ model_name: null, type: '' as any }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ model_name: 'X', orientation: null, bedrooms: 0 }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ model_name: 'X', orientation: 'NE', bedrooms: 2 }), dwelling)).toBe('complete');
  });

  it('comercial: depende del precio', () => {
    const item = find('comercial');
    expect(item.status(makeRow({ price: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ price: 1000 }), dwelling)).toBe('complete');
  });

  it('superficies: total_area y luego inner_area', () => {
    const item = find('superficies');
    expect(item.status(makeRow({ total_area: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ total_area: 60, inner_area: null }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ total_area: 60, inner_area: 50 }), dwelling)).toBe('complete');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run components/admin/unit-groups/registry.test.ts`
Expected: FAIL — el módulo `./registry` no existe.

- [ ] **Step 3: Implementar `components/admin/unit-groups/registry.ts`**

```ts
import type { ProjectTypeConfig } from '@/lib/project-types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import { getTourStats } from '@/lib/tour-stats';

export type UnitGroupStatus = 'complete' | 'partial' | 'empty';

export interface UnitGroupNavItem {
  key: string;
  label: string;
  /** Segmento de ruta bajo .../unidades/[unitId]/ */
  slug: string;
  applies: (tc: ProjectTypeConfig) => boolean;
  status: (unit: DbUnitRow, tc: ProjectTypeConfig) => UnitGroupStatus;
}

// Orden = orden del menú lateral del shell (layout.tsx). "Imágenes" usa el
// slug histórico "fotos" (la ruta ya existía antes del shell) para no
// romper el link que UnitsEditor ya tenía guardado.
export const UNIT_GROUP_NAV: UnitGroupNavItem[] = [
  {
    key: 'datos', label: 'Datos', slug: 'datos',
    applies: () => true,
    status: (u, tc) => {
      if (tc.unitIsLand) return u.total_area != null ? 'complete' : 'empty';
      if (!u.model_name && !u.type) return 'empty';
      return (u.orientation && u.bedrooms > 0) ? 'complete' : 'partial';
    },
  },
  {
    key: 'superficies', label: 'Superficies', slug: 'superficies',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => {
      if (u.total_area == null) return 'empty';
      return u.inner_area != null ? 'complete' : 'partial';
    },
  },
  {
    key: 'comercial', label: 'Comercial', slug: 'comercial',
    applies: (tc) => tc.showPrice || tc.showStatus,
    status: (u) => (u.price != null ? 'complete' : 'empty'),
  },
  {
    key: 'imagenes', label: 'Imágenes', slug: 'fotos',
    applies: () => true,
    status: (u) => {
      const hasMain = !!u.interior_image_url;
      const hasGallery = (u.gallery_images ?? []).length > 0;
      if (!hasMain && !hasGallery) return 'empty';
      return hasMain && hasGallery ? 'complete' : 'partial';
    },
  },
  {
    key: 'planos', label: 'Planos', slug: 'planos',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => {
      const count = [u.floor_plan_3d_url, u.plan_3d_url, u.technical_plan_url].filter(Boolean).length;
      if (count === 0) return 'empty';
      return count === 3 ? 'complete' : 'partial';
    },
  },
  {
    key: 'ambientes', label: 'Ambientes', slug: 'ambientes',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => ((u.rooms ?? []).length > 0 ? 'complete' : 'empty'),
  },
  {
    key: 'tour', label: 'Recorrido 360°', slug: 'tour',
    applies: (tc) => !tc.unitIsLand,
    status: (u) => {
      const { nodeCount, orphanCount, hasStart } = getTourStats(u.tour_data);
      if (nodeCount === 0) return 'empty';
      return (orphanCount === 0 && hasStart) ? 'complete' : 'partial';
    },
  },
];
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run components/admin/unit-groups/registry.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add components/admin/unit-groups/registry.ts components/admin/unit-groups/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(units): agregar registro de navegación de grupos del editor de unidades

UNIT_GROUP_NAV define label/ruta/disponibilidad/estado de cada uno de
los 7 grupos del shell — usado por el layout para el menú lateral.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Componentes de grupo de campos

**Files:**
- Create: `components/admin/unit-groups/DatosGroup.tsx`
- Create: `components/admin/unit-groups/SuperficiesGroup.tsx`
- Create: `components/admin/unit-groups/ComercialGroup.tsx`
- Create: `components/admin/unit-groups/ImagenesGroup.tsx`
- Create: `components/admin/unit-groups/PlanosGroup.tsx`

**Interfaces:**
- Consumes: `UnitGroupProps` de `@/lib/unit-fields` (Task 1).
- Produces: 5 componentes default-export, cada uno `(props: UnitGroupProps) => JSX.Element`, consumidos por las páginas de la Task 6.

Todo el JSX de abajo es el mismo markup/clases que ya existía en el panel de `UnitsEditor.tsx` (líneas 620-761 y 791-801 del archivo antes de esta task), solo cambia `cur.<campo>` → `values.<campo>` y `patch(cur.id, {...})` → `onChange({...})`.

- [ ] **Step 1: `DatosGroup.tsx`**

```tsx
'use client';

import { useProjectTypeConfig } from '@/lib/project-type-context';
import type { UnitGroupProps } from '@/lib/unit-fields';

// Lote: sin tipología (es terreno). Depto/dúplex/único: lista curada fija
// (a diferencia de casa, que deriva el tipo de la cantidad de dormitorios
// — ver FloorUnitsEditor, fase 2).
const UNIT_TYPES = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'] as const;

export default function DatosGroup({ values, onChange }: UnitGroupProps) {
  const { unitIsLand } = useProjectTypeConfig();

  if (unitIsLand) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Código</label>
          <input
            defaultValue={values.code} key={`code-${values.code}`}
            onBlur={e => { if (e.target.value !== values.code) onChange({ code: e.target.value }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Superficie (m²)</label>
          <input
            type="number" defaultValue={values.totalArea ?? ''} key={`m2-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.totalArea) onChange({ totalArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-medium text-gray-900">Código</label>
        <input
          defaultValue={values.code} key={`code-${values.code}`}
          onBlur={e => { if (e.target.value !== values.code) onChange({ code: e.target.value }); }}
          className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex gap-2.5">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Modelo</label>
          <input
            defaultValue={values.modelName ?? ''} key={`model-${values.code}`}
            onBlur={e => { const v = e.target.value.trim() || null; if (v !== values.modelName) onChange({ modelName: v }); }}
            placeholder="SUITE GARDEN"
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Tipología</label>
          <select
            value={values.type ?? UNIT_TYPES[0]}
            onChange={e => onChange({ type: e.target.value })}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          >
            {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2.5 items-end">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Dormitorios</label>
          <input
            type="number" defaultValue={values.bedrooms ?? ''} key={`bed-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.bedrooms) onChange({ bedrooms: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Baños</label>
          <input
            type="number" defaultValue={values.bathrooms ?? ''} key={`bath-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.bathrooms) onChange({ bathrooms: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className="flex items-center gap-1.5 h-9 pb-1.5 text-[11px] text-gray-700 whitespace-nowrap shrink-0">
          <input
            type="checkbox" checked={!!values.hasServiceRoom}
            onChange={e => onChange({ hasServiceRoom: e.target.checked })}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Serv.
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-medium text-gray-900">Orientación</label>
        <input
          defaultValue={values.orientation ?? ''} key={`orient-${values.code}`}
          onBlur={e => { const v = e.target.value.trim() || null; if (v !== values.orientation) onChange({ orientation: v }); }}
          placeholder="NE"
          className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `SuperficiesGroup.tsx`**

```tsx
'use client';

import type { UnitGroupProps } from '@/lib/unit-fields';

export default function SuperficiesGroup({ values, onChange }: UnitGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-medium text-gray-900">Superficie total (m²)</label>
        <input
          type="number" defaultValue={values.totalArea ?? ''} key={`m2-${values.code}`}
          onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.totalArea) onChange({ totalArea: v }); }}
          className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Interior (m²)</label>
          <input
            type="number" defaultValue={values.innerArea ?? ''} key={`inner-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.innerArea) onChange({ innerArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Balcón (m²)</label>
          <input
            type="number" defaultValue={values.balconyArea ?? 0} key={`balcony-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== values.balconyArea) onChange({ balconyArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Exterior (m²)</label>
          <input
            type="number" defaultValue={values.externalArea ?? 0} key={`external-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== values.externalArea) onChange({ externalArea: v }); }}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `ComercialGroup.tsx`**

```tsx
'use client';

import { useProjectTypeConfig } from '@/lib/project-type-context';
import { UNIT_STATUSES } from '@/lib/validate';
import { getStatusLabel, formatPrice } from '@/lib/units';
import type { UnitStatus } from '@/types';
import type { UnitGroupProps } from '@/lib/unit-fields';

const STATUS_PILL_BG: Record<UnitStatus, string> = {
  available: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  reserved: 'bg-amber-50 border-amber-200 text-amber-700',
  sold: 'bg-gray-100 border-gray-200 text-gray-600',
};

export default function ComercialGroup({ values, onChange }: UnitGroupProps) {
  const { showPrice, showStatus } = useProjectTypeConfig();

  return (
    <div className="flex flex-col gap-4">
      {showPrice && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11.5px] font-medium text-gray-900">Precio</label>
          <input
            type="number" defaultValue={values.price ?? ''} key={`price-${values.code}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== values.price) onChange({ price: v }); }}
            placeholder='Sin precio — se muestra "Consultar"'
            className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
          />
          {values.price != null && <p className="text-[10.5px] text-gray-400">{formatPrice(values.price, values.currency)}</p>}
        </div>
      )}
      {showStatus && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px] font-medium text-gray-900">Estado</p>
          <div className="flex gap-1.5">
            {UNIT_STATUSES.map(s => (
              <button
                key={s} type="button" onClick={() => onChange({ status: s })}
                className={`flex-1 h-9 rounded-lg text-[11px] font-medium border transition-colors ${values.status === s ? STATUS_PILL_BG[s] : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {getStatusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `ImagenesGroup.tsx`**

```tsx
'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import type { UnitGroupProps } from '@/lib/unit-fields';

export default function ImagenesGroup({ values, onChange }: UnitGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Foto principal</p>
        <ImageUploader value={values.interiorImageUrl ?? ''} onChange={url => onChange({ interiorImageUrl: url || null })} folder="units" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Galería de imágenes</p>
        <MultiImageUploader values={values.galleryImages ?? []} onChange={urls => onChange({ galleryImages: urls })} folder="units" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `PlanosGroup.tsx`**

```tsx
'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import type { UnitGroupProps } from '@/lib/unit-fields';

export default function PlanosGroup({ values, onChange }: UnitGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Plano 3D (planta)</p>
        <ImageUploader value={values.floorPlan3dUrl ?? ''} onChange={url => onChange({ floorPlan3dUrl: url || null })} folder="floorplans" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Render 3D</p>
        <ImageUploader value={values.plan3dUrl ?? ''} onChange={url => onChange({ plan3dUrl: url || null })} folder="floorplans" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Plano técnico</p>
        <ImageUploader value={values.technicalPlanUrl ?? ''} onChange={url => onChange({ technicalPlanUrl: url || null })} folder="floorplans" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos en los 5 archivos de `components/admin/unit-groups/`.

- [ ] **Step 7: Commit**

```bash
git add components/admin/unit-groups/DatosGroup.tsx components/admin/unit-groups/SuperficiesGroup.tsx components/admin/unit-groups/ComercialGroup.tsx components/admin/unit-groups/ImagenesGroup.tsx components/admin/unit-groups/PlanosGroup.tsx
git commit -m "$(cat <<'EOF'
feat(units): agregar los 5 componentes de grupo de campos del editor

Datos, Superficies, Comercial, Imágenes y Planos — el mismo markup que
tenía el panel de UnitsEditor, ahora presentacional y reusable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Contexto del shell

**Files:**
- Create: `app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/unit-shell-context.tsx`

**Interfaces:**
- Consumes: `UnitFormValues` de `@/lib/unit-fields` (Task 1); `UnitRow as DbUnitRow` de `@/types/database`.
- Produces: `UnitShellContext` (React Context), `useUnitShell(): { unit: DbUnitRow; values: UnitFormValues; patch: (updates: Partial<UnitFormValues>) => Promise<boolean> }` — consumido por `layout.tsx` (Task 5, como Provider) y por las páginas de grupo + `/tour` (Tasks 6 y 8, como consumer).

No es un archivo `page.tsx`/`layout.tsx`/`route.ts`, así que Next.js no lo trata como ruta — es un módulo colocado normal.

- [ ] **Step 1: Escribir el archivo**

```tsx
'use client';

import { createContext, useContext } from 'react';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitFormValues } from '@/lib/unit-fields';

export interface UnitShellContextValue {
  unit: DbUnitRow;
  values: UnitFormValues;
  patch: (updates: Partial<UnitFormValues>) => Promise<boolean>;
}

export const UnitShellContext = createContext<UnitShellContextValue | null>(null);

// Las páginas de grupo (datos/superficies/comercial/fotos/planos/tour)
// viven siempre bajo el layout que provee este contexto — si no, es un
// bug de árbol de componentes, no un estado "todavía no cargó".
export function useUnitShell(): UnitShellContextValue {
  const ctx = useContext(UnitShellContext);
  if (!ctx) throw new Error('useUnitShell debe usarse dentro de unidades/[unitId]/layout.tsx');
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/unit-shell-context.tsx"
git commit -m "$(cat <<'EOF'
feat(units): agregar contexto del shell de unidad

Expone {unit, values, patch} a las sub-rutas de .../unidades/[unitId]/
sin que cada página tenga que hacer su propio fetch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `layout.tsx` — el shell

**Files:**
- Create: `app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/layout.tsx`

**Interfaces:**
- Consumes: `UNIT_GROUP_NAV`, `UnitGroupStatus` de `./unit-groups/registry` (Task 2); `toFormValues`, `toDbShape` de `@/lib/unit-fields` (Task 1); `UnitShellContext` de `./unit-shell-context` (Task 4).
- Produces: layout que envuelve TODAS las sub-rutas de `[unitId]` — provee el contexto, el encabezado (código + navegación entre unidades + acción "copiar de otro"), el menú lateral con puntos de estado, y la franja "delimitado en el plano".

- [ ] **Step 1: Escribir el archivo**

```tsx
'use client';

import { useState, useEffect, useMemo, useCallback, use, startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { getStatusLabel } from '@/lib/units';
import { toFormValues, toDbShape, type UnitFormValues } from '@/lib/unit-fields';
import { UNIT_GROUP_NAV, type UnitGroupStatus } from '@/components/admin/unit-groups/registry';
import { UnitShellContext } from './unit-shell-context';
import type { UnitRow as DbUnitRow } from '@/types/database';

type SiblingUnit = Pick<DbUnitRow, 'id' | 'code'>;
type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code'> & {
  building_name: string | null;
  floor_number: number | null;
};

const STATUS_DOT: Record<UnitGroupStatus, string> = {
  complete: 'bg-brand-500',
  partial: 'bg-amber-400',
  empty: 'bg-gray-200',
};

// Shell de .../unidades/[unitId]/ — carga la unidad UNA vez y la comparte
// por contexto con las sub-rutas (datos/superficies/comercial/fotos/
// planos/tour: ver UNIT_GROUP_NAV). Ambientes usa su propio fetch (ver
// unit-groups/registry.ts) así que no depende de este contexto.
export default function UnitShellLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; floorId: string; unitId: string }>;
}) {
  const { id: buildingId, floorId, unitId } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const typeConfig = useProjectTypeConfig();
  const { unitLabel, unitIsLand } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const uAgree = unitAgreement(typeConfig);
  const toast = useToast();

  const [unit, setUnit] = useState<DbUnitRow | null>(null);
  const [siblings, setSiblings] = useState<SiblingUnit[]>([]);
  const [otherUnits, setOtherUnits] = useState<OtherUnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState('Todo guardado');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);

  const load = useCallback(() => {
    startTransition(() => { setLoading(true); setLoadError(false); });
    Promise.all([
      fetch(`/api/admin/units/${unitId}`).then(res => { if (!res.ok) throw new Error('unit'); return res.json(); }),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => res.json()),
    ])
      .then(([unitData, floorUnits]: [DbUnitRow, SiblingUnit[]]) => {
        setUnit(unitData);
        setSiblings(floorUnits);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoadError(true); setLoading(false); });
  }, [unitId, floorId]);

  useEffect(load, [load]);

  // Unidades de CUALQUIER otro piso/edificio del proyecto — para "copiar
  // de otro" (no aplica a lotes, cada uno es su propio terreno).
  useEffect(() => {
    if (unitIsLand) return;
    fetch('/api/admin/units')
      .then(res => res.json())
      .then((data: OtherUnitRow[]) => setOtherUnits(Array.isArray(data) ? data.filter(u => u.id !== unitId) : []))
      .catch(() => {});
  }, [unitIsLand, unitId]);

  const patch = useCallback(async (updates: Partial<UnitFormValues>) => {
    setUnit(prev => (prev ? { ...prev, ...toDbShape(updates) } : prev));
    setSaving(true);
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    setSaving(false);
    if (res.ok) setSavedLabel('Guardado hace un instante');
    else { toast(`No se pudo guardar ${unitLabelLower}.`, 'error'); load(); }
    return res.ok;
  }, [unitId, unitLabelLower, toast, load]);

  const applicableGroups = useMemo(
    () => UNIT_GROUP_NAV.filter(g => g.applies(typeConfig)),
    [typeConfig],
  );

  const currentSlug = pathname.split('/').pop();

  // Si la URL apunta a un grupo que no aplica a este tipo de unidad (ej.
  // /tour en un lote), volvemos a /datos en vez de dejar una pantalla rota.
  useEffect(() => {
    if (!unit) return;
    const isKnownSlug = UNIT_GROUP_NAV.some(g => g.slug === currentSlug);
    const isApplicableSlug = applicableGroups.some(g => g.slug === currentSlug);
    if (isKnownSlug && !isApplicableSlug) {
      router.replace(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/datos`);
    }
  }, [unit, currentSlug, applicableGroups, router, buildingId, floorId, unitId]);

  const curIdx = siblings.findIndex(u => u.id === unitId);

  const goSibling = (dir: 1 | -1) => {
    const next = siblings[curIdx + dir];
    if (!next) return;
    const targetSlug = UNIT_GROUP_NAV.some(g => g.slug === currentSlug) ? currentSlug : 'datos';
    router.push(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${next.id}/${targetSlug}`);
  };

  const handleCopyFromUnit = async () => {
    if (!copySourceId) return;
    setCopying(true);
    const source: DbUnitRow = await fetch(`/api/admin/units/${copySourceId}`).then(res => res.json());
    setCopying(false);
    await patch({
      modelName: source.model_name, type: source.type, totalArea: source.total_area, innerArea: source.inner_area,
      balconyArea: source.balcony_area, externalArea: source.external_area, bedrooms: source.bedrooms, bathrooms: source.bathrooms,
      hasServiceRoom: source.has_service_room, price: source.price, currency: source.currency, status: source.status,
      orientation: source.orientation, floorPlan3dUrl: source.floor_plan_3d_url, plan3dUrl: source.plan_3d_url, technicalPlanUrl: source.technical_plan_url,
    });
    setCopySourceId('');
    setCopyOpen(false);
  };

  if (loading) return <LoadingSpinner text={`Cargando ${unitLabelLower}...`} tone="light" />;
  if (loadError || !unit) {
    return <ErrorState message={`No se pudo cargar ${uAgree.el} ${unitLabelLower}.`} onRetry={load} />;
  }

  const values = toFormValues(unit);
  const planoHref = `/admin/edificios/${buildingId}/pisos/${floorId}/plano`;
  const delimited = !!unit.polygon && unit.polygon.length > 0;

  return (
    <UnitShellContext.Provider value={{ unit, values, patch }}>
      <div className="flex flex-col gap-4">
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver a {unitLabelLower}s
        </Link>

        <Card className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">{unitLabel} {unit.code}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {curIdx >= 0 ? `${curIdx + 1} de ${siblings.length} · ` : ''}{getStatusLabel(unit.status).toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-xs text-gray-400 shrink-0">{saving ? 'Guardando...' : savedLabel}</p>
            {!unitIsLand && otherUnits.length > 0 && (
              <button
                type="button" onClick={() => setCopyOpen(o => !o)}
                className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${copyOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'}`}
              >
                Copiar de otro {unitLabelLower}…
              </button>
            )}
            <button
              type="button" onClick={() => goSibling(-1)} disabled={curIdx <= 0}
              aria-label={`${unitLabel} anterior`}
              className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 disabled:opacity-30 transition-colors"
            >
              ←
            </button>
            <button
              type="button" onClick={() => goSibling(1)} disabled={curIdx === -1 || curIdx >= siblings.length - 1}
              className="h-8 px-3 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </Card>

        {copyOpen && (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-gray-200 bg-gray-50">
            <p className="text-[11px] text-gray-600 leading-relaxed">¿Este {unitLabelLower} ya existe en otro piso o edificio? Copiá sus datos en vez de retipearlos.</p>
            <div className="flex gap-1.5">
              <select
                value={copySourceId}
                onChange={e => setCopySourceId(e.target.value)}
                className="flex-1 h-8 px-2 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{`Elegir ${unitLabelLower} de referencia...`}</option>
                {otherUnits.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button" onClick={handleCopyFromUnit} disabled={!copySourceId || copying}
                className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors whitespace-nowrap"
              >
                {copying ? 'Copiando...' : 'Copiar datos'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 md:items-start">
          <Card className="w-full md:w-56 shrink-0">
            <nav className="flex flex-col p-2">
              {applicableGroups.map(g => {
                const status = g.status(unit, typeConfig);
                const href = `/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/${g.slug}`;
                const active = pathname === href;
                return (
                  <Link
                    key={g.key} href={href}
                    className={`flex items-center gap-2.5 h-9 px-3 rounded-lg text-[12.5px] font-medium transition-colors ${active ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    {g.label}
                  </Link>
                );
              })}
            </nav>
          </Card>

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <Card className="p-5">{children}</Card>

            <div className={`flex flex-col gap-2 p-3.5 rounded-xl border ${delimited ? 'bg-brand-50 border-brand-100' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${delimited ? 'bg-brand-500' : 'bg-amber-400'}`} />
                <p className="text-[11.5px] font-medium text-gray-900">{delimited ? 'Delimitado en el plano' : 'Falta marcarlo en el plano'}</p>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-600">
                {delimited
                  ? `La silueta ya está dibujada, así que el ${unitLabelLower} es clickeable desde el masterplan.`
                  : `Sin silueta el ${unitLabelLower} aparece en la lista del sitio, pero no se puede tocar desde el masterplan.`}
              </p>
              <Link href={planoHref} className="self-start h-8 px-3 flex items-center bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors">
                {delimited ? 'Ver la silueta en el plano →' : 'Marcarlo en el plano →'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </UnitShellContext.Provider>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores (puede haber errores preexistentes en otros archivos aún no tocados por este plan — Task 9/10 los resuelven; confirmar que no hay errores NUEVOS en este archivo).

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(units): agregar shell de rutas para el editor de unidades

layout.tsx carga la unidad una vez, expone el contexto a las
sub-rutas, y muestra el menú de 7 grupos con punto de estado,
navegación entre unidades del piso, y copiar-de-otra-unidad.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Las 5 páginas de grupo (datos/superficies/comercial/fotos/planos)

**Files:**
- Create: `app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/datos/page.tsx`
- Create: `.../superficies/page.tsx`
- Create: `.../comercial/page.tsx`
- Modify: `.../fotos/page.tsx` (existe desde una task anterior a este plan — reemplazar su contenido entero para usar el contexto en vez de su propio fetch)
- Create: `.../planos/page.tsx`

**Interfaces:**
- Consumes: `useUnitShell()` de `../unit-shell-context` (Task 4); `DatosGroup`/`SuperficiesGroup`/`ComercialGroup`/`ImagenesGroup`/`PlanosGroup` de `@/components/admin/unit-groups/*` (Task 3).

- [ ] **Step 1: `datos/page.tsx`**

```tsx
'use client';

import DatosGroup from '@/components/admin/unit-groups/DatosGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitDatosPage() {
  const { values, patch } = useUnitShell();
  return <DatosGroup values={values} onChange={patch} />;
}
```

- [ ] **Step 2: `superficies/page.tsx`**

```tsx
'use client';

import SuperficiesGroup from '@/components/admin/unit-groups/SuperficiesGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitSuperficiesPage() {
  const { values, patch } = useUnitShell();
  return <SuperficiesGroup values={values} onChange={patch} />;
}
```

- [ ] **Step 3: `comercial/page.tsx`**

```tsx
'use client';

import ComercialGroup from '@/components/admin/unit-groups/ComercialGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitComercialPage() {
  const { values, patch } = useUnitShell();
  return <ComercialGroup values={values} onChange={patch} />;
}
```

- [ ] **Step 4: `fotos/page.tsx` — reemplazar contenido entero**

El archivo actual (creado antes de este plan) hace su propio fetch/PATCH de `gallery_images` y arma su propio encabezado. Con el shell ya en pie, esto es redundante: el layout ya carga la unidad y da nav propia. Reemplazar TODO el archivo por:

```tsx
'use client';

import ImagenesGroup from '@/components/admin/unit-groups/ImagenesGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitFotosPage() {
  const { values, patch } = useUnitShell();
  return <ImagenesGroup values={values} onChange={patch} />;
}
```

- [ ] **Step 5: `planos/page.tsx`**

```tsx
'use client';

import PlanosGroup from '@/components/admin/unit-groups/PlanosGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitPlanosPage() {
  const { values, patch } = useUnitShell();
  return <PlanosGroup values={values} onChange={patch} />;
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/datos" "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/superficies" "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/comercial" "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/fotos" "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/planos"
git commit -m "$(cat <<'EOF'
feat(units): agregar rutas de datos/superficies/comercial/fotos/planos

Cada página es un wrapper de 5 líneas: toma {values, patch} del shell
y renderiza su grupo. /fotos deja de hacer su propio fetch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `/ambientes` + redirect del índice

**Files:**
- Create: `app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/ambientes/page.tsx`
- Modify: `app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/page.tsx`

**Interfaces:**
- Consumes: `UnitRoomsEditor` de `@/components/admin/UnitRoomsEditor` (sin cambios en su interfaz — `{ buildingId, floorId, unitId }`).

- [ ] **Step 1: Leer el contenido actual de `page.tsx` (el índice) antes de reemplazarlo**

Hoy renderiza `<UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={unitId} />` con su propio "← Volver a unidades". Ese contenido se muda a `ambientes/page.tsx` (sin el link de vuelta, que ya da el layout).

- [ ] **Step 2: Crear `ambientes/page.tsx`**

```tsx
'use client';

import { use } from 'react';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';

export default function UnitAmbientesPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);
  return <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={unitId} />;
}
```

- [ ] **Step 3: Reemplazar `page.tsx` (el índice) por un redirect a `/datos`**

```tsx
'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

// El índice de la unidad ya no muestra nada propio — antes de este shell
// era la pantalla de Ambientes (ver ambientes/page.tsx, donde se mudó).
// Cualquier link viejo a esta ruta cae acá y sigue a /datos.
export default function AdminUnitIndexPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/datos`);
  }, [router, buildingId, floorId, unitId]);

  return null;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/ambientes/page.tsx" "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(units): mover Ambientes a /ambientes; el índice redirige a /datos

UnitRoomsEditor sigue con su propio fetch/persist (también se usa
embebido en Delimitar deptos en el plano, sin shell alrededor).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `/tour` — sacar el encabezado propio y usar el contexto

**Files:**
- Modify: `app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/tour/page.tsx`

**Interfaces:**
- Consumes: `useUnitShell()` de `../unit-shell-context` (Task 4).

- [ ] **Step 1: Reemplazar el contenido completo del archivo**

El archivo actual hace su propio fetch de `/api/admin/units/${unitId}`, su propio PATCH en `handlePersist`, y arma su propio breadcrumb + `<h2>`. Con el shell, `unit.tour_data` y el PATCH ya están disponibles vía contexto — se elimina el fetch/persist propio y el breadcrumb/título (el layout ya los da), pero se conserva el párrafo explicativo (contenido único, no chrome repetido):

```tsx
'use client';

import TourEditor from '@/components/admin/TourEditor';
import { useUnitShell } from '../unit-shell-context';

export default function AdminUnitTourPage() {
  const { values, patch } = useUnitShell();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500 leading-relaxed">
        Cada ambiente necesita una panorámica 360° (imagen equirectangular). Los &quot;id&quot; de los ambientes acá pueden coincidir con el &quot;Tour node id&quot; que le pusiste a cada ambiente en la pantalla de Ambientes, para que tocar el plano salte directo a la panorámica correspondiente.
      </p>
      <TourEditor initialTourData={values.tourData} onPersist={next => patch({ tourData: next })} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/unidades/[unitId]/tour/page.tsx"
git commit -m "$(cat <<'EOF'
refactor(units): /tour usa el contexto del shell en vez de su propio fetch

Saca el breadcrumb y el h2 propios (ya los da el layout) y persiste
tour_data a través del patch compartido — una sola fuente de verdad
para la unidad mientras se navega entre grupos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `UnitsEditor.tsx` — sacar el panel, navegar al shell

**Files:**
- Modify: `components/admin/UnitsEditor.tsx`

**Interfaces:**
- No produce ni consume nada nuevo — es el consumidor final que deja de tener panel propio y en su lugar navega a las rutas de las Tasks 5-8.

Este archivo (902 líneas antes de esta task) queda así después del cambio:

- [ ] **Step 1: Imports — sacar los que quedan sin uso**

Modificar el bloque de imports (líneas 1-18) quitando `ImageUploader`, `TourSummaryCard` (el panel que los usaba desaparece) y `formatPrice` (solo se usaba para mostrar el precio formateado dentro del panel — `ComercialGroup.tsx`, Task 3, ya lo importa para su propio uso), y agregando `useRouter`:

```tsx
'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { getStatusLabel } from '@/lib/units';
import { parseCsv, downloadCsv } from '@/lib/csv';
import { UNIT_STATUSES } from '@/lib/validate';
import type { UnitStatus, UnitType } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';
```

- [ ] **Step 2: Sacar el estado y la lógica exclusivos del panel**

En el cuerpo del componente (después de `const confirmDialog = useConfirm();`), agregar `const router = useRouter();` y **borrar** estas líneas que solo servían al panel lateral:
- `const [sel, setSel] = useState<string | null>(null);`
- `const [allProjectUnits, setAllProjectUnits] = useState<OtherUnitRow[]>([]);`
- `const [copySourceId, setCopySourceId] = useState('');`
- `const [copying, setCopying] = useState(false);`
- el `useEffect` que carga `allProjectUnits` (bloque completo, líneas ~112-122 del archivo original)
- la constante `otherUnits` (`useMemo` que las filtra)
- la función `handleCopyFromUnit` completa
- dentro de `load()`, la línea `setSel(prev => prev && data.some(u => u.id === prev) ? prev : (data[0]?.id ?? null));` (ya no hay `sel` que mantener)
- al final del componente, `const cur = units.find(u => u.id === sel) ?? null;` y `const curIdx = cur ? units.indexOf(cur) : -1;`

`patch`, `dbShape`, `addUnit`, `duplicateUnits`, `removeUnits`, `bulkStatus` y toda la lógica de CSV **quedan igual** — la tabla, el footer de alta y la barra de bulk actions los siguen usando.

- [ ] **Step 3: Fila de la tabla — navegar en vez de seleccionar**

Cambiar (dentro del `.map(u => ...)` de la vista tabla):

```tsx
// antes
<div
  key={u.id}
  onClick={() => setSel(u.id)}
  className={`flex items-center px-3.5 py-2 border-b border-gray-50 cursor-pointer transition-colors ${isSel ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
>
```

por:

```tsx
// después — ya no hay concepto de "fila seleccionada" (no hay panel que
// mostrarle) — clickear la fila navega directo al shell de esa unidad.
<div
  key={u.id}
  onClick={() => router.push(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}/datos`)}
  className="flex items-center px-3.5 py-2 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"
>
```

y borrar la línea `const isSel = sel === u.id;` de ese mismo bloque (ya no se usa).

En las celdas de edición inline (código y m²), que hacen `e.stopPropagation()` en su span/onClick, agregar también `setSel(u.id)` **se elimina** de esos handlers — ya no existe `setSel`. Por ejemplo:

```tsx
// antes
<span onClick={e => { e.stopPropagation(); setEditingCell({ id: u.id, field: 'code' }); setSel(u.id); }} ...>

// después
<span onClick={e => { e.stopPropagation(); setEditingCell({ id: u.id, field: 'code' }); }} ...>
```

(mismo cambio para el span de `field: 'm2'`).

- [ ] **Step 4: Link "Ambientes" de la fila — apuntar a `/ambientes` explícito**

```tsx
// antes
<Link
  href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`}
  onClick={e => e.stopPropagation()}
  title="Ambientes"
  className="h-7 px-2 flex items-center rounded-md text-[11px] font-medium text-brand-600 hover:bg-brand-50 transition-colors"
>
  Ambientes
</Link>

// después
<Link
  href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}/ambientes`}
  onClick={e => e.stopPropagation()}
  title="Ambientes"
  className="h-7 px-2 flex items-center rounded-md text-[11px] font-medium text-brand-600 hover:bg-brand-50 transition-colors"
>
  Ambientes
</Link>
```

- [ ] **Step 5: Vista grilla — navegar en vez de seleccionar**

```tsx
// antes
<button
  key={u.id} type="button" onClick={() => setSel(u.id)}
  className={`text-left rounded-xl overflow-hidden bg-white transition-colors ${isSel ? 'border-2 border-brand-500 shadow-[0_0_0_3px_rgba(92,122,88,.12)]' : 'border border-gray-200 hover:border-gray-300'}`}
>

// después
<button
  key={u.id} type="button"
  onClick={() => router.push(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}/datos`)}
  className="text-left rounded-xl overflow-hidden bg-white border border-gray-200 hover:border-gray-300 transition-colors"
>
```

(la variable `isSel` de este bloque también se borra si quedó sin uso).

- [ ] **Step 6: Borrar todo el bloque "Panel de edición"**

Borrar desde el comentario `{/* ── Panel de edición ──────────────────────────────────── */}` hasta el `</div>` que cierra ese panel (el segundo hijo directo del `<div className="flex flex-col xl:flex-row ...">` raíz) — es decir, todo el `<div className="w-full xl:w-[400px] shrink-0 xl:h-full">...</div>` con la `Card`, el header del panel, los ~16 bloques de campos, y el footer con "Borrar unidad" + prev/next.

Después de borrarlo, el contenedor raíz queda con un solo hijo (la lista) — simplificar el wrapper para que no reserve espacio para una segunda columna que ya no existe:

```tsx
// antes
return (
  <div className="flex flex-col xl:flex-row gap-6 xl:items-stretch xl:h-[calc(100vh-4rem)]">
    {/* ── Lista ─────────────────────────────────────────────── */}
    <div className="flex-1 min-w-0 w-full flex flex-col gap-4 xl:h-full xl:overflow-hidden">
      ...
    </div>

    {/* ── Panel de edición ──────────────────────────────────── */}
    <div className="w-full xl:w-[400px] shrink-0 xl:h-full">
      ...
    </div>
  </div>
);

// después
return (
  <div className="flex flex-col gap-4 h-[calc(100vh-4rem)]">
    {/* ── Lista ─────────────────────────────────────────────── */}
    <div className="flex-1 min-w-0 w-full flex flex-col gap-4 h-full overflow-hidden">
      ...
    </div>
  </div>
);
```

(el contenido interno de "Lista" —header, CSV, stat cards, búsqueda, bulk bar, tabla/grid, footer de alta— no cambia, solo el wrapper que lo rodeaba).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores. Si aparece `'OtherUnitRow' is declared but never used` u otro tipo/función que quedó huérfano tras los borrados de Step 2, eliminarlo también (`OtherUnitRow` completo si ya no lo usa nada en el archivo).

- [ ] **Step 8: Lint**

Run: `npx eslint components/admin/UnitsEditor.tsx`
Expected: sin errores (puede haber warnings preexistentes no relacionados).

- [ ] **Step 9: Commit**

```bash
git add components/admin/UnitsEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(units): sacar el panel lateral de UnitsEditor, navegar al shell

Clickear una unidad ya no abre un panel de 400px con scroll largo —
navega a su shell de grupos (/datos por defecto). Copiar-de-otra-unidad
se mudó al shell (ver layout.tsx); borrar unidad ya estaba disponible
por fila y por selección múltiple, así que no se duplica ahí.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Arreglar el link de `FloorUnitsEditor` y el comentario de `UnitRoomsEditor`

**Files:**
- Modify: `components/admin/FloorUnitsEditor.tsx:745`
- Modify: `components/admin/UnitRoomsEditor.tsx:34-35` (comentario)

Aunque `FloorUnitsEditor` (el wizard) no se toca en esta fase, su link a "Ambientes" apuntaba al índice de `[unitId]` — que ahora redirige a `/datos` en vez de mostrar Ambientes. Sin este fix, ese botón del wizard se rompe.

- [ ] **Step 1: Arreglar el link en `FloorUnitsEditor.tsx`**

```tsx
// antes (línea 745)
<Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ambientes</Link>

// después
<Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}/ambientes`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ambientes</Link>
```

- [ ] **Step 2: Actualizar el comentario de `UnitRoomsEditor.tsx`**

```tsx
// antes (líneas 34-35)
// (unidades/[unitId]/page.tsx) como embebido como pestaña dentro de

// después
// (unidades/[unitId]/ambientes/page.tsx) como embebido como pestaña dentro de
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/admin/FloorUnitsEditor.tsx components/admin/UnitRoomsEditor.tsx
git commit -m "$(cat <<'EOF'
fix(units): el link a Ambientes del wizard apunta a /ambientes

El índice de unidades/[unitId] ahora redirige a /datos (ver Task 7 del
plan del shell) — sin este fix el botón "Ambientes" del wizard
(FloorUnitsEditor) caía ahí en vez de abrir el editor de ambientes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Verificación manual en el navegador

**Files:** ninguno — solo verificación, sin cambios de código salvo que algo falle.

No hay tests de componentes en este repo (ver Global Constraints), así que esta task es la única red de seguridad para el árbol de rutas completo.

- [ ] **Step 1: Levantar el servidor de desarrollo**

Run: `npm run dev`

- [ ] **Step 2: Correr toda la suite de tests una vez más, de punta a punta**

Run: `npx vitest run`
Expected: PASS — nada de lo tocado en esta fase debería romper tests de otras áreas (project-sections, project-types, etc. no se tocaron).

- [ ] **Step 3: Navegar `/admin/edificios/[id]/pisos/[floorId]` de un edificio con unidades tipo vivienda**

Verificar:
- Clickear una fila de la tabla navega a `.../unidades/[unitId]/datos`.
- El menú lateral muestra 7 grupos (Datos, Superficies, Comercial, Imágenes, Planos, Ambientes, Recorrido 360°) con su punto de estado.
- Cambiar de grupo no refetchea (no parpadea el `LoadingSpinner` al navegar entre grupos de la misma unidad).
- Editar un campo en cualquier grupo (ej. código en Datos) actualiza el punto de estado del menú al volver a esa pantalla.
- Los botones ← → del encabezado navegan a la unidad anterior/siguiente del piso, manteniéndose en el mismo grupo.
- "Copiar de otro depto..." abre el selector, copia los campos, y el toast/indicador "Guardado hace un instante" aparece.
- La franja "Falta marcarlo en el plano" / "Delimitado en el plano" refleja el polígono real de la unidad y su link va a `/plano`.
- `/ambientes` sigue funcionando igual que antes (delimitación de ambientes).
- `/tour` persiste el recorrido 360° correctamente (crear un nodo, guardar, recargar la página y verificar que sigue ahí).
- Entrar por URL directa a `.../unidades/[unitId]/tour` de un **lote** redirige a `/datos` en vez de mostrar una pantalla rota.

- [ ] **Step 4: Navegar un edificio con unidades tipo lote (loteo)**

Verificar: el menú lateral solo muestra Datos, Comercial e Imágenes (Superficies/Planos/Ambientes/Recorrido no aparecen); Datos muestra código + superficie (no modelo/tipología/dormitorios).

- [ ] **Step 5: Verificar el wizard no se rompió**

Navegar `/admin/wizard` con un proyecto tipo casa/loteo hasta la pantalla que usa `FloorUnitsEditor`, y clickear "Ambientes" en la tabla — debe abrir el editor de ambientes (no quedarse en una redirección a `/datos`, que no existe desde el wizard).

- [ ] **Step 6: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos ni de rutas (confirma que las 6 rutas nuevas/movidas están bien formadas).

No hay commit en esta task — si algo falla, se corrige en la task correspondiente de arriba y se vuelve a correr esta verificación.
