# Arreglos de la carga de edificios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 10 problemas detectados al relevar la carga de un proyecto tipo `edificio`. Abarcan publicación, precios, moneda, campos numéricos, planos, panorámicas, superficies, códigos duplicados y la vista inicial del 360°.

**Architecture:** Cada arreglo es chico y local. La lógica nueva va en funciones puras dentro de `lib/`, testeadas con Vitest, y los componentes solo las usan. Las rutas API se testean con el harness existente (`lib/test-helpers/supabase-mock.ts`). No hay migraciones de base.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase, Vitest 4 (entorno `node`; `// @vitest-environment jsdom` solo si hace falta DOM), Marzipano.

**Spec:** No hay un documento de spec aparte. La fuente es la sección "Problemas" de este plan, que sale del análisis de carga de edificio del 2026-10-16.

## Problemas (fuente)

| # | Problema | Evidencia |
|---|---|---|
| P1 | Un proyecto nuevo se crea publicado | `supabase/schema.sql:273` (default true); `POST /api/admin/projects` no setea `published` |
| P2 | El ítem "Precios cargados" de la checklist está fijo en `ok: false` cuando es venta | `app/admin/(authenticated)/(project)/proyecto/page.tsx:333` |
| P3 | Inventario guarda precio 0 al hacer blur sobre una unidad sin precio | `inventory/page.tsx:389` (`defaultValue={unit.price \|\| 0}`) |
| P4 | Vaciar Dormitorios o Baños manda `null` a una columna NOT NULL y da 500 | `components/admin/unit-groups/DatosGroup.tsx:75,83` |
| P5 | La moneda no se puede editar en la ficha de la unidad | `ComercialGroup.tsx` no tiene input de `currency` |
| P6 | Los tres planos tienen nombres distintos en el asistente y en la pestaña Planos | `PlanosGroup.tsx:25-34` vs `FloorUnitsEditor.tsx:911-913` |
| P7 | No se valida que la panorámica sea 2:1, y una de más de 15 MB se rechaza sin alternativa | `lib/panorama.ts`, `app/api/admin/upload/route.ts:6` |
| P8 | No se avisa si las superficies no suman el total (casa sí avisa) | `SuperficiesGroup.tsx`; casa en `FloorUnitsEditor.tsx:443-449` |
| P9 | Un código de unidad repetido en el piso devuelve 500 con el mensaje crudo de Postgres | `app/api/admin/units/route.ts`, `units/[id]/route.ts` (unique `floor_id, code`) |
| P10 | La escena 360° siempre arranca mirando a yaw 0, sin forma de cambiarlo | `TourEditor.tsx:203,219` |

## Global Constraints

- **No commitear ni pushear.** El usuario commitea cuando lo pide. Cada tarea termina con los tests en verde y el diff listo, sin commit.
- Textos de UI en español rioplatense ("subila", "cargá"), igual que el resto del admin.
- No cambiar el default de la columna `published` en la base. El comentario en `schema.sql:270-272` explica por qué: los proyectos existentes no se tienen que caer.
- No agregar dependencias.
- Seguir el estilo del archivo que se toca: comentarios en español que explican el porqué, y clases Tailwind del mismo tipo que las vecinas.
- Comandos: test de un archivo con `pnpm vitest run <ruta>`; suite completa con `pnpm test`; tipos con `pnpm exec tsc --noEmit`; lint con `pnpm lint`.
- Ignorar `.claude/worktrees/**`: son otras ramas.

## Review Focus

1. **Proyectos duplicados o casa auto-provisionada (P1):** la casa se provisiona después del insert. Un proyecto en borrador tiene que seguir viéndose en el preview de `/admin/sitio`. Verificarlo a mano en la Task 1.
2. **Unidades en pisos que no son de vivienda (P2):** las cocheras y amenities también tienen `units`. La cuenta de precios incluye todas las unidades del proyecto, que es lo mismo que muestra Inventario. Si `total = 0`, el ítem no está OK: un proyecto sin unidades no tiene "precios cargados".
3. **Precio con valor "0" escrito a propósito (P3):** escribir 0 guarda 0; dejar el campo vacío guarda `null` ("Consultar"). Ver el test en la Task 3.
4. **CSV con código repetido (P9):** el import de `UnitsEditor` usa POST/PATCH. Con el 409 nuevo, la fila tiene que reportarse como fallida y la importación tiene que seguir con las demás. Ver el test de la ruta en la Task 7 y la verificación manual.
5. **Panorámica vertical o cuadrada que no es estéreo (P7):** una proporción fuera de 2:1 sube igual, pero con aviso. Nunca bloquear: hay fotos 360 parciales que se usan a propósito. Ver el test en la Task 6.

---

## Ejecución con subagentes

Las tareas corren **en orden**, un implementador nuevo por tarea y un reviewer antes de pasar a la siguiente (superpowers:subagent-driven-development). Varias tareas comparten archivos (`lib/units.ts`, `lib/unit-fields.ts`, `FloorUnitsEditor.tsx`), así que no conviene correrlas en paralelo sobre el mismo árbol de trabajo.

Si se quiere paralelizar, estas tres oleadas no comparten archivos dentro de la misma oleada:

| Oleada | Tareas | Archivos que toca |
|---|---|---|
| A | 1, 2, 7, 9 | rutas `projects`, `project` + proyecto/page; rutas `units`; `TourEditor`/`TourNodeViewer`/`lib/tour-data.ts` |
| B | 3, 4, 6 | `lib/units.ts` + Comercial + inventario; `DatosGroup` + `unit-fields` + ruta `units/[id]`*; `lib/panorama.ts` + uploaders |
| C | 5, 8 | `PlanosGroup` + `FloorUnitsEditor` + `unit-fields`; `SuperficiesGroup` + `FloorUnitsEditor` + `lib/units.ts` |

\* La Task 4 toca `app/api/admin/units/[id]/route.ts`, igual que la Task 7. Por eso la 7 va en la oleada A y la 4 en la B. La Task 5 y la Task 8 tocan `FloorUnitsEditor.tsx` en zonas distintas, pero conviene correrlas una después de la otra dentro de la oleada C.

---

### Task 1: Los proyectos nuevos arrancan en borrador (P1)

**Files:**
- Modify: `app/api/admin/projects/route.ts` (insert dentro de `POST`, ~líneas 164-170)
- Test: `app/api/admin/projects/route.test.ts`

**Interfaces:**
- Produces: `POST /api/admin/projects` inserta con `published: false` y lo devuelve en el `.select(...)`.

- [ ] **Step 1: Escribir el test que falla.** En el `describe` de POST agregar `it('alta: el proyecto nuevo arranca como borrador (published: false)')`. Hay que espiar el `insert`, como en el test de `parking_spots` de `units/route.test.ts`, y afirmar `expect(insertSpy.mock.calls[0][0]).toMatchObject({ published: false })`.
- [ ] **Step 2: Correrlo.** `pnpm vitest run app/api/admin/projects/route.test.ts`. Esperado: FAIL, porque el payload no tiene `published`.
- [ ] **Step 3: Implementar.** Agregar `published: false` al objeto del insert, con un comentario de una línea: un proyecto vacío no debe quedar visible hasta que el admin lo publique, y la columna mantiene default true por los proyectos viejos. Sumar `published` al `.select('id, slug, name, project_type, sale_mode')`.
- [ ] **Step 4: Correr el archivo de test.** Esperado: PASS, incluidos los tests que ya existían.
- [ ] **Step 5: Verificación manual.** Con `pnpm dev`, crear un proyecto desde `/admin/proyectos`. La tarjeta tiene que decir "Borrador" y `/admin/sitio` tiene que seguir mostrando el preview.

### Task 2: Checklist "Precios cargados" calculada de verdad (P2)

**Files:**
- Modify: `app/api/admin/project/route.ts` (GET, dentro del `Promise.all` de ~línea 59)
- Modify: `app/admin/(authenticated)/(project)/proyecto/page.tsx` (estado `~:75-81`, `load()` `~:106-118`, checklist `:324-337`)
- Modify: `lib/units.ts` (función nueva)
- Test: `lib/units.test.ts`, `app/api/admin/project/route.test.ts`

**Interfaces:**
- Produces: `export function countPricedUnits(units: { price: number | null }[]): { total: number; priced: number }` en `lib/units.ts`.
- Produces: la respuesta de `GET /api/admin/project` suma `unitPrices: { total: number; priced: number }`.

- [ ] **Step 1: Tests de `countPricedUnits` en `lib/units.test.ts`.**
  - `[]` → `{ total: 0, priced: 0 }`.
  - `[{price: 100}, {price: null}, {price: 0}]` → `{ total: 3, priced: 2 }`. El 0 cuenta como cargado; si se escribió a propósito, es un dato.
- [ ] **Step 2: Correrlos.** `pnpm vitest run lib/units.test.ts`. Esperado: FAIL, porque la función no existe.
- [ ] **Step 3: Implementar `countPricedUnits`** en `lib/units.ts`. Cuenta como cargado todo precio `!= null`.
- [ ] **Step 4: Test de la ruta.** En `project/route.test.ts`, en el caso "camino feliz", encolar un resultado más para `.from('units')` con `[{ price: 10 }, { price: null }]` y afirmar `json.unitPrices` igual a `{ total: 2, priced: 1 }`. Ajustar el orden de la cola de los demás tests del GET que se rompan por el `.from` nuevo.
- [ ] **Step 5: Implementar en el GET.** Agregar al `Promise.all` la consulta `supabase.from('units').select('price, floors!inner(buildings!inner(project_id))').eq('floors.buildings.project_id', project.id)`: es una sola llamada y se puede mockear con un único resultado. Devolver `unitPrices: countPricedUnits(rows ?? [])`.
- [ ] **Step 6: Usarlo en la página.**
  - Agregar el estado `unitPrices` y setearlo en `load()` desde `data.unitPrices`, con fallback `{ total: 0, priced: 0 }`.
  - El ítem pasa a ser `{ label: 'Precios cargados', ok: unitPrices.total > 0 && unitPrices.priced === unitPrices.total }`.
  - Si no está OK y `total > 0`, el label muestra la proporción: `Precios cargados (${priced}/${total})`.
- [ ] **Step 7: Correr los dos tests y `pnpm exec tsc --noEmit`.** Esperado: PASS y sin errores de tipos.

### Task 3: Precio vacío = "Consultar", también en Inventario (P3)

**Files:**
- Modify: `lib/units.ts` (función nueva)
- Modify: `app/admin/(authenticated)/(project)/inventory/page.tsx:385-396`
- Modify: `components/admin/unit-groups/ComercialGroup.tsx:23-25`
- Test: `lib/units.test.ts`

**Interfaces:**
- Produces: `export function parsePriceInput(raw: string): number | null` en `lib/units.ts`. Lo usa también la Task 4 para los campos numéricos.

- [ ] **Step 1: Tests de `parsePriceInput`.**
  - `''` → `null`; `'   '` → `null`.
  - `'0'` → `0`; `'125000'` → `125000`; `'1500.5'` → `1500.5`.
  - `'-3'` → `null` (un precio negativo no es válido); `'abc'` → `null`.
- [ ] **Step 2: Correrlos.** Esperado: FAIL.
- [ ] **Step 3: Implementar `parsePriceInput`.** Hace `trim`; vacío devuelve `null`; `Number(...)` que no es finito o es menor a 0 devuelve `null`.
- [ ] **Step 4: Inventario.**
  - `defaultValue={unit.price ?? ''}` con `placeholder="Consultar"`.
  - En el `onBlur`: `const newPrice = parsePriceInput(e.target.value); if (newPrice !== unit.price) handleUpdateUnit(unit.id, { price: newPrice })`.
  - Revisar que `handleUpdateUnit` y su tipo acepten `price: null`; si no, ampliar el tipo.
- [ ] **Step 5: ComercialGroup.** Reemplazar el parseo inline del `onBlur` de Precio por `parsePriceInput`.
- [ ] **Step 6: Tests y tipos.** `pnpm vitest run lib/units.test.ts` y `pnpm exec tsc --noEmit`. Esperado: PASS.
- [ ] **Step 7: Verificación manual.** En Inventario, entrar y salir del precio de una unidad sin precio no dispara ningún PATCH: revisarlo en la pestaña Network. Escribir 0 guarda 0.

### Task 4: Dormitorios y Baños nunca se mandan como null (P4)

**Files:**
- Modify: `components/admin/unit-groups/DatosGroup.tsx:70-86`
- Modify: `lib/unit-fields.ts` (tipo `UnitFormValues`, y el comentario de líneas 7-9)
- Modify: `app/api/admin/units/[id]/route.ts` (PATCH)
- Test: `app/api/admin/units/[id]/route.test.ts`, `lib/unit-fields.test.ts`

**Interfaces:**
- Consumes: `parsePriceInput` no aplica acá porque los conteos son enteros o medios. Usar el parseo directo descrito abajo.
- Produces: `UnitFormValues.bedrooms: number` y `UnitFormValues.bathrooms: number` (dejan de ser `| null`).
- Produces: el PATCH de unidad responde 400 `"<campo> no puede quedar vacío"` si llega `null` en una columna NOT NULL.

- [ ] **Step 1: Test de la ruta.** `it('null en una columna NOT NULL (bedrooms): 400 legible, no actualiza')`. Body `{ bedrooms: null }`; se espera status 400, el error contiene `'bedrooms'`, y no se llama a `.update`. Agregar un caso igual con `bathrooms`.
- [ ] **Step 2: Correrlo.** `pnpm vitest run "app/api/admin/units/[id]/route.test.ts"`. Esperado: FAIL, porque hoy llega al update.
- [ ] **Step 3: Implementar en el PATCH.** Agregar una constante `NOT_NULL_FIELDS = ['code', 'type', 'bedrooms', 'bathrooms', 'hasServiceRoom', 'balconyArea', 'externalArea', 'currency', 'status', 'galleryImages']` (las columnas NOT NULL del `FIELD_MAP`, según `schema.sql:463-565`). Si `body[campo] === null` para alguno, devolver 400 antes del update. Comentar que evita el 500 crudo de Postgres.
- [ ] **Step 4: Correr el test.** Esperado: PASS.
- [ ] **Step 5: DatosGroup.**
  - Vaciar Dormitorios o Baños guarda `0`, igual que hace Balcón en `SuperficiesGroup`.
  - Inputs con `min={0}`; Baños además con `step={0.5}`, para que coincida con `FloorUnitsEditor`.
  - Cambiar el tipo en `UnitFormValues` y actualizar el comentario de `lib/unit-fields.ts:7-9`, que hoy dice que se permite null.
- [ ] **Step 6: Tipos y tests.** `pnpm exec tsc --noEmit`, y corregir los usos que asumían `| null`. Después `pnpm vitest run lib/unit-fields.test.ts components/admin/unit-groups/registry.test.ts`. Esperado: PASS.

### Task 5: Mismos nombres para los planos en todo el admin (P6)

**Files:**
- Modify: `lib/unit-fields.ts` (constante nueva)
- Modify: `components/admin/unit-groups/PlanosGroup.tsx:24-35`
- Modify: `components/admin/FloorUnitsEditor.tsx:911-913`
- Test: `lib/unit-fields.test.ts`

**Interfaces:**
- Produces: `export const UNIT_PLAN_FIELDS: readonly { key: 'floorPlan3dUrl' | 'plan3dUrl' | 'technicalPlanUrl'; label: string; hint: string }[]` en `lib/unit-fields.ts`.

Los textos salen de cómo los usa el sitio público (`types/index.ts:213-215`, `Planta3DTab`, `PlanoTab`, `ComparePaneContent`):

| key | label | hint |
|---|---|---|
| `floorPlan3dUrl` | `Planta 3D (render)` | `Se muestra en la solapa "Planta 3D" de la unidad.` |
| `plan3dUrl` | `Plano técnico 3D` | `Esquema 3D de la planta; se usa si no hay plano 2D.` |
| `technicalPlanUrl` | `Plano técnico 2D` | `Plano con cotas y rótulos. Si no cargás plano de ambientes, es la base de la solapa "Plano".` |

- [ ] **Step 1: Test.** `UNIT_PLAN_FIELDS` tiene exactamente esas 3 keys en ese orden, y ningún label se repite.
- [ ] **Step 2: Correrlo.** Esperado: FAIL.
- [ ] **Step 3: Agregar la constante** con los valores de la tabla.
- [ ] **Step 4: PlanosGroup.** Generar los tres uploaders con `UNIT_PLAN_FIELDS.map(...)`, label arriba y hint en `text-[10.5px] text-gray-400` abajo. `values[key]` y `onChange({ [key]: url || null })`.
- [ ] **Step 5: FloorUnitsEditor.** Generar las 3 líneas de `ImageUploader` con el mismo `map`, usando `label={f.label}` y `form[f.key]`.
- [ ] **Step 6: Tests y tipos.** Esperado: PASS.

### Task 6: Panorámicas: aviso si no son 2:1 y achicar las muy pesadas (P7)

**Files:**
- Modify: `lib/panorama.ts`
- Create: `lib/panorama.test.ts`
- Modify: `components/admin/ImageUploader.tsx:36-40`, `components/admin/BulkImageUploader.tsx:36`

**Interfaces:**
- Produces: `export type PanoramaAspect = 'equirect' | 'stereo' | 'other'` y `export function classifyPanoramaAspect(width: number, height: number): PanoramaAspect`.
  - `stereo`: proporción dentro de [0.85, 1.3], que son las constantes actuales.
  - `equirect`: proporción dentro de [1.9, 2.1].
  - `other`: cualquier otra.
- Produces: `export const MAX_PANORAMA_WIDTH = 8192` y `export function panoramaTargetSize(width: number, height: number): { width: number; height: number } | null`. Devuelve `null` si `width <= MAX_PANORAMA_WIDTH`; si no, escala proporcional con `width = 8192`.
- Produces: `export async function preparePanorama(file: File): Promise<{ file: File; warning: string | null }>`. Reemplaza a `fixStereoPanorama` en los uploaders; `fixStereoPanorama` queda exportada y la usa por dentro.

- [ ] **Step 1: Tests puros en `lib/panorama.test.ts`.**
  - `classifyPanoramaAspect(8000, 4000)` → `'equirect'`; `(6000, 6000)` → `'stereo'`; `(4000, 3000)` → `'other'`.
  - `panoramaTargetSize(8000, 4000)` → `null`; `(12000, 6000)` → `{ width: 8192, height: 4096 }`.
- [ ] **Step 2: Correrlos.** Esperado: FAIL.
- [ ] **Step 3: Implementar las dos funciones puras.**
- [ ] **Step 4: Implementar `preparePanorama`.** Usa la misma rama canvas/`createImageBitmap` que `fixStereoPanorama`:
  - Primero recorta el estéreo.
  - Si `panoramaTargetSize` no es null, o si `file.size > 15 * 1024 * 1024`, re-encodea a JPEG 0.85 con el tamaño objetivo (el original si es null).
  - Si el aspecto final es `'other'`, devuelve `warning: 'Esta imagen no parece una panorámica 360° (debería ser el doble de ancha que de alta). Se subió igual, pero puede verse deformada.'`
  - Si no se puede decodificar la imagen, devuelve `{ file, warning: null }`.
- [ ] **Step 5: Uploaders.**
  - `ImageUploader`: con `folder === 'tours'` usa `preparePanorama` y muestra `warning` en ámbar debajo del preview. El texto es un aviso, no un error, y no bloquea `onChange`.
  - `BulkImageUploader`: junta los warnings y los muestra con el nombre del archivo.
- [ ] **Step 6: Tests y tipos.** Esperado: PASS.
- [ ] **Step 7: Verificación manual.** Subir en un tour una imagen de 4:3: se sube y aparece el aviso. Una panorámica de más de 15 MB se achica y sube sin error.

### Task 7: Código repetido → 409 con mensaje claro (P9)

**Files:**
- Modify: `app/api/admin/units/route.ts` (POST, `if (error)` final)
- Modify: `app/api/admin/units/[id]/route.ts` (PATCH, `if (error)`)
- Test: `app/api/admin/units/route.test.ts`, `app/api/admin/units/[id]/route.test.ts`

**Interfaces:**
- Produces: en los dos endpoints, `error.code === '23505'` → status 409 con `{ error: 'Ya existe una unidad con el código "<code>" en este piso.' }`. En POST el `<code>` es el código sanitizado; en PATCH es `body.code`, o `'ese código'` si el body no lo trae.

- [ ] **Step 1: Tests.** En los dos archivos, el insert/update del mock devuelve `{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }`. Se espera status 409 y el texto exacto, con código `A1`.
- [ ] **Step 2: Correrlos.** Esperado: FAIL (hoy devuelven 500).
- [ ] **Step 3: Implementar** las dos ramas, igual que `projects/route.ts:174`.
- [ ] **Step 4: Correr los tests.** Esperado: PASS.
- [ ] **Step 5: Verificación manual.** Importar en `UnitsEditor` un CSV con dos filas del mismo código nuevo: la segunda se reporta como fallida con el mensaje nuevo y el resto se importa. Si el reporte del import muestra el error genérico en vez de `data.error`, ajustarlo en `components/admin/UnitsEditor.tsx:217-268` para que muestre `data.error`.

### Task 8: Aviso de superficies que no suman (P8)

**Files:**
- Modify: `lib/units.ts` (función nueva)
- Modify: `components/admin/unit-groups/SuperficiesGroup.tsx`
- Modify: `components/admin/FloorUnitsEditor.tsx:443-449` (casa usa el helper)
- Test: `lib/units.test.ts`

**Interfaces:**
- Produces: `export function areaMismatch(total: number | null, parts: (number | null)[], tolerance = 0.5): boolean`. Es `true` solo si `total > 0`, la suma de las partes (null cuenta 0) es mayor a 0, y `|suma - total| > tolerance`.

- [ ] **Step 1: Tests.**
  - `(80, [70, 6, 4])` → `false`; `(80, [70, 6, 4.4])` → `false`, porque está dentro de la tolerancia.
  - `(80, [60, 6, 0])` → `true`.
  - `(null, [60])` → `false`; `(80, [null, 0, 0])` → `false`.
- [ ] **Step 2: Correrlos.** Esperado: FAIL.
- [ ] **Step 3: Implementar `areaMismatch`.**
- [ ] **Step 4: SuperficiesGroup.** En edificio las partes son interior + balcón + exterior. Si `areaMismatch(values.totalArea, [values.innerArea, values.balconyArea, values.externalArea])`, mostrar debajo un aviso ámbar: `Interior + balcón + exterior suman X m², pero el total es Y m².` Es solo un aviso: nunca bloquea.
- [ ] **Step 5: FloorUnitsEditor (casa).** Reemplazar el cálculo inline de `areaMismatch` por `areaMismatch(Number(form.totalArea || 0), [Number(form.innerArea || 0), Number(form.externalArea || 0)])`. Casa no tiene balcón, así que el comportamiento no cambia.
- [ ] **Step 6: Tests y tipos.** Esperado: PASS.

### Task 9: Elegir la vista inicial de cada escena 360° (P10)

**Files:**
- Create: `lib/tour-data.ts`, `lib/tour-data.test.ts`
- Modify: `components/admin/TourNodeViewer.tsx` (props nuevas + botón)
- Modify: `components/admin/TourEditor.tsx` (handler + pasar las props, panel derecho ~`:640-700`)

**Interfaces:**
- Produces: `export interface TourView { yaw: number; pitch: number; fov: number }`. Si `types/index.ts` ya tiene ese shape en `TourNode.initialView`, reusarlo en vez de duplicarlo.
- Produces: `export function setNodeInitialView(tour: TourData, nodeId: string, view: TourView): TourData`. Es inmutable y devuelve el mismo `tour` si el nodo no existe.
- Produces: en `TourNodeViewer`, las props opcionales `initialView?: TourView` (la escena abre ahí) y `onCaptureView?: (view: TourView) => void`. Si `onCaptureView` está, el visor muestra arriba a la derecha el botón "Usar esta vista como inicio", que llama a `onCaptureView({ yaw: view.yaw(), pitch: view.pitch(), fov: view.fov() })`.

- [ ] **Step 1: Tests de `setNodeInitialView`.**
  - Actualiza solo el nodo indicado y no muta el original (`expect(original).toEqual(copiaPrevia)`).
  - Con un `nodeId` inexistente devuelve el mismo objeto (`toBe`).
- [ ] **Step 2: Correrlos.** Esperado: FAIL.
- [ ] **Step 3: Implementar `lib/tour-data.ts`.**
- [ ] **Step 4: TourNodeViewer.** Al crear la vista (`RectilinearView`), usar `initialView` si viene. El botón no se muestra mientras `placing !== null`, para no competir con el modo de ubicar hotspots.
- [ ] **Step 5: TourEditor.**
  - Agregar `handleSetInitialView(nodeId, view)`: aplica `setNodeInitialView`, persiste con el mismo mecanismo que `handleSetNote` y muestra el mensaje "Vista inicial guardada".
  - Pasar `initialView={activeNode.initialView}` y `onCaptureView={v => handleSetInitialView(activeNode.id, v)}` al visor.
  - Las escenas nuevas siguen arrancando en `{ yaw: 0, pitch: 0, fov: Math.PI / 2 }`.
- [ ] **Step 6: Tests y tipos.** Esperado: PASS.
- [ ] **Step 7: Verificación manual.**
  - En el tour de una unidad, girar la escena, tocar "Usar esta vista como inicio" y recargar: el editor abre en esa vista.
  - En "▶ Probar recorrido" y en el sitio público (`VirtualTour.tsx:85-87`, que ya lee `initialView`) la escena arranca mirando ahí.

---

### Cierre (después de la última tarea)

- [ ] `pnpm test`: toda la suite en verde.
- [ ] `pnpm exec tsc --noEmit` y `pnpm lint`: sin errores nuevos.
- [ ] Review de la rama completa con un reviewer nuevo.
- [ ] No commitear: avisar al usuario que el diff está listo.
