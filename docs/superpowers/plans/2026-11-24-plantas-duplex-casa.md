# Plano y render por planta (dúplex y casa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar plano + render de cada planta de una unidad multinivel desde el admin; en dúplex, una vez por modelo y aplicado a todas sus unidades.

**Architecture:** Lógica pura de plantas en `lib/unit-levels.ts` (nombres, normalizar `levels`, leer/completar casilleros sin pisar, separar ambientes de casa por planta). La API de carga guiada aprende a leer/escribir `room_plan_image`, `floor_plan_3d_url` y `levels`. Tres UIs la consumen: paso nuevo del flujo Dúplex, sección Planos de la ficha de unidad y paso Ambientes del flujo Casa.

**Tech Stack:** Next.js (app router), React, TypeScript, Supabase, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-plantas-duplex-casa-design.md`

## Global Constraints

- Trabajar directo en `main` de `my-app`; sin worktrees ni ramas.
- **No commitear ni pushear** hasta que el usuario lo pida (los pasos "Commit" quedan como checkpoint local: `git add` nada más).
- Nunca pisar un casillero ya cargado: aplicar a varias unidades solo completa vacíos.
- Mapeo de casilleros: planta 0 = planta baja → plano `room_plan_image`, render `floor_plan_3d_url`; planta k≥1 → `levels[k-1].planImage` / `levels[k-1].plan3dImage`.
- Nombres: con `floorsCount === 2` la planta extra se llama "Planta alta"; con más, "Piso 1", "Piso 2"…; un nivel existente conserva su `label`.
- Al escribir `levels`, conservar `id`, `label`, `rooms` y demás campos de los niveles existentes. Nunca recortar niveles existentes aunque `floorsCount` haya bajado.
- No probar en el navegador escribiendo en Supabase compartida (los inputs del admin autoguardan).

## Review Focus

1. Unidad con `levels` null / más corto que `floors_count - 1` → los casilleros de plantas faltantes se tratan como vacíos y se crean al aplicar (test en Task 1).
2. Unidades del mismo modelo con `floors_count` distinto → el paso muestra el máximo y solo escribe plantas que la unidad tiene según `max(floors_count-1, levels.length)` (test en Task 1).
3. Unidad con un render distinto ya cargado → se mantiene y aparece en `kept` (test en Task 1).
4. Casa con datos viejos `group: 'pa'` en `rooms` → cae en la primera planta extra al cargar y se mueve a `levels[0].rooms` al guardar (test en Task 5).
5. `levels` malformado por PATCH (sin `id`, `rooms` no array) → 400, nada se escribe (test en Task 2).

---

### Task 1: Lógica pura de plantas

**Files:**
- Create: `lib/unit-levels.ts`
- Test: `lib/unit-levels.test.ts`

**Interfaces:**
- Consumes: `UnitLevel` de `@/types`.
- Produces:
  - `levelLabel(index: number, floorsCount: number): string` — `index` 1-based de planta extra.
  - `plantaLabel(planta: number, floorsCount: number): string` — 0 → "Planta baja", k → `levelLabel(k, floorsCount)`.
  - `ensureLevels(levels: UnitLevel[] | null | undefined, floorsCount: number): UnitLevel[]` — largo `max(levels.length, floorsCount-1)`; nuevos `{ id: 'piso-k', label: levelLabel(k), planImage: null, plan3dImage: null, rooms: [] }`.
  - `type SlotKind = 'plano' | 'render'`
  - `interface LevelUnitLike { code: string; floors_count: number; room_plan_image: string | null; floor_plan_3d_url: string | null; levels: UnitLevel[] | null }`
  - `readSlot(u: LevelUnitLike, planta: number, kind: SlotKind): string | null`
  - `modelSlotValue(units: LevelUnitLike[], planta: number, kind: SlotKind): { value: string | null; differing: string[] }` — `value` = primer valor no vacío; `differing` = códigos con un valor no vacío distinto de `value`.
  - `type PlantaValues = { plano?: string | null; render?: string | null }[]` (índice = planta)
  - `fillPlantas(u: LevelUnitLike, values: PlantaValues): { patch: { roomPlanImage?: string; floorPlan3dUrl?: string; levels?: UnitLevel[] }; kept: { planta: number; kind: SlotKind }[]; filled: number }` — solo plantas `< max(u.floors_count, u.levels.length+1)`; `levels` en el patch solo si cambió algún nivel.

- [ ] **Step 1: Tests que fallan** — en `lib/unit-levels.test.ts`:
  - `levelLabel(1, 2) === 'Planta alta'`, `levelLabel(2, 3) === 'Piso 2'`, `plantaLabel(0, 3) === 'Planta baja'`.
  - `ensureLevels(null, 3)` → 2 niveles `piso-1`/`piso-2` con labels "Piso 1"/"Piso 2"; `ensureLevels([{id:'x',label:'Altillo',planImage:'p',rooms:[r]}], 2)` → mismo objeto preservado; `ensureLevels([a,b], 2)` → largo 2 (no recorta).
  - `readSlot` en planta 0/1 para ambos kinds; planta 1 con `levels: null` → `null`.
  - `modelSlotValue` con `[A:'r1', B:null, C:'r2']` → `{ value:'r1', differing:['C'] }`.
  - `fillPlantas` unidad vacía de 2 plantas con `[{plano:'p0',render:'r0'},{plano:'p1',render:'r1'}]` → patch `{roomPlanImage:'p0', floorPlan3dUrl:'r0', levels:[{id:'piso-1',label:'Planta alta',planImage:'p1',plan3dImage:'r1',rooms:[]}]}`, `filled: 4`, `kept: []`.
  - `fillPlantas` con `floor_plan_3d_url: 'otro'` → no hay `floorPlan3dUrl` en el patch y `kept` contiene `{planta:0, kind:'render'}`.
  - `fillPlantas` con mismo valor ya cargado → ni en patch ni en kept.
  - `fillPlantas` de unidad `floors_count: 1` con values de 2 plantas → no genera `levels`.
  - `fillPlantas` preserva `rooms` y `label` de un nivel existente.
- [ ] **Step 2:** `npx vitest run lib/unit-levels.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `lib/unit-levels.ts` con las firmas de arriba.
- [ ] **Step 4:** `npx vitest run lib/unit-levels.test.ts` → PASS.
- [ ] **Step 5:** `git add lib/unit-levels.ts lib/unit-levels.test.ts`

### Task 2: API de carga guiada lee/escribe plantas

**Files:**
- Modify: `app/api/admin/guided/route.ts` (`UNIT_COLUMNS` l.25, `UNIT_FIELDS` l.291, `buildUnitUpdate`)
- Modify: `lib/unit-schema.ts` (exportar `level` como `levelSchema`)
- Modify: `components/admin/guided/shared.tsx` (`GUnit`)
- Test: `app/api/admin/guided/route.test.ts`

**Interfaces:**
- Produces: PATCH `units[]` acepta `roomPlanImage: string|null`, `floorPlan3dUrl: string|null` (kind `'url'`, máx. 2000, vacío → null) y `levels: UnitLevel[]|null` (kind `'levels'`, validado con `z.array(levelSchema).max(20)`; inválido → mensaje `levels inválido` → 400). `GUnit` suma `room_plan_image: string|null; floor_plan_3d_url: string|null; levels: UnitLevel[]|null`.

- [ ] **Step 1: Tests que fallan** en el `describe('PATCH …')`:
  - `acepta plano, render y plantas` → update contiene `{ room_plan_image:'https://x/p.png', floor_plan_3d_url:'https://x/r.png', levels:[{ id:'piso-1', label:'Planta alta', planImage:'https://x/p1.png', plan3dImage:null, rooms:[] }] }`.
  - `levels malformado: 400` con `levels: [{ label: 'x' }]` (sin id) y otro con `rooms: 'no'`.
- [ ] **Step 2:** `npx vitest run app/api/admin/guided/route.test.ts` → FAIL.
- [ ] **Step 3:** Agregar columnas a `UNIT_COLUMNS`, campos a `UNIT_FIELDS`, casos `'url'` (reusa `sanitizeText`) y `'levels'` (zod `safeParse`) en `buildUnitUpdate`; campos en `GUnit`.
- [ ] **Step 4:** Tests del archivo → PASS; `npx tsc --noEmit -p .` limpio.
- [ ] **Step 5:** `git add` de los 4 archivos.

### Task 3: Paso "Plantas" del flujo Dúplex

**Files:**
- Create: `components/admin/guided/DuplexPlantasStep.tsx`
- Modify: `components/admin/guided/DuplexFlow.tsx` (`STEPS` l.16, render de pasos l.46-50, eyebrows "Paso N de 3" → "de 4", `DuplexListo` ítem "Renders y planos")

**Interfaces:**
- Consumes: Task 1 (`plantaLabel`, `modelSlotValue`, `fillPlantas`, `LevelUnitLike`), Task 2 (`GUnit` con campos nuevos, `patch({ units })`).
- Produces: `export default function DuplexPlantasStep({ tree, reload, onBack, onNext }: { tree: GuidedTree; reload: () => Promise<void>; onBack: () => void; onNext: () => void })`.

- [ ] **Step 1:** `STEPS = [Conjunto, Plano del conjunto, Plantas, Listo]`; paso 3 renderiza `DuplexPlantasStep`, paso 4 `DuplexListo`; actualizar eyebrows a "de 4".
- [ ] **Step 2:** `DuplexPlantasStep`: agrupa `allUnits(tree)` por `model_name ?? 'Modelo único'`; `Segmented` de modelos si hay >1; plantas = `max(floors_count)` del modelo; por planta una fila con `plantaLabel` y dos `ImageUploader` (`folder="floorplans"`) "Plano" y "Render 3D". Estado inicial por casillero = `modelSlotValue(...).value`; si `differing.length`, nota gris "D2-B tiene otro cargado; no se va a pisar".
- [ ] **Step 3:** Botón primario `Aplicar a las {n} unidades` (del modelo activo): `fillPlantas` por unidad, un solo `patch({ units: [...] })` con las que tengan patch no vacío, `reload()`, toast `"{filled} imágenes cargadas"` + `", {k} se mantuvieron"` si hubo `kept`. Si nada para completar: toast "No había nada para completar". `StepFooter` con volver, "Lo cargo después" (→ `onNext` sin guardar) y continuar.
- [ ] **Step 4:** En `DuplexListo`, el ítem "Renders y planos" pasa a "Plano y render de cada planta" con texto `"{x} de {n} unidades con todas las plantas cargadas"` (cuenta con `readSlot` todas las plantas/kinds no vacíos).
- [ ] **Step 5:** `npx tsc --noEmit -p .` y `npx eslint components/admin/guided` limpios; `git add`.

### Task 4: Render por planta en la ficha de unidad (Planos) + nombres unificados

**Files:**
- Modify: `lib/unit-fields.ts` (`UnitFormValues`, `toFormValues`, `FIELD_TO_COLUMN`: `floorsCount`, `levels`)
- Modify: `components/admin/unit-groups/PlanosGroup.tsx`
- Modify: `components/admin/FloorUnitsEditor.tsx:322,335`, `components/admin/UnitRoomsEditor.tsx:103-113` (default de label → `levelLabel`)
- Test: `lib/unit-fields.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ensureLevels`, `plantaLabel`).
- Produces: `UnitFormValues.floorsCount: number`, `UnitFormValues.levels: UnitLevel[] | null`.

- [ ] **Step 1: Test que falla** en `lib/unit-fields.test.ts`: `toFormValues(row)` expone `floorsCount` y `levels`; `toDbShape({ levels: [...], floorsCount: 2 })` → `{ levels: [...], floors_count: 2 }`.
- [ ] **Step 2:** `npx vitest run lib/unit-fields.test.ts` → FAIL.
- [ ] **Step 3:** Agregar los dos campos a `UnitFormValues`/`toFormValues`/`FIELD_TO_COLUMN`. Test → PASS.
- [ ] **Step 4:** `PlanosGroup`: si `values.floorsCount > 1`, el casillero "Planta 3D (render)" muestra un selector de planta (mismo estilo de pastillas que `FloorUnitsEditor.tsx:1398`). Planta 0 escribe `floorPlan3dUrl`; planta k: antes de escribir, `GET /api/admin/units/{id}` para leer `levels` frescos (el editor de Ambientes los modifica por su lado), `ensureLevels`, setear `plan3dImage` del nivel k-1 y `onChange({ levels })`. Necesita el `unitId`: tomarlo del contexto del shell (`unit-shell-context.tsx`).
- [ ] **Step 5:** En `FloorUnitsEditor` y `UnitRoomsEditor`, el label por defecto de un nivel nuevo pasa de `` `Piso ${i + 1}` `` a `levelLabel(i + 1, floorsCount)`.
- [ ] **Step 6:** `npx vitest run lib components/admin` PASS, `tsc` limpio; `git add`.

### Task 5: Flujo Casa — ambientes por planta real

**Files:**
- Modify: `lib/guided-structure.ts` (`RoomGroup`, `defaultRoomGroup`)
- Modify: `lib/unit-levels.ts` (helpers de casa)
- Modify: `components/admin/guided/shared.tsx` (`GRoom.group`)
- Modify: `components/admin/guided/CasaFlow.tsx` (`AmbientesStep` l.293-480)
- Test: `lib/unit-levels.test.ts`, `lib/guided-structure.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ensureLevels`, `plantaLabel`), Task 2 (`levels` en GUnit y PATCH).
- Produces:
  - `type RoomGroup = 'pb' | 'ext' | \`nivel-${number}\``; `defaultRoomGroup` devuelve `'nivel-1'` donde antes `'pa'`.
  - `roomsWithGroups<T extends Room & { group?: string }>(rooms: T[] | null, levels: UnitLevel[] | null): T[]` — rooms de planta baja con su group (`'pa'` → `'nivel-1'`, sin group → `undefined` para que `defaultRoomGroup` decida) + rooms de `levels[k]` con `group: 'nivel-{k+1}'`.
  - `splitRoomsByGroup<T extends Room & { group?: string }>(rooms: T[], levels: UnitLevel[] | null, floorsCount: number): { rooms: T[]; levels: UnitLevel[] }` — `pb`/`ext`/sin group → `rooms`; `nivel-k` → `ensureLevels(...)[k-1].rooms`, el resto de cada nivel intacto.

- [ ] **Step 1: Tests que fallan:** `defaultRoomGroup({name:'Dormitorio 1',kind:'bedroom'}, 2) === 'nivel-1'`; `roomsWithGroups([{…group:'pa'}], null)` → group `'nivel-1'`; `splitRoomsByGroup` con un room `nivel-1` y un nivel existente con `planImage:'p1'` → `levels[0]` conserva `planImage` y tiene ese room, `rooms` no lo tiene; ida y vuelta `splitRoomsByGroup(roomsWithGroups(r, l), l, 2)` reproduce `r`/`l`.
- [ ] **Step 2:** Correr ambos archivos de test → FAIL.
- [ ] **Step 3:** Implementar helpers y cambio de `RoomGroup`. Tests → PASS.
- [ ] **Step 4:** `AmbientesStep`: estado inicial desde `roomsWithGroups(unit.rooms, unit.levels)` (si vacío, `roomsFromCounts`); `GROUPS` = `pb` ("Planta baja" o "Interior" si 1 planta) + `nivel-k` para k=1..max(floors_count-1, levels.length) con `plantaLabel` + `ext`; al guardar `splitRoomsByGroup` y mandar `rooms` + `levels` en el `patch`. Panorámicas/tour: iterar todos los rooms como hoy (antes del split).
- [ ] **Step 5:** `npx vitest run`, `tsc`, `eslint components/admin/guided` limpios; `git add`.

### Task 6: Verificación final

- [ ] `npx vitest run` completo → PASS.
- [ ] `npx tsc --noEmit -p .` limpio; `npx eslint` de los archivos tocados sin errores nuevos.
- [ ] Revisión del diff completo contra el spec (cada sección 1–5 cubierta).
- [ ] Reportar al usuario; commitear/pushear solo si lo pide.
