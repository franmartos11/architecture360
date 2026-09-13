# Editor de unidades dividido en grupos

Fecha: 2026-09-13

## Problema

El panel de edición de `UnitsEditor` apila ~16 bloques de campos en una
columna de 400px con scroll: código, superficie, modelo, tipología,
dormitorios, baños, orientación, tres medidas de área, precio, estado,
foto principal, copiar-de-otra-unidad, tres planos, galería, recorrido
360°, ambientes y el estado del polígono. Para llegar a los planos o al
360° hay que bajar casi todo el panel, y no hay ninguna señal de qué
quedó sin cargar en cada unidad.

El mismo problema, peor, está en `FloorUnitsEditor` (1484 líneas): es el
editor de casa y suma cochera, condición, características, ambientes por
planta, expensas y altura de techo en un único formulario inline.

## Objetivos

- Dividir los campos en grupos navegables, uno por pantalla, para que
  ningún grupo requiera scroll largo.
- Mostrar de un vistazo qué grupos están cargados y cuáles vacíos.
- Reducir el tamaño de los dos archivos extrayendo los campos a
  componentes de grupo compartidos.

## No objetivos

- No cambiar el modelo de datos ni la API (`/api/admin/units`).
- No tocar la lista de unidades (tabla/grid, CSV, selección múltiple).
- No mover la delimitación del polígono, que sigue en `/plano`.
- No unificar los dos modelos de guardado (autosave vs borrador); ver
  "Restricción" más abajo.

## Restricción que condiciona el diseño

Los dos editores viven en contextos distintos:

| Editor | Montado en | Guardado |
|---|---|---|
| `UnitsEditor` | `edificios/[id]/pisos/[floorId]/page.tsx` (página) | autosave por campo (`patch` en `onBlur`) |
| `FloorUnitsEditor` | `wizard/page.tsx:761` (paso del asistente) | borrador local `form` + botón "Guardar cambios" |

`FloorUnitsEditor` **no puede** ir a pantalla completa con rutas: navegar
fuera del wizard pierde el paso en curso. Por eso el diseño separa las
piezas del envoltorio: los componentes de grupo son compartidos, pero
`UnitsEditor` los muestra en un shell de rutas y el wizard los muestra en
acordeón, en su lugar.

## Arquitectura

Tres capas, cada una con una responsabilidad:

```
lib/unit-fields.ts           ← forma canónica de los campos + adaptadores
components/admin/unit-groups/ ← los grupos de campos (compartidos, sin rutas)
  registry.ts
  DatosGroup.tsx
  SuperficiesGroup.tsx
  ComercialGroup.tsx
  ...
app/.../unidades/[unitId]/    ← shell de rutas (solo UnitsEditor)
  layout.tsx
  datos/page.tsx
  ...
```

### Capa 1 — forma canónica (`lib/unit-fields.ts`)

Hoy los dos editores hablan formas distintas: `UnitsEditor` lee la fila
en snake_case (`cur.total_area`) y `FloorUnitsEditor` arma un objeto
`form` en camelCase. Los grupos necesitan una sola forma.

Se adopta **camelCase**, que ya es la forma que acepta el PATCH de la
API, y `UnitsEditor` ya tiene la traducción inversa en `dbShape()`.

```ts
export interface UnitFormValues { code: string; totalArea: number | null; /* ... */ }

export function toFormValues(row: UnitRow): UnitFormValues;
export function toDbShape(patch: Partial<UnitFormValues>): Partial<UnitRow>; // mueve dbShape() acá
```

### Capa 2 — componentes de grupo

Interfaz única, agnóstica de cómo se persiste:

```ts
export interface UnitGroupProps {
  values: UnitFormValues;
  onChange: (patch: Partial<UnitFormValues>) => void;
  disabled?: boolean;
}
```

`UnitsEditor` pasa un `onChange` que hace PATCH inmediato; el wizard pasa
uno que actualiza su `form`. El grupo no sabe ni le importa.

Registro paralelo al de `section-editors/registry.ts`:

```ts
export interface UnitGroupDef {
  key: UnitGroupKey;
  label: string;
  slug: string;                                   // segmento de la sub-ruta
  applies: (tc: ProjectTypeConfig) => boolean;    // un lote no tiene 360°
  isEmpty: (v: UnitFormValues) => boolean;        // punto vacío
  isPartial: (v: UnitFormValues) => boolean;      // punto a medias
  Component: ComponentType<UnitGroupProps>;
}
```

`isEmpty`/`isPartial` siguen el espíritu de `computeEmptySectionKeys` de
`lib/project-sections.ts`: la lógica de "qué falta" vive junto a la
definición del grupo, no desparramada en la vista.

### Capa 3 — shell de rutas

`/admin/edificios/[id]/pisos/[floorId]/unidades/[unitId]/` pasa a ser un
`layout.tsx` que:

1. Carga la unidad una sola vez (`/api/admin/units/[id]`) y la comparte
   con las sub-rutas vía contexto, para que cambiar de grupo no refetchee.
2. Renderiza el encabezado con el código de la unidad y navegación
   **← unidad anterior / siguiente →** dentro del piso.
3. Renderiza el menú lateral de grupos con su punto de estado.
4. Renderiza la franja fija de "delimitado en el plano" con su link a
   `/plano`.

## Los grupos

| Grupo | Ruta | Campos | Aplica a |
|---|---|---|---|
| Datos | `/datos` | código, modelo, tipología, dormitorios, baños, servicio, orientación | todos (lote: solo código + superficie) |
| Superficies | `/superficies` | total, interior, balcón, exterior (+ lote, altura, plantas en casa) | no lote |
| Comercial | `/comercial` | precio, moneda, estado (+ expensas en casa) | según `showPrice`/`showStatus` |
| Imágenes | `/fotos` | foto principal + galería | todos |
| Planos | `/planos` | plano 3D (planta), render 3D, plano técnico | no lote |
| Ambientes | `/ambientes` | `UnitRoomsEditor` | no lote |
| Recorrido 360° | `/tour` | `TourEditor` | no lote |

Los grupos que no aplican **no se muestran**, en vez de aparecer
deshabilitados: un lote no tiene por qué ver "Recorrido 360°" en gris.

"Copiar datos de otra unidad" deja de ser un bloque de campos y pasa a
ser una acción del encabezado del shell, porque afecta a todos los
grupos a la vez, no a uno.

## Rutas: qué se crea y qué se mueve

Ya existen `/unidades/[unitId]/tour` y `/unidades/[unitId]/fotos`. El
shell es la generalización de lo que esas dos rutas ya hacen.

| Ruta | Acción |
|---|---|
| `[unitId]/layout.tsx` | nuevo — shell |
| `[unitId]/page.tsx` | pasa de renderizar `UnitRoomsEditor` a redirigir a `datos` |
| `[unitId]/ambientes/page.tsx` | nuevo — recibe el `UnitRoomsEditor` que estaba en el índice |
| `[unitId]/datos`, `superficies`, `comercial`, `planos` | nuevos |
| `[unitId]/fotos/page.tsx` | existe — absorbe "Foto principal"; pierde su encabezado propio (lo pone el layout) |
| `[unitId]/tour/page.tsx` | existe — pierde su encabezado propio |

Links a actualizar (hoy apuntan al índice esperando Ambientes):

- `components/admin/UnitsEditor.tsx:523` — botón "Ambientes" de la fila
- `components/admin/UnitsEditor.tsx:820` — link "Ambientes del depto"
- `components/admin/FloorUnitsEditor.tsx:745` — link "Ambientes" de la tabla

`UnitRoomsEditor` también se usa embebido como pestaña dentro de
"Delimitar deptos en el plano"; ese uso es por componente, no por ruta, y
no se ve afectado.

## Flujo de datos

**Shell (UnitsEditor):** el `layout` hace dos fetches al montar:
`/api/admin/units/[id]` para la unidad y `/api/admin/units?floorId=` para
la lista del piso, que es la que alimenta el ← → (misma llamada que ya
hace `UnitsEditor`). Expone ambas por contexto junto con un
`patch(updates)` que hace PATCH optimista y actualiza el estado local —
la misma mecánica que hoy tiene `UnitsEditor`, movida un nivel arriba. El
indicador "Guardando… / Guardado hace un instante" vive en el encabezado
del shell.

Cambiar de grupo no refetchea: el layout persiste entre sub-rutas, así
que la unidad se carga una sola vez por visita.

**Wizard:** `FloorUnitsEditor` no cambia su carga ni su guardado. Solo
reemplaza los bloques de campos inline por los componentes de grupo
dentro de un acordeón, alimentados por su `form` y su `setForm`.

## Qué pasa con el panel de 400px

Desaparece como formulario. La lista de unidades queda a ancho completo y
seleccionar una unidad navega a su shell. La carga rápida de muchas
unidades seguidas se preserva con dos cosas:

- La edición inline de código y m² que la tabla **ya tiene**
  (`editingCell`) se mantiene, que es el 80% de la carga masiva.
- La navegación ← → entre unidades del piso en el encabezado del shell,
  para recorrer el piso sin volver a la lista.

## Manejo de errores

- Unidad inexistente o borrada: el layout muestra `ErrorState` con vuelta
  al piso, en vez de renderizar un shell vacío.
- Fallo del PATCH: se mantiene el comportamiento actual — toast de error
  y recarga para descartar el estado optimista.
- Grupo que no aplica alcanzado por URL directa (ej. `/tour` en un lote):
  redirige a `/datos`.

## Testing

- `lib/unit-fields.ts`: ida y vuelta `toFormValues` → `toDbShape` para
  cada campo del row, incluyendo nulos y ceros (`balconyArea: 0` no debe
  perderse como si fuera vacío).
- `registry.ts`: `applies` para lote vs vivienda; `isEmpty`/`isPartial`
  con valores límite.
- Cada componente de grupo: renderiza sus campos y emite el `onChange`
  con el patch correcto.
- Verificación manual en navegador del shell completo: navegación entre
  grupos, ← →, puntos de estado, y el wizard sin regresiones.

## Implementación en dos fases

La fase 2 depende de la 1, y la 1 sola ya resuelve el dolor reportado.

**Fase 1 — shell de rutas para `UnitsEditor`**
Extraer `lib/unit-fields.ts`, los componentes de grupo y el registro;
construir el layout y las sub-rutas; mover Ambientes a `/ambientes` y
actualizar los tres links; sacar el panel de 400px.

**Fase 2 — acordeón propio para `FloorUnitsEditor`** (ver sección
dedicada más abajo — el plan original de "mapear los campos de casa a
los mismos grupos compartidos" se revisó después de investigar el
archivo real, por el motivo explicado ahí).

## Riesgos

- **Regresión en el wizard**: es el flujo de alta inicial del proyecto.
  La fase 2 no se toca hasta que la 1 esté validada en navegador. (Cumplido:
  Fase 1 mergeada a `main`, 794/794 tests, build limpio, antes de iniciar
  la Fase 2.)
- **Pérdida del panel lateral**: si en uso real la navegación ← → no
  compensa para carga masiva, la vuelta atrás es agregar a la tabla las
  columnas editables que falten, no resucitar el panel.

## Fase 2 — acordeón propio para `FloorUnitsEditor`

### Por qué no reusa los componentes de grupo de la Fase 1

La investigación previa a esta fase (leer `FloorUnitsEditor.tsx` completo,
1484 líneas) encontró dos incompatibilidades de fondo con forzar el mismo
`UnitFormValues`/`*Group.tsx` de la Fase 1:

1. **Modelo de persistencia distinto.** Los grupos de la Fase 1 asumen
   autoguardado optimista por campo (`onChange` → PATCH inmediato).
   `FloorUnitsEditor` no autoguarda nada: hay un solo `<form>` que envuelve
   todas las secciones y un único botón "Guardar cambios" que persiste
   `form` + `rooms` + `levels` juntos (`handleSubmit`), incluyendo el paso
   de `mergeDelimitation` que reconcilia los ambientes con el polígono/tour
   que ya escribió `UnitRoomsEditor` en `/plano` — cambiar esto a
   autoguardado por campo arriesga romper esa reconciliación.
2. **~13 campos que depto no tiene** (cochera cubierta/descubierta,
   condición, características, livings/cocinas/otros ambientes, expensas,
   altura de techo, superficie de terreno, cantidad de plantas) más
   `rooms`/`levels` como arrays completos con su propio editor de lista
   plana (nombre/tipo/m²/fotos por ambiente) — sin relación con la ruta
   `/ambientes` de depto, que sigue siendo `UnitRoomsEditor` con polígono
   y tour.

Forzar esto en `UnitFormValues`/los 5 `*Group.tsx` compartidos le mete a
un shell de depto ya en producción una tercera rama de casos (lote / depto
/ casa) para campos que depto nunca usa. Se descartó (opción A) a favor de
reorganizar los bloques que ya existen en un acordeón propio de casa
(opción B), sin tocar `lib/unit-fields.ts` ni `components/admin/unit-groups/*`.

### Las 7 secciones del acordeón

Mismo criterio de agrupación que depto, contenido propio de casa. Todas
aplican siempre (no hay lote dentro de `FloorUnitsEditor` — lote pasa por
`UnitsEditor`/Fase 1):

1. **Datos** — nombre, modelo, condición/antigüedad, composición
   (dormitorios/baños/plantas/livings/cocinas/otros ambientes — contadores
   read-only cuando `programActive`).
2. **Superficies** — áreas total/interna/externa, superficie de terreno,
   altura de techo.
3. **Comercial** — precio, moneda, expensas, estado de venta.
4. **Comodidades** — orientación del frente (`TourOrientationControl`) +
   pills de características (`UNIT_FEATURE_GROUPS`). Ocupa el lugar
   conceptual de "Recorrido 360°" de depto — en casa el 360° vive en el
   paso aparte del wizard (`UnitRoomsEditor`), no acá.
5. **Ambientes** — el editor de lista plana existente (nombre/tipo/m²/
   fotos por ambiente), con el link "Delimitar en el plano →" intacto.
6. **Planos e imágenes** — foto interior + planos 3D por planta + planos
   técnicos.
7. **Galería** — `MultiImageUploader`, sin cambios.

### Comportamiento del acordeón

Una sola sección abierta a la vez (igual que el tab-switcher actual,
`casaTabDefs`) — decisión explícita para minimizar riesgo de layout: abrir
varias a la vez con formularios de esta densidad puede volver la página
excesivamente larga, y el comportamiento actual (una pestaña visible)
ya es el que los usuarios conocen. Solo cambia la presentación visual
(acordeón en vez de tabs), no la lógica de qué está abierto.

Cada ítem del acordeón lleva el mismo lenguaje visual de punto de estado
(●/◐/○) que el menú lateral de la Fase 1, pero como un registro propio
(no `UNIT_GROUP_NAV` — acá no son rutas, son secciones de un acordeón
dentro de un único formulario).

### Alcance de la extracción

Dado el acoplamiento real de `FloorUnitsEditor` (estado compartido entre
`form`, `rooms`, `levels`, `activePlanta`, `programActive`,
`derivedCounts` — ver investigación), la extracción se limita a:

- Un componente `Accordion`/`AccordionItem` de UI (nuevo, en
  `components/ui/`), con soporte para punto de estado y una sola sección
  abierta a la vez.
- Regrupar el contenido que HOY vive en la pestaña "Datos" (4 cards:
  Identidad y superficies, Composición, Orientación del frente,
  Comodidades) en las secciones 1-4 de arriba — es un cambio de
  organización visual, no de lógica: los inputs, handlers y el estado
  siguen siendo los mismos, solo cambian de contenedor.
- Las pestañas "Ambientes", "Planos e imágenes" y "Galería" pasan a ser
  secciones 5-7 del acordeón tal cual están hoy (sin split adicional).

No se extraen los bloques a archivos nuevos separados por sección — dado
el acoplamiento de estado documentado, mover JSX de lugar dentro del mismo
archivo es de mucho menor riesgo que separar en 7 componentes con props
propias. Si en la implementación se ve una extracción segura y de bajo
riesgo para alguna sección puntual, se hace; si no, se prioriza no romper
nada sobre la pureza de la separación de archivos.
