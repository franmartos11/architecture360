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

**Fase 2 — `FloorUnitsEditor` sobre los mismos grupos**
Mapear los campos extra de casa (cochera, condición, características,
expensas, plantas) a los grupos, agregando los que falten al registro;
reemplazar los bloques inline por el acordeón.

## Riesgos

- **La fase 2 es más grande de lo que parece**: casa tiene ~15 campos que
  no existen en depto. Si al mapearlos aparecen grupos nuevos que no
  encajan, se replantea la fase 2 por separado sin bloquear la 1.
- **Regresión en el wizard**: es el flujo de alta inicial del proyecto.
  La fase 2 no se toca hasta que la 1 esté validada en navegador.
- **Pérdida del panel lateral**: si en uso real la navegación ← → no
  compensa para carga masiva, la vuelta atrás es agregar a la tabla las
  columnas editables que falten, no resucitar el panel.
