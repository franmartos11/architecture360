# Editor de pisos — lista compacta (Fase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la tabla con scroll horizontal de
`app/admin/(authenticated)/(project)/edificios/[id]/page.tsx` (rama
`hasFloorStep`) por una lista compacta de pisos con edición en línea,
filas clickeables, un modal de plano en vez de un `ImageUploader` por
fila, y stat cards que filtran — llevando esa pantalla al mismo lenguaje
visual que la Fase 1 dejó en `UnitsEditor`.

**Architecture:** Tres capas nuevas/modificadas: `lib/floor-status.ts`
(lógica pura de estado/etiqueta), dos componentes UI compartidos
extraídos de `UnitsEditor` (`HeadCheck`, `FilterStat`) más una extensión
`collapsible` de `Accordion`, y un nuevo `components/admin/FloorsEditor.tsx`
que posee toda la sección de pisos (stat cards, lista, alta rápida,
modal de plano), consumido por `edificios/[id]/page.tsx`.

**Tech Stack:** Next.js App Router (client components), React
`useState`/`useMemo`, Tailwind, vitest para los tests de `lib/`.

**Spec:** docs/superpowers/specs/2026-09-13-editor-pisos-lista-design.md

## Global Constraints

- No se toca ningún endpoint de `/api/admin/floors*`: mismos verbos,
  mismo shape de body, que ya usa `edificios/[id]/page.tsx`.
- No se toca la rama `isSingleHouse` ni la rama loteo/dúplex
  (`!hasUnitStep`) de `edificios/[id]/page.tsx` — sólo la rama
  `hasFloorStep`.
- Ningún test de componente: el repo corre vitest con
  `include: ['**/*.test.ts']` (sólo `.ts`, sin `.tsx`). Los tests van en
  `lib/floor-status.test.ts` únicamente.
- Los mensajes de completitud existentes se preservan textualmente: "Sin
  unidades ni plano", "Sin unidades", "Falta el plano", "Completo", y los
  fragmentos "falta el plano" / "N sin foto" / "N sin precio" unidos con
  `" · "`.
- `Accordion`/`AccordionItem` con `collapsible` no especificado debe
  comportarse exactamente igual que hoy (default `false`) — `FloorUnitsEditor.tsx`
  (editor de casa, Fase 2) no cambia de comportamiento.
- Atribución de commits: terminar cada commit con
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` — copiar esta
  línea literal, sin importar el modelo real del implementador.

---

## Task 1: `lib/floor-status.ts`

**Files:**
- Create: `lib/floor-status.ts`
- Test: `lib/floor-status.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FloorStatus = 'complete' | 'partial' | 'empty';

  export interface FloorStatusInput {
    floorKind: FloorKind; // de '@/types/database'
    hasPlan: boolean;
    totalUnits: number;
    missingPhoto: number;
    missingPrice: number;
  }

  export function floorStatus(input: FloorStatusInput): FloorStatus;
  export function floorStatusLabel(input: FloorStatusInput): string;
  ```
  Estas dos funciones y el tipo `FloorStatusInput` son consumidos por
  Task 4 (`FloorsEditor.tsx`).

- [ ] **Step 1: Escribir los tests, deben fallar**

Crear `lib/floor-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { floorStatus, floorStatusLabel, type FloorStatusInput } from './floor-status';

function make(overrides: Partial<FloorStatusInput> = {}): FloorStatusInput {
  return {
    floorKind: 'units',
    hasPlan: true,
    totalUnits: 0,
    missingPhoto: 0,
    missingPrice: 0,
    ...overrides,
  };
}

describe('floorStatus / floorStatusLabel — piso de unidades', () => {
  it('sin plano y sin unidades → empty, "Sin unidades ni plano"', () => {
    const input = make({ hasPlan: false, totalUnits: 0 });
    expect(floorStatus(input)).toBe('empty');
    expect(floorStatusLabel(input)).toBe('Sin unidades ni plano');
  });

  it('con plano y sin unidades → partial, "Sin unidades"', () => {
    const input = make({ hasPlan: true, totalUnits: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('Sin unidades');
  });

  it('con unidades, plano, sin faltantes → complete, "Completo"', () => {
    const input = make({ totalUnits: 12, hasPlan: true, missingPhoto: 0, missingPrice: 0 });
    expect(floorStatus(input)).toBe('complete');
    expect(floorStatusLabel(input)).toBe('Completo');
  });

  it('con unidades y fotos faltantes → partial, "3 sin foto"', () => {
    const input = make({ totalUnits: 12, hasPlan: true, missingPhoto: 3, missingPrice: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('3 sin foto');
  });

  it('con unidades, fotos y precios faltantes → unidos con " · "', () => {
    const input = make({ totalUnits: 12, hasPlan: true, missingPhoto: 3, missingPrice: 2 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('3 sin foto · 2 sin precio');
  });

  it('con unidades pero sin plano → partial, incluye "falta el plano"', () => {
    const input = make({ totalUnits: 12, hasPlan: false, missingPhoto: 0, missingPrice: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('falta el plano');
  });

  it('sin plano, con unidades y con fotos faltantes → todo unido', () => {
    const input = make({ totalUnits: 12, hasPlan: false, missingPhoto: 3, missingPrice: 0 });
    expect(floorStatus(input)).toBe('partial');
    expect(floorStatusLabel(input)).toBe('falta el plano · 3 sin foto');
  });
});

describe('floorStatus / floorStatusLabel — piso que no es de unidades', () => {
  it('con plano → complete, "Completo"', () => {
    const input = make({ floorKind: 'amenity', hasPlan: true, totalUnits: 0 });
    expect(floorStatus(input)).toBe('complete');
    expect(floorStatusLabel(input)).toBe('Completo');
  });

  it('sin plano → empty, "Falta el plano"', () => {
    const input = make({ floorKind: 'amenity', hasPlan: false, totalUnits: 0 });
    expect(floorStatus(input)).toBe('empty');
    expect(floorStatusLabel(input)).toBe('Falta el plano');
  });

  it('las unidades no aplican: 0 unidades con plano sigue siendo complete', () => {
    const input = make({ floorKind: 'technical', hasPlan: true, totalUnits: 0, missingPhoto: 5 });
    expect(floorStatus(input)).toBe('complete');
    expect(floorStatusLabel(input)).toBe('Completo');
  });
});
```

- [ ] **Step 2: Correr los tests, confirmar que fallan**

Run: `npx vitest run lib/floor-status.test.ts`
Expected: FAIL — `Cannot find module './floor-status'` (el archivo no existe todavía).

- [ ] **Step 3: Implementar `lib/floor-status.ts`**

```ts
import type { FloorKind } from '@/types/database';

export type FloorStatus = 'complete' | 'partial' | 'empty';

export interface FloorStatusInput {
  floorKind: FloorKind;
  hasPlan: boolean;
  totalUnits: number;
  missingPhoto: number;
  missingPrice: number;
}

export function floorStatus(input: FloorStatusInput): FloorStatus {
  if (input.floorKind !== 'units') {
    return input.hasPlan ? 'complete' : 'empty';
  }
  if (input.totalUnits === 0) {
    return input.hasPlan ? 'partial' : 'empty';
  }
  const complete = input.hasPlan && input.missingPhoto === 0 && input.missingPrice === 0;
  return complete ? 'complete' : 'partial';
}

export function floorStatusLabel(input: FloorStatusInput): string {
  if (input.floorKind !== 'units') {
    return input.hasPlan ? 'Completo' : 'Falta el plano';
  }
  if (input.totalUnits === 0) {
    return input.hasPlan ? 'Sin unidades' : 'Sin unidades ni plano';
  }
  const parts: string[] = [];
  if (!input.hasPlan) parts.push('falta el plano');
  if (input.missingPhoto > 0) parts.push(`${input.missingPhoto} sin foto`);
  if (input.missingPrice > 0) parts.push(`${input.missingPrice} sin precio`);
  return parts.length === 0 ? 'Completo' : parts.join(' · ');
}
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

Run: `npx vitest run lib/floor-status.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/floor-status.ts lib/floor-status.test.ts
git commit -m "$(cat <<'EOF'
feat(floors): agregar lib/floor-status para el punto de estado y su etiqueta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: extraer `HeadCheck` y `FilterStat` a `components/ui/`

**Files:**
- Create: `components/ui/HeadCheck.tsx`
- Create: `components/ui/FilterStat.tsx`
- Modify: `components/admin/UnitsEditor.tsx:566-589` (borra las dos
  funciones locales, agrega imports, sin cambiar el resto del archivo)

**Interfaces:**
- Produces:
  ```ts
  // components/ui/HeadCheck.tsx
  export function HeadCheck(props: { checked: boolean; onChange: () => void; stop?: boolean }): JSX.Element;

  // components/ui/FilterStat.tsx
  export function FilterStat(props: {
    value: number;
    label: string;
    color?: string;
    active: boolean;
    onClick: () => void;
  }): JSX.Element;
  ```
  Consumidos por Task 4 (`FloorsEditor.tsx`) y, en este mismo task, por
  `UnitsEditor.tsx`.
- Consumes: nada de tasks anteriores.

Este task es una extracción mecánica: mover el marcado exacto de
`UnitsEditor.tsx:566-589` (ver spec, sección E) a dos archivos nuevos, sin
cambiar una sola clase de Tailwind. No hay test de componente porque el
repo no corre `.tsx` en vitest (ver Global Constraints); la verificación
es visual/de diff.

- [ ] **Step 1: Crear `components/ui/HeadCheck.tsx`**

```tsx
export function HeadCheck({ checked, onChange, stop }: { checked: boolean; onChange: () => void; stop?: boolean }) {
  return (
    <span
      className="w-8 shrink-0 flex items-center justify-center cursor-pointer"
      onClick={e => { if (stop) e.stopPropagation(); onChange(); }}
    >
      <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white ${checked ? 'bg-brand-600 border border-brand-600' : 'bg-white border border-gray-300'}`}>
        {checked ? '✓' : ''}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Crear `components/ui/FilterStat.tsx`**

```tsx
export function FilterStat({ value, label, color, active, onClick }: { value: number; label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-1 min-w-[110px] text-left bg-white rounded-xl px-3.5 py-3 border transition-colors ${active ? 'border-brand-500 shadow-[0_0_0_2px_rgba(92,122,88,.12)]' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <p className="text-[19px] font-semibold leading-none" style={{ color: color ?? '#101828' }}>{value}</p>
      <p className="text-[10.5px] text-gray-500 mt-1 leading-tight">{label}</p>
    </button>
  );
}
```

- [ ] **Step 3: Actualizar `components/admin/UnitsEditor.tsx`**

Agregar el import junto a los demás imports de `components/ui/` (cerca de
la línea 8, después de `import { Card } from '@/components/ui/Card';`):

```tsx
import { HeadCheck } from '@/components/ui/HeadCheck';
import { FilterStat } from '@/components/ui/FilterStat';
```

Borrar las definiciones locales de `StatCard` y `HeadCheck` al final del
archivo (líneas 566-589 exactas):

```tsx
function StatCard({ value, label, color, active, onClick }: { value: number; label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-1 min-w-[110px] text-left bg-white rounded-xl px-3.5 py-3 border transition-colors ${active ? 'border-brand-500 shadow-[0_0_0_2px_rgba(92,122,88,.12)]' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <p className="text-[19px] font-semibold leading-none" style={{ color: color ?? '#101828' }}>{value}</p>
      <p className="text-[10.5px] text-gray-500 mt-1 leading-tight">{label}</p>
    </button>
  );
}

function HeadCheck({ checked, onChange, stop }: { checked: boolean; onChange: () => void; stop?: boolean }) {
  return (
    <span
      className="w-8 shrink-0 flex items-center justify-center cursor-pointer"
      onClick={e => { if (stop) e.stopPropagation(); onChange(); }}
    >
      <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white ${checked ? 'bg-brand-600 border border-brand-600' : 'bg-white border border-gray-300'}`}>
        {checked ? '✓' : ''}
      </span>
    </span>
  );
}
```

En el resto del archivo, todo uso de `<StatCard ...>` (hay 4, en las
líneas donde arma la fila de filtros) pasa a `<FilterStat ...>` con las
mismas props — es sólo el nombre del componente, no cambia ninguna prop
ni ningún valor. Buscar `<StatCard` con el editor y reemplazar por
`<FilterStat` en cada ocurrencia.

- [ ] **Step 4: Verificar que compila y los tests siguen en verde**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errores de tsc, mismo conteo de tests que antes de este task
(esta extracción no agrega tests propios).

- [ ] **Step 5: Commit**

```bash
git add components/ui/HeadCheck.tsx components/ui/FilterStat.tsx components/admin/UnitsEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): extraer HeadCheck y FilterStat de UnitsEditor a components/ui

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `Accordion` — agregar `collapsible`

**Files:**
- Modify: `components/ui/Accordion.tsx` (archivo completo, 72 líneas)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  ```ts
  export function Accordion(props: {
    value: string;
    onChange: (value: string) => void;
    collapsible?: boolean; // default false
    children: ReactNode;
  }): JSX.Element;
  ```
  (`AccordionItem` no cambia su firma pública; sólo cambia qué le pasa a
  `ctx.onChange` internamente.) Consumido por Task 4.

`FloorUnitsEditor.tsx` (editor de casa, Fase 2) usa `<Accordion value={casaTab} onChange={setCasaTab}>`
sin pasar `collapsible` — con el default `false` su comportamiento no
cambia: sigue siempre con una sección abierta.

- [ ] **Step 1: Modificar `components/ui/Accordion.tsx`**

Reemplazar el contenido completo del archivo:

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type AccordionStatus = 'complete' | 'partial' | 'empty';

const STATUS_DOT: Record<AccordionStatus, string> = {
  complete: 'bg-brand-500',
  partial: 'bg-amber-400',
  empty: 'bg-gray-200',
};

interface AccordionContextValue {
  value: string;
  onChange: (value: string) => void;
  collapsible: boolean;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

// Acordeón simple, una sola sección abierta a la vez — controlado por
// `value`/`onChange` (el mismo patrón que un tab-switcher, solo cambia la
// presentación visual). Por default no colapsa al reclickear su propia
// cabecera (igual que un tab-switcher); pasar `collapsible` para permitir
// cerrar la sección abierta reclickeándola, útil cuando el contenedor no
// necesita tener siempre algo abierto (ej. una tarjeta de datos plegable).
export function Accordion({ value, onChange, collapsible = false, children }: { value: string; onChange: (value: string) => void; collapsible?: boolean; children: ReactNode }) {
  return (
    <AccordionContext.Provider value={{ value, onChange, collapsible }}>
      <div className="flex flex-col gap-3">{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value, label, status, badge, children,
}: {
  value: string;
  label: string;
  /** Punto de estado — omitilo si la sección no tiene un criterio de "completo" claro. */
  status?: AccordionStatus;
  /** Badge chico a la derecha del label (ej. "3/4", conteo de ambientes). Omitilo si no aplica. */
  badge?: string;
  children: ReactNode;
}) {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('AccordionItem debe usarse dentro de <Accordion>');
  const open = ctx.value === value;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => ctx.onChange(open && ctx.collapsible ? '' : value)}
        aria-expanded={open}
        className="w-full h-12 px-4 flex items-center gap-3 text-left hover:bg-gray-50/60 transition-colors"
      >
        {status && <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />}
        <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
        {badge && (
          <span className="h-[19px] min-w-[19px] px-1.5 rounded-md flex items-center justify-center text-[10px] font-semibold bg-gray-100 text-gray-600 shrink-0">
            {badge}
          </span>
        )}
        <span className={`text-gray-400 text-xs transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 flex flex-col gap-3.5">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila y que `FloorUnitsEditor` no cambió de comportamiento**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errores de tsc, mismo conteo de tests (este componente no
tiene test propio — el repo no corre `.tsx`).

Verificación manual de no-regresión (no hay test automatizado posible
para esto): abrir el editor de casa en el navegador y confirmar que
clickear la sección ya abierta NO la cierra — sigue habiendo siempre una
sección visible, igual que antes de este cambio.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Accordion.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Accordion admite collapsible para permitir cerrar la sección abierta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `components/admin/FloorsEditor.tsx` + `FloorPlanModal.tsx`

**Files:**
- Create: `components/admin/FloorPlanModal.tsx`
- Create: `components/admin/FloorsEditor.tsx`

**Interfaces:**
- Consumes:
  - `floorStatus`, `floorStatusLabel`, `type FloorStatusInput` de
    `@/lib/floor-status` (Task 1)
  - `HeadCheck` de `@/components/ui/HeadCheck`, `FilterStat` de
    `@/components/ui/FilterStat` (Task 2)
  - `FLOOR_KIND_OPTIONS` de `@/lib/floorKinds` (ya existe, ver
    `lib/floorKinds.ts`)
  - `FloorRow`, `FloorKind` de `@/types/database`
  - `DuplicateFloorModal` de `@/components/admin/DuplicateFloorModal`
    (ya existe, props `{ floor: FloorLike; onClose: () => void; onDone: (result: { created: number; unitsCopied: number }) => void }`)
  - `ApplyTemplateModal` de `@/components/admin/ApplyTemplateModal` (ya
    existe, no se modifica en este plan)
  - `useToast` de `@/components/ui/ToastProvider`
  - `useConfirm` de `@/components/ui/ConfirmProvider`
  - `TransitionLink as Link` de `@/components/ui/TransitionUtils`
- Produces:
  ```ts
  // components/admin/FloorPlanModal.tsx
  export default function FloorPlanModal(props: {
    floor: Pick<FloorRow, 'id' | 'label' | 'plan_image'>;
    onClose: () => void;
    onSave: (url: string) => void;
  }): JSX.Element;

  // components/admin/FloorsEditor.tsx
  interface FloorUnitSummary {
    floor_id: string;
    interior_image_url: string | null;
    price: number | null;
  }
  export default function FloorsEditor(props: {
    buildingId: string;
    floors: FloorRow[];
    unitSummaries: FloorUnitSummary[];
    showPrice: boolean;
    onChanged: () => void;
  }): JSX.Element;
  ```
  Consumido por Task 5 (`edificios/[id]/page.tsx`).

`FloorUnitSummary` y la lógica de `completeness()` (missingPhoto,
missingPrice respetando `showPrice`) son las mismas que hoy viven en
`edificios/[id]/page.tsx:23-27,81-89` — se mueven a este componente
porque pasan a ser responsabilidad suya, no de la página contenedora.

- [ ] **Step 1: Crear `components/admin/FloorPlanModal.tsx`**

Modal de una sola imagen, mismo patrón visual que
`components/admin/DuplicateFloorModal.tsx` (overlay + caja + click fuera
cierra):

```tsx
'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import Button from '@/components/ui/Button';
import type { FloorRow } from '@/types/database';

// Modal de un único ImageUploader para el plano de un piso — reemplaza
// tener un ImageUploader completo (drag&drop, preview, estado de subida)
// montado permanentemente en cada fila de la lista de pisos.
export default function FloorPlanModal({
  floor, onClose, onSave,
}: {
  floor: Pick<FloorRow, 'id' | 'label' | 'plan_image'>;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Plano de {floor.label}</h3>
        </div>
        <div className="p-6 space-y-4">
          <ImageUploader
            value={floor.plan_image ?? ''}
            onChange={onSave}
            folder="floorplans"
          />
          <Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `components/admin/FloorsEditor.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { Card } from '@/components/ui/Card';
import { HeadCheck } from '@/components/ui/HeadCheck';
import { FilterStat } from '@/components/ui/FilterStat';
import DuplicateFloorModal from '@/components/admin/DuplicateFloorModal';
import ApplyTemplateModal from '@/components/admin/ApplyTemplateModal';
import FloorPlanModal from '@/components/admin/FloorPlanModal';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { FLOOR_KIND_OPTIONS } from '@/lib/floorKinds';
import { floorStatus, floorStatusLabel } from '@/lib/floor-status';
import type { FloorRow, FloorKind } from '@/types/database';

type Floor = Pick<FloorRow, 'id' | 'number' | 'label' | 'plan_image' | 'floor_kind' | 'floor_kind_description'>;
interface FloorUnitSummary {
  floor_id: string;
  interior_image_url: string | null;
  price: number | null;
}
type Filter = 'all' | 'noPlan' | 'noUnits';

// Editor de pisos de un edificio — lista compacta con edición en línea,
// fila clickeable a las unidades del piso, y un modal de plano en vez de
// un ImageUploader por fila (ver FloorPlanModal). Es a los pisos lo que
// UnitsEditor.tsx es a las unidades: misma densidad, mismo patrón de
// stat cards que filtran, misma alta rápida al pie de la lista.
export default function FloorsEditor({
  buildingId, floors, unitSummaries, showPrice, onChanged,
}: {
  buildingId: string;
  floors: Floor[];
  unitSummaries: FloorUnitSummary[];
  showPrice: boolean;
  onChanged: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'label' | 'description' } | null>(null);
  const [planTarget, setPlanTarget] = useState<Floor | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Floor | null>(null);
  const [applyTemplateTarget, setApplyTemplateTarget] = useState<Floor | null>(null);
  const [newFloor, setNewFloor] = useState({ number: '', label: '', floorKind: 'units' as FloorKind });
  const toast = useToast();
  const confirmDialog = useConfirm();

  const completeness = (floorId: string) => {
    const floorUnits = unitSummaries.filter(u => u.floor_id === floorId);
    const missingPhoto = floorUnits.filter(u => !u.interior_image_url).length;
    // En modo showcase el precio no es un dato que vaya a cargarse nunca —
    // contarlo como "faltante" nunca dejaba llegar a "Completo" aunque el
    // resto sí estuviera (ver edificios/[id]/page.tsx, misma regla).
    const missingPrice = showPrice ? floorUnits.filter(u => u.price == null).length : 0;
    return { total: floorUnits.length, missingPhoto, missingPrice };
  };

  const handleUpdateFloor = async (floorId: string, updates: Partial<Floor>) => {
    const res = await fetch(`/api/admin/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: updates.label,
        planImage: updates.plan_image,
        floorKind: updates.floor_kind,
        floorKindDescription: updates.floor_kind_description,
      }),
    });
    if (res.ok) onChanged();
    else toast('Error al actualizar el piso.', 'error');
  };

  const handleDeleteFloor = async (floorId: string) => {
    const ok = await confirmDialog({ message: '¿Borrar este piso y todas sus unidades?', confirmLabel: 'Borrar piso', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/floors/${floorId}`, { method: 'DELETE' });
    if (res.ok) onChanged();
  };

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newFloor.number === '' || !newFloor.label) return;
    const res = await fetch('/api/admin/floors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingId,
        number: Number(newFloor.number),
        label: newFloor.label,
        floorKind: newFloor.floorKind,
      }),
    });
    if (res.ok) {
      setNewFloor({ number: '', label: '', floorKind: 'units' });
      onChanged();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Error al crear el piso.', 'error');
    }
  };

  const toggleSel = (floorId: string) => setSel(prev => {
    const next = new Set(prev);
    if (next.has(floorId)) next.delete(floorId); else next.add(floorId);
    return next;
  });
  const visibleFloorIds = floors.map(f => f.id);
  const allSelected = sel.size > 0 && visibleFloorIds.every(id => sel.has(id));
  const toggleSelAll = () => setSel(allSelected ? new Set() : new Set(visibleFloorIds));

  const bulkDeleteFloors = async () => {
    const ok = await confirmDialog({
      message: `¿Borrar ${sel.size} piso${sel.size === 1 ? '' : 's'} y todas sus unidades? No se puede deshacer.`,
      confirmLabel: 'Borrar', danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    await Promise.all(Array.from(sel).map(floorId => fetch(`/api/admin/floors/${floorId}`, { method: 'DELETE' })));
    setBulkBusy(false);
    setSel(new Set());
    onChanged();
  };

  const noPlanCount = floors.filter(f => !f.plan_image).length;
  const noUnitsCount = floors.filter(f => f.floor_kind === 'units' && completeness(f.id).total === 0).length;
  const visible = floors.slice().sort((a, b) => a.number - b.number).filter(f => {
    if (filter === 'noPlan') return !f.plan_image;
    if (filter === 'noUnits') return f.floor_kind === 'units' && completeness(f.id).total === 0;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 flex-wrap">
        <FilterStat value={floors.length} label="pisos cargados" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterStat value={noPlanCount} label="sin plano" color={noPlanCount ? '#8a6118' : undefined} active={filter === 'noPlan'} onClick={() => setFilter('noPlan')} />
        <FilterStat value={noUnitsCount} label="sin unidades" color={noUnitsCount ? '#8a6118' : undefined} active={filter === 'noUnits'} onClick={() => setFilter('noUnits')} />
      </div>

      <Card>
        {sel.size > 0 && (
          <div className="mx-4 mt-4 bg-gray-900 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <p className="flex-1 min-w-[140px] text-sm font-medium text-white">{sel.size} piso{sel.size === 1 ? '' : 's'} seleccionado{sel.size === 1 ? '' : 's'}</p>
            <button type="button" onClick={bulkDeleteFloors} disabled={bulkBusy} className="h-8 px-2.5 border border-red-400/50 rounded-lg text-xs font-medium text-red-300 hover:bg-red-500/15 transition-colors disabled:opacity-50">Borrar</button>
            <button type="button" onClick={() => setSel(new Set())} aria-label="Deseleccionar todo" className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white">×</button>
          </div>
        )}

        <div className="flex items-center px-3.5 h-9 border-b border-gray-100 bg-gray-50/60">
          <HeadCheck checked={allSelected} onChange={toggleSelAll} />
          <span className="w-5 shrink-0" />
          <span className="w-10 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">N°</span>
          <span className="w-44 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Etiqueta</span>
          <span className="w-40 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Tipo</span>
          <span className="w-14 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Plano</span>
          <span className="flex-1 min-w-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Completitud</span>
        </div>

        <div>
          {visible.map(f => {
            const c = completeness(f.id);
            const isUnitsFloor = f.floor_kind === 'units';
            const status = floorStatus({ floorKind: f.floor_kind, hasPlan: !!f.plan_image, totalUnits: c.total, missingPhoto: c.missingPhoto, missingPrice: c.missingPrice });
            const label = floorStatusLabel({ floorKind: f.floor_kind, hasPlan: !!f.plan_image, totalUnits: c.total, missingPhoto: c.missingPhoto, missingPrice: c.missingPrice });
            const statusDot = status === 'complete' ? 'bg-brand-500' : status === 'partial' ? 'bg-amber-400' : 'bg-gray-200';
            const editingLabel = editingCell?.id === f.id && editingCell.field === 'label';
            const editingDescription = editingCell?.id === f.id && editingCell.field === 'description';

            return (
              <Link
                key={f.id}
                href={`/admin/edificios/${buildingId}/pisos/${f.id}`}
                className="flex items-center px-3.5 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <HeadCheck checked={sel.has(f.id)} onChange={() => toggleSel(f.id)} stop />
                <span className="w-5 shrink-0 flex items-center justify-center">
                  <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                </span>
                <span className="w-10 shrink-0 text-xs text-gray-600">{f.number}</span>
                <span className="w-44 shrink-0 pr-2" onClick={e => e.preventDefault()}>
                  {editingLabel ? (
                    <input
                      autoFocus defaultValue={f.label}
                      onClick={e => e.stopPropagation()}
                      onBlur={e => { if (e.target.value !== f.label) handleUpdateFloor(f.id, { label: e.target.value }); setEditingCell(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="h-7 w-full px-1.5 border border-brand-500 rounded text-xs outline-none"
                    />
                  ) : (
                    <span onClick={e => { e.stopPropagation(); setEditingCell({ id: f.id, field: 'label' }); }} className="inline-flex h-7 items-center px-1.5 rounded hover:bg-gray-100 text-xs text-gray-900 w-full truncate">
                      {f.label}
                    </span>
                  )}
                  {!isUnitsFloor && (
                    editingDescription ? (
                      <input
                        autoFocus defaultValue={f.floor_kind_description ?? ''}
                        placeholder="Ej: Pileta y solárium"
                        onClick={e => e.stopPropagation()}
                        onBlur={e => { if (e.target.value !== (f.floor_kind_description ?? '')) handleUpdateFloor(f.id, { floor_kind_description: e.target.value }); setEditingCell(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="mt-1 h-6 w-full px-1.5 border border-brand-500 rounded text-[11px] outline-none"
                      />
                    ) : (
                      <span onClick={e => { e.stopPropagation(); setEditingCell({ id: f.id, field: 'description' }); }} className="mt-0.5 block text-[11px] text-gray-400 hover:text-gray-600 truncate">
                        {f.floor_kind_description || 'Agregar descripción…'}
                      </span>
                    )
                  )}
                </span>
                <span className="w-40 shrink-0 pr-2" onClick={e => e.stopPropagation()}>
                  <select
                    value={f.floor_kind}
                    onChange={e => handleUpdateFloor(f.id, { floor_kind: e.target.value as FloorKind })}
                    aria-label="Tipo de piso"
                    className="w-full h-7 text-xs border border-gray-200 rounded-lg px-1.5 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  >
                    {FLOOR_KIND_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                    ))}
                  </select>
                </span>
                <span className="w-14 shrink-0" onClick={e => { e.preventDefault(); e.stopPropagation(); setPlanTarget(f); }}>
                  {f.plan_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.plan_image} alt="" className="w-14 h-10 object-cover rounded-lg border border-gray-200 cursor-pointer" />
                  ) : (
                    <span className="w-14 h-10 flex items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 text-[10px] cursor-pointer hover:border-gray-400">+ plano</span>
                  )}
                </span>
                <span className="flex-1 min-w-0 text-xs">
                  <span className="text-gray-600">{isUnitsFloor ? `${c.total} unidad${c.total === 1 ? '' : 'es'} · ` : ''}</span>
                  <span className={status === 'complete' ? 'text-green-600' : status === 'partial' ? 'text-amber-600' : 'text-gray-400'}>{label}</span>
                </span>
                <span className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button type="button" title="Duplicar" onClick={e => { e.preventDefault(); setDuplicateTarget(f); }} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">⧉</button>
                  {isUnitsFloor && c.total === 0 && floors.length > 1 && (
                    <button type="button" title="Aplicar plantilla" onClick={e => { e.preventDefault(); setApplyTemplateTarget(f); }} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">▦</button>
                  )}
                  <button type="button" title="Borrar" onClick={e => { e.preventDefault(); handleDeleteFloor(f.id); }} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">×</button>
                </span>
              </Link>
            );
          })}
          {visible.length === 0 && (
            <div className="py-11 flex flex-col items-center gap-1.5 text-center px-6">
              <p className="text-sm font-medium text-gray-900">Ningún piso coincide con este filtro</p>
              <button type="button" onClick={() => setFilter('all')} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ver todos los pisos</button>
            </div>
          )}
        </div>

        <form onSubmit={handleAddFloor} className="flex items-center gap-2 px-3.5 py-2 bg-gray-50/60 border-t border-gray-100">
          <span className="w-6 text-center text-gray-300">+</span>
          <input
            type="number" value={newFloor.number}
            onChange={e => setNewFloor({ ...newFloor, number: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.form?.requestSubmit(); }}
            placeholder="N°"
            aria-label="Número de piso"
            className="h-8 w-16 px-2 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={newFloor.label}
            onChange={e => setNewFloor({ ...newFloor, label: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.form?.requestSubmit(); }}
            placeholder="Etiqueta (ej: Planta 1)"
            aria-label="Etiqueta del piso"
            className="h-8 flex-1 min-w-[140px] px-2.5 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={newFloor.floorKind}
            onChange={e => setNewFloor({ ...newFloor, floorKind: e.target.value as FloorKind })}
            aria-label="Tipo de piso"
            className="h-8 px-2 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            {FLOOR_KIND_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
            ))}
          </select>
          <button
            type="submit" disabled={newFloor.number === '' || !newFloor.label}
            className="h-8 px-3.5 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors whitespace-nowrap"
          >
            + Agregar piso
          </button>
        </form>
      </Card>

      {planTarget && (
        <FloorPlanModal
          floor={planTarget}
          onClose={() => setPlanTarget(null)}
          onSave={url => { handleUpdateFloor(planTarget.id, { plan_image: url }); setPlanTarget(prev => (prev ? { ...prev, plan_image: url } : prev)); }}
        />
      )}
      {duplicateTarget && (
        <DuplicateFloorModal
          floor={duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onDone={() => { setDuplicateTarget(null); onChanged(); }}
        />
      )}
      {applyTemplateTarget && (
        <ApplyTemplateModal
          buildingId={buildingId}
          targetFloor={applyTemplateTarget}
          onClose={() => setApplyTemplateTarget(null)}
          onDone={() => { setApplyTemplateTarget(null); onChanged(); }}
        />
      )}
    </div>
  );
}
```

Nota de implementación: `FloorPlanModal.onSave` actualiza el piso en el
servidor (`handleUpdateFloor`) y además refresca `planTarget` en el
propio estado local del modal para que su preview muestre la imagen
recién subida sin esperar el round-trip de `onChanged` → refetch del
padre.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Este componente no tiene test propio — ver Global
Constraints; se verifica en Task 5 junto con la integración completa.)

- [ ] **Step 4: Commit**

```bash
git add components/admin/FloorPlanModal.tsx components/admin/FloorsEditor.tsx
git commit -m "$(cat <<'EOF'
feat(floors): agregar FloorsEditor y FloorPlanModal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: integrar `FloorsEditor` en `edificios/[id]/page.tsx`

**Files:**
- Modify: `app/admin/(authenticated)/(project)/edificios/[id]/page.tsx`
  (archivo completo, 614 líneas — cambios en las líneas 259-298 y
  300-500; el resto del archivo, incluidas las ramas `isSingleHouse` y
  `!hasUnitStep`, no se toca)

**Interfaces:**
- Consumes: `FloorsEditor` (default export) de
  `@/components/admin/FloorsEditor` (Task 4); `Accordion`,
  `AccordionItem` de `@/components/ui/Accordion` con `collapsible` (Task 3)

Este task reemplaza el bloque de "Datos del edificio" (hoy siempre
visible) por una `AccordionItem` colapsable, y todo el bloque
`hasFloorStep ? (...tabla y form de alta...) : ...` por
`hasFloorStep ? <FloorsEditor .../> : ...`.

- [ ] **Step 1: Agregar el import de `FloorsEditor` y de `Accordion`/`AccordionItem`**

En `app/admin/(authenticated)/(project)/edificios/[id]/page.tsx`, junto a
los imports existentes (después de la línea
`import { Card, CardHeader } from '@/components/ui/Card';`):

```tsx
import FloorsEditor from '@/components/admin/FloorsEditor';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
```

Agregar también un estado para qué sección del acordeón de datos del
edificio está abierta, junto a los demás `useState` del componente (cerca
de la línea 49, después de `const [sel, setSel] = useState<Set<string>>(new Set());`):

```tsx
const [buildingTab, setBuildingTab] = useState(building?.cover_image ? '' : 'datos');
```

Como `building` es `null` en el primer render (antes de que `load()`
resuelva), este valor inicial siempre da `'datos'` (abierto) la primera
vez — eso está bien: evita un flash de contenido colapsado que se abre
solo un instante después. Agregar, justo después de que `load()` setea
`building` (dentro del `.then` de `load`, después de
`setBuilding(data.building);`):

```tsx
setBuildingTab(prev => (prev === 'datos' && data.building?.cover_image ? '' : prev));
```

Esto colapsa la sección automáticamente sólo si arrancó abierta por el
valor inicial y la carga confirma que ya hay foto — si el usuario ya la
abrió a mano no se le cierra sola.

- [ ] **Step 2: Reemplazar la tarjeta "Datos del edificio" por una sección plegable**

Reemplazar el bloque completo (líneas 259-298, desde `<Card>` que abre
"Datos {hasFloorStep ...}" hasta el `</Card>` que lo cierra, inclusive el
párrafo de `hasFloorStep && (...)`) por:

```tsx
      <Accordion value={buildingTab} onChange={setBuildingTab} collapsible>
        <AccordionItem
          value="datos"
          label={`Datos ${hasFloorStep ? 'del edificio' : `${agree.del} ${buildingLabelLower}`}`}
          status={building.cover_image ? 'complete' : 'partial'}
        >
          <form onSubmit={handleSaveBuilding} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <Input
                  label="Nombre"
                  value={building.name}
                  onChange={e => setBuilding({ ...building, name: e.target.value })}
                />
              </div>
              {hasFloorStep && (
                <div className="w-full sm:w-40">
                  <Input
                    label="Pisos declarados"
                    type="number" min={1}
                    value={building.total_floors}
                    onChange={e => setBuilding({ ...building, total_floors: Number(e.target.value) })}
                  />
                </div>
              )}
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
            <ImageUploader
              label={hasFloorStep ? 'Foto del edificio' : `Foto ${agree.del} ${buildingLabelLower}`}
              value={building.cover_image ?? ''}
              onChange={url => setBuilding({ ...building, cover_image: url })}
              folder="buildings"
            />
            {hasFloorStep && (
              <p className="text-xs text-gray-500">
                &quot;Pisos declarados&quot; es solo informativo (para saber cuántos faltan cargar); los pisos reales del sitio son los de la tabla de abajo. La foto no se guarda sola, hacé click en &quot;Guardar&quot;.
              </p>
            )}
          </form>
        </AccordionItem>
      </Accordion>
```

Nota: `CardHeader` deja de usarse en este bloque (la cabecera ahora la da
`AccordionItem`), pero sigue usada en el resto del archivo (la tarjeta
"Pisos" original desaparece en el próximo paso, y las ramas
`!hasUnitStep`/`isSingleHouse` más abajo también usan `CardHeader` — no
tocarlas). No borrar el import de `CardHeader`.

- [ ] **Step 3: Reemplazar el bloque de tabla + alta de piso por `FloorsEditor`**

Reemplazar todo el bloque `{hasFloorStep ? (` ... `) : !hasUnitStep ? (`
(desde la línea que abre con `<>` después de `{hasFloorStep ? (` — es
decir, desde el `<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">`
de los `StatCard` viejos — hasta el `</>` que cierra esa rama, líneas
300-500 del archivo original) manteniendo intactos el aviso ámbar de
pisos faltantes (líneas 308-324 originales) y el `StatCard` de arriba con
`floors.length`/`building.total_floors`/`totalUnits`/`readyFloors` — ese
trío describe "declarado vs. cargado", que no es un filtro y por eso no
pasa a `FilterStat` (ver spec, punto A.3). Sólo se quita la tarjeta
"Pisos" (tabla + formulario de alta), que pasa a `FloorsEditor`:

```tsx
      {hasFloorStep ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard value={`${floors.length} / ${building.total_floors}`} label="pisos cargados de los declarados" warn={floors.length < building.total_floors} />
            <StatCard value={`${floorsWithPlan} / ${floors.length}`} label="pisos con su plano subido" warn={floorsWithPlan < floors.length} />
            <StatCard value={String(totalUnits)} label={totalUnits ? `unidades en ${readyFloors} pisos publicables` : 'unidades — todavía ninguna'} warn={totalUnits === 0} />
          </div>

          {(missingFloors > 0 || floorsWithoutPlan > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
              <p className="flex-1 min-w-[220px] text-sm text-amber-800">
                {missingFloors > 0
                  ? `Declaraste ${building.total_floors} pisos y tenés ${floors.length} cargados. Puedo crear los ${missingFloors} que faltan, vacíos y numerados.`
                  : `${floorsWithoutPlan} piso${floorsWithoutPlan === 1 ? '' : 's'} todavía no ${floorsWithoutPlan === 1 ? 'tiene' : 'tienen'} plano: el sitio no puede mostrar sus deptos hasta que lo subas.`}
              </p>
              {missingFloors > 0 && (
                <button
                  type="button" onClick={generateMissingFloors} disabled={generating}
                  className="h-8 px-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors shrink-0"
                >
                  {generating ? 'Creando...' : `Crear los ${missingFloors} pisos`}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Pisos</h3>
              <p className="text-sm text-gray-500">Cada piso necesita su plano para que el sitio pueda mostrar los deptos.</p>
            </div>
            <Link
              href={`/admin/wizard?buildingId=${id}&step=piso`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0"
            >
              🪄 Usar el asistente →
            </Link>
          </div>

          <FloorsEditor
            buildingId={id}
            floors={floors}
            unitSummaries={unitSummaries}
            showPrice={typeConfig.showPrice}
            onChanged={load}
          />
        </>
      ) : !hasUnitStep ? (
```

El resto del archivo (la rama `!hasUnitStep` que sigue, la rama final
`else` de loteo/dúplex, los modales `duplicateTarget`/`applyTemplateTarget`
al final, y `function StatCard(...)`) no cambia. `StatCard` local sigue
usándose para el trío "declarado vs. cargado" de este mismo bloque, así
que no se borra en este task (a diferencia del `StatCard` de
`UnitsEditor.tsx`, que Task 2 sí borró porque ahí no quedaba ningún uso).

`duplicateTarget`/`applyTemplateTarget`/`setDuplicateTarget`/`setApplyTemplateTarget`
(declarados en la línea 153-154 original) y sus modales al final del
archivo (líneas 587-602 originales) dejan de usarse en `page.tsx` — esa
responsabilidad pasó a `FloorsEditor`. Borrar esas dos líneas de
`useState` y el bloque JSX de los dos modales al final del archivo (antes
del `</div>` de cierre), ya que sin ellos quedarían variables sin uso
(error de `tsc`/`eslint`).

El alta de piso también se movió por completo a `FloorsEditor` (su propio
formulario y su propio `useState`), así que estos tres quedan sin ningún
uso en `page.tsx` y hay que borrarlos: el estado
`const [newFloor, setNewFloor] = useState({ number: '', label: '', planImage: '', floorKind: 'units' as DbFloorRow['floor_kind'], floorKindDescription: '' });`
(línea 51 original), y la función completa `handleAddFloor` (líneas
104-126 originales, desde `const handleAddFloor = async (e: React.FormEvent) => {`
hasta su `};` de cierre). `handleUpdateFloor` y `generateMissingFloors`
NO se borran: `handleUpdateFloor` lo sigue usando la rama loteo/dúplex más
abajo (`!hasUnitStep`) para el plano del piso único, y
`generateMissingFloors` lo sigue usando el aviso ámbar que se mantiene en
este mismo bloque.

- [ ] **Step 4: Verificar que compila y los tests pasan**

Run: `npx tsc --noEmit && npx eslint app/admin/\(authenticated\)/\(project\)/edificios/\[id\]/page.tsx && npx vitest run`
Expected: 0 errores de tsc, 0 warnings nuevos de eslint, mismo conteo de
tests que en Task 1 (este task no agrega tests propios — es integración
de componente, ver Global Constraints).

- [ ] **Step 5: Verificación manual en el navegador**

Si el navegador está disponible (chrome-devtools-mcp): abrir un edificio
con `hasFloorStep` (torre de deptos) y confirmar:
- la sección "Datos del edificio" arranca colapsada si ya hay foto, y se
  puede volver a abrir y cerrar clickeando su cabecera;
- los tres `FilterStat` de arriba (`pisos cargados`/`sin plano`/`sin
  unidades`) filtran la lista al clickearlos;
- clickear una fila navega a las unidades de ese piso;
- clickear la miniatura de plano (o el recuadro "+ plano") abre el modal,
  y subir una imagen ahí actualiza la miniatura sin recargar la página;
- clickear la etiqueta la vuelve editable, `Enter`/blur guarda;
- el alta rápida al pie de la lista crea un piso nuevo.

Si el navegador no está disponible (perfil de Chrome tomado por otra
sesión, ver ledger de las Fases 1 y 2): documentar el gap y seguir sólo
con la verificación automatizada — es el mismo caso ya aceptado dos veces
antes en este proyecto.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(authenticated)/(project)/edificios/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
refactor(floors): reemplazar la tabla de pisos por FloorsEditor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificación final (whole-branch, antes de finishing-a-development-branch)

- `npx vitest run` → todos los tests en verde, incluidos los 11 nuevos de
  `lib/floor-status.test.ts`.
- `npx tsc --noEmit` → 0 errores.
- `npm run build` → exit 0.
- Recorrido manual en navegador (o gap documentado si el perfil de Chrome
  sigue tomado por otra sesión, igual que en las Fases 1 y 2).
