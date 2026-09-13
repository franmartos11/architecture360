# Editor de pisos — lista compacta (Fase 3)

**Fecha:** 2026-09-13
**Pantalla:** `app/admin/(authenticated)/(project)/edificios/[id]/page.tsx`, rama `hasFloorStep`
**Fases previas:** `2026-09-13-editor-unidades-por-grupos-design.md` (Fase 1: shell de rutas para la unidad; Fase 2: acordeón para el editor de casa)

## Objetivo

Llevar la pantalla donde se ven y seleccionan los pisos al mismo lenguaje
visual y de interacción que la Fase 1 dejó en `UnitsEditor`, que es la
pantalla inmediatamente siguiente en el flujo. Hoy las dos pantallas
contiguas del mismo flujo se ven y se manejan distinto.

## Por qué

La pantalla quedó atrás en cinco puntos concretos y verificables:

1. **Tabla de 7 columnas con `overflow-x-auto`** (líneas 350-449). Celdas
   de `px-6 py-3` y una columna con `min-w-[280px]`: en un portátil hay
   que scrollear horizontalmente para llegar a "Completitud" y a las
   acciones.
2. **Un `ImageUploader` completo incrustado en cada fila** (línea 403).
   Es un componente con drag&drop, preview, estado de subida y campo de
   URL de respaldo. Con 20 pisos hay 20 instancias montadas, cada una
   dentro de una celda de tabla.
3. **La fila no es clickeable.** Para entrar a las unidades hay que
   apuntarle al link "Unidades →", que compite con otros tres links de
   texto pegados a su derecha (Duplicar / Aplicar plantilla / Borrar).
4. **La completitud es texto suelto** ("Sin unidades ni plano", "3 sin
   foto", "Completo") en ámbar y verde, en vez de los puntos de estado y
   pills que ahora usan el shell de unidades y el acordeón de casa.
5. **Los stat cards de arriba son decorativos** (líneas 302-306,
   componente local en 607-614). En `UnitsEditor` los stat cards son los
   filtros de la lista.

A eso se suma que la tarjeta "Datos del edificio" ocupa ~250px fijos
arriba de todo, y que el alta de piso es un formulario permanente al pie
con un segundo `ImageUploader`.

## Decisiones tomadas

Dos bifurcaciones se resolvieron antes de este documento:

- **La edición sigue en la fila**, en versión compacta al estilo
  `UnitsEditor` (click-para-editar), no en una pantalla propia del piso ni
  en un panel lateral. El panel lateral se descartó explícitamente: es el
  patrón que la Fase 1 sacó por apretar la grilla.
- **Entra toda la pantalla**, no sólo la tabla: cabecera, datos del
  edificio, stat cards, lista y alta de piso.

## Arquitectura

Tres capas, igual que la Fase 1:

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Lógica pura | `lib/floor-status.ts` (nuevo) | derivar estado y etiqueta de completitud de un piso |
| UI compartida | `components/ui/Accordion.tsx` (mod), `components/ui/HeadCheck.tsx` (nuevo), `components/ui/FilterStat.tsx` (nuevo) | piezas que usan tanto pisos como unidades |
| Pantalla | `components/admin/FloorsEditor.tsx` (nuevo), `components/admin/FloorPlanModal.tsx` (nuevo), `edificios/[id]/page.tsx` (mod) | composición |

`FloorsEditor` es a los pisos lo que `UnitsEditor` es a las unidades:
posee la sección completa de pisos (stat cards, barra de selección
múltiple, lista, alta rápida, modales). `page.tsx` mantiene el único
`fetch` que ya hace y le pasa los datos.

### Contrato de `FloorsEditor`

```
buildingId: string
floors: FloorRow[]
unitSummaries: FloorUnitSummary[]
onChanged: () => void        // el `load()` que ya existe en page.tsx
```

Estado propio: selección múltiple, filtro activo, campos del alta rápida,
piso con el modal de plano abierto, piso a duplicar, piso al que aplicar
plantilla.

## A. Estructura de la pantalla

De arriba hacia abajo:

1. **Cabecera** — `← Edificios`, nombre del edificio, slug, y a la
   derecha el botón "Recorrido 360° de la torre →" que ya existe. Sin
   cambios de contenido; se mantiene tal cual.
2. **"Datos del edificio", plegable** — nombre, pisos declarados, foto y
   el botón Guardar dentro de un `AccordionItem` colapsable. Cerrado por
   defecto cuando el edificio ya tiene foto de portada; abierto cuando
   falta. El punto de estado es `complete` con foto cargada y `partial`
   sin ella. El párrafo explicativo de "Pisos declarados" (líneas 293-297)
   se mantiene dentro de la sección desplegada.
3. **Stat cards que filtran** — reemplazan a los tres decorativos:
   - `Todos` → `floors.length`
   - `Sin plano` → pisos sin `plan_image`, en ámbar si es > 0
   - `Sin unidades` → pisos de tipo `units` con 0 unidades, en ámbar si es > 0

   El dato "X de Y declarados" no es un filtro, así que no es un stat
   card: sigue viviendo en el aviso ámbar del punto 4.
4. **Aviso ámbar de pisos faltantes** — se mantiene exactamente como está
   (líneas 308-324), incluido su botón "Crear los N pisos".
5. **La lista**, descrita en la sección B.

No hay buscador. Los pisos se ordenan por número, son típicamente menos de
cuarenta y se leen de un vistazo; un buscador sería una caja vacía
ocupando espacio. Esto es una diferencia deliberada con `UnitsEditor`,
donde un piso puede tener cientos de unidades.

## B. Anatomía de la fila

La tabla se reemplaza por filas flex dentro de una `Card`, con la misma
densidad que la lista de unidades (`py-2`, `text-xs`, controles `h-7`).
**La fila entera es clickeable** y navega a
`/admin/edificios/{buildingId}/pisos/{floorId}`, que es lo que hoy hace el
link "Unidades →".

```
[✓] ● 3   Planta 3        🏠 Departamentos ▾   [img]   12 unidades · Completo     ⧉ ▦ ×
[✓] ● 4   Planta 4        🏠 Departamentos ▾   [ + ]    8 unidades · 3 sin foto    ⧉ ▦ ×
[✓] ● 5   Amenities       🏊 Amenities ▾       [img]   Completo                    ⧉ ×
            Pileta y solárium
```

Columnas, en orden:

| Elemento | Ancho | Comportamiento |
|---|---|---|
| Checkbox | `w-8` | `HeadCheck`, detiene la propagación del click |
| Punto de estado | `w-5` | color según `lib/floor-status.ts` |
| Número | `w-10` | sólo lectura |
| Etiqueta | `w-44` | click-para-editar, guarda en `onBlur` y con Enter |
| Tipo | `w-40` | `select` compacto `h-7` con el icono de `FLOOR_KIND_OPTIONS` |
| Plano | `w-14 h-10` | miniatura, o recuadro punteado "+ plano"; abre el modal |
| Completitud | `flex-1 min-w-0` | conteo de unidades más la etiqueta de estado |
| Acciones | `shrink-0` | íconos, no links de texto |

Para pisos de tipo distinto de `units`, la descripción
(`floor_kind_description`) aparece como segunda línea bajo la etiqueta,
también click-para-editar. Es el mismo dato y la misma condición que hoy
(líneas 393-400), sólo cambia la presentación.

Las acciones dejan de ser cuatro links de texto: "Unidades →" pasa a ser
el click de la fila, y quedan tres íconos con `title` — duplicar (`⧉`),
aplicar plantilla (`▦`, sólo cuando hoy aparece: piso de unidades, sin
unidades, y más de un piso en el edificio) y borrar (`×`). Todos detienen
la propagación del click de la fila.

### El modal de plano

`FloorPlanModal` es el cambio que resuelve el problema de fondo del punto
2: en vez de N uploaders montados, hay como mucho uno. Sigue el patrón de
modal ya establecido en `DuplicateFloorModal` (overlay
`fixed inset-0 bg-black/40`, caja `bg-white rounded-2xl shadow-xl`),
contiene un único `ImageUploader` con `folder="floorplans"`, y al cambiar
la URL persiste con el mismo `PATCH` que ya usa `handleUpdateFloor`.

La miniatura en la fila cumple una segunda función: ver de un vistazo qué
pisos tienen plano, que es justamente lo que el stat card "Sin plano"
filtra.

## C. Lenguaje de estado

`lib/floor-status.ts` expone la derivación como lógica pura y testeable,
en la línea de `lib/unit-fields.ts` y `unit-groups/registry.ts` de la
Fase 1.

```ts
export type FloorStatus = 'complete' | 'partial' | 'empty';

export interface FloorStatusInput {
  floorKind: FloorKind;
  hasPlan: boolean;
  totalUnits: number;
  missingPhoto: number;
  missingPrice: number;
}

export function floorStatus(input: FloorStatusInput): FloorStatus;
export function floorStatusLabel(input: FloorStatusInput): string;
```

Reglas para pisos de tipo `units`:

| Condición | Estado |
|---|---|
| sin plano y sin unidades | `empty` |
| con plano, con unidades, sin fotos ni precios faltantes | `complete` |
| cualquier otro caso | `partial` |

Para cualquier otro tipo de piso (amenity, oficinas, técnico, cochera,
otro) las unidades no aplican: `complete` con plano, `empty` sin plano.

Los colores son los mismos tres que ya usan el shell de unidades y el
acordeón de casa: `bg-brand-500` para completo, `bg-amber-400` para
parcial, `bg-gray-200` para vacío.

`floorStatusLabel` devuelve el texto que va a la derecha del conteo y
preserva los mensajes que la pantalla ya muestra hoy (líneas 409-429). Se
compone así, en este orden exacto:

| Caso | Devuelve |
|---|---|
| tipo ≠ `units`, con plano | `"Completo"` |
| tipo ≠ `units`, sin plano | `"Falta el plano"` |
| `units`, 0 unidades, sin plano | `"Sin unidades ni plano"` |
| `units`, 0 unidades, con plano | `"Sin unidades"` |
| `units`, con unidades | ver abajo |

Con unidades cargadas se arma una lista de faltantes, en este orden:
`"falta el plano"` si no hay plano, `"N sin foto"` si `missingPhoto > 0`,
`"N sin precio"` si `missingPrice > 0`. Si la lista queda vacía devuelve
`"Completo"`; si no, une sus elementos con `" · "`.

Los faltantes van en minúscula porque son fragmentos de una enumeración
("falta el plano · 3 sin foto"), mientras que los cuatro mensajes de las
primeras filas son frases sueltas y van capitalizados. El conteo de
unidades no forma parte de este string: la fila lo muestra aparte, a su
izquierda.

El conteo de faltantes sigue respetando el caso showcase que ya está
resuelto en `completeness()` (líneas 84-88): si `typeConfig.showPrice` es
falso, los precios faltantes no se cuentan. Ese cálculo se mantiene donde
está; `floor-status.ts` recibe el número ya calculado.

## D. Alta de piso

El formulario permanente al pie (líneas 451-498) se convierte en la fila
`+` del pie de la lista, con el mismo patrón que el alta de unidad de
`UnitsEditor` (líneas 500-523): número, etiqueta, tipo y "Agregar piso",
todo en una fila de `h-8`, con Enter para agregar sin sacar la mano del
teclado.

Dos cosas salen del alta:

- **El `ImageUploader`**, que era el segundo uploader permanente de la
  página. El plano se sube después desde la miniatura de la fila.
- **La descripción del tipo de piso**, que hoy aparece condicionalmente
  al elegir un tipo distinto de `units`. Se edita en la fila una vez
  creado el piso, donde ya es editable.

Las dos son un paso menos al dar de alta, y ninguna pierde capacidad: los
dos campos siguen siendo editables desde la fila.

## E. Extracción de piezas compartidas

Dos componentes que hoy viven como funciones locales al final de
`UnitsEditor.tsx` pasan a `components/ui/`, porque esta pantalla necesita
exactamente los mismos:

- `HeadCheck` (hoy `UnitsEditor.tsx:578-588`) → `components/ui/HeadCheck.tsx`
- El stat card clickeable (hoy `UnitsEditor.tsx:566-576`) →
  `components/ui/FilterStat.tsx`

`UnitsEditor.tsx` pasa a importarlos y borra sus definiciones locales. Su
render no cambia en nada: mismo marcado, mismas clases.

El `StatCard` decorativo local de `edificios/[id]/page.tsx` (líneas
607-614) se borra, porque los tres stat cards que lo usaban pasan a ser
`FilterStat`.

## F. Extensión del `Accordion`

`components/ui/Accordion.tsx` gana una prop `collapsible` en `Accordion`:

```ts
export function Accordion({
  value, onChange, collapsible = false, children,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Permite cerrar la sección abierta volviendo a clickear su cabecera. */
  collapsible?: boolean;
  children: ReactNode;
})
```

`AccordionItem` pasa a llamar `ctx.onChange(open && ctx.collapsible ? '' : value)`.
`collapsible` viaja por el contexto junto a `value`/`onChange`.

Con el valor por defecto `false`, `FloorUnitsEditor` —el editor de casa de
la Fase 2, único consumidor actual— no cambia de comportamiento: sigue
teniendo siempre una sección abierta, que es la decisión de diseño
aprobada para esa pantalla.

Esto cierra el hallazgo menor #5 aparcado en la revisión final de la
Fase 2 ("clickear una cabecera abierta no la colapsa"), que se había
dejado pendiente justamente porque no había ningún consumidor que
necesitara lo contrario. Ahora lo hay.

## Fuera de alcance

- **Las otras dos ramas de `edificios/[id]/page.tsx`.** La rama de casa
  (`isSingleHouse`) redirige y no dibuja nada; la de loteo/dúplex muestra
  una tarjeta de "Plano de subdivisión" sin lista de pisos. Ninguna tiene
  la pantalla que este documento rediseña.
- **El modelo de datos y las rutas de API.** No se toca ningún endpoint:
  se siguen usando los mismos `POST /api/admin/floors`,
  `PATCH /api/admin/floors/{id}` y `DELETE /api/admin/floors/{id}`.
- **`DuplicateFloorModal` y `ApplyTemplateModal`.** Se siguen invocando
  igual, sólo cambia el control que los dispara.
- **El wizard** (`/admin/wizard?step=piso`). El link "🪄 Usar el
  asistente →" se mantiene en la cabecera de la lista.

## Testing

El repositorio corre vitest con `include: ['**/*.test.ts']` — sólo `.ts`,
sin tests de componentes. La superficie testeable de esta fase es
`lib/floor-status.ts`, que se cubre en `lib/floor-status.test.ts`:

- piso de unidades sin plano y sin unidades → `empty`, "Sin unidades ni plano"
- piso de unidades con plano y sin unidades → `partial`, "Sin unidades"
- piso de unidades completo → `complete`, "Completo"
- piso de unidades con fotos faltantes → `partial`, "3 sin foto"
- piso de unidades con fotos y precios faltantes → `partial`, unidos con " · "
- piso de unidades con unidades pero sin plano → `partial`, incluye "falta el plano"
- piso de amenities con plano → `complete`; sin plano → `empty`, "Falta el plano"
- piso de amenities con 0 unidades → `complete` igual, porque las unidades no aplican

El resto se verifica por revisión de diff y por recorrido en el navegador.

## Relación con las fases previas

| Fase | Pantalla | Patrón elegido | Por qué |
|---|---|---|---|
| 1 | unidad individual | shell de rutas con grupos | muchos campos, autosave por campo, navegación profunda |
| 2 | editor de casa | acordeón en una página | borrador único con un solo submit, no se puede partir en rutas |
| 3 | lista de pisos | lista compacta editable en la fila | es una lista, no un formulario: el objetivo es ver muchos pisos a la vez y entrar a uno |

Las tres comparten el mismo vocabulario visual: puntos de estado
brand/ámbar/gris, densidad compacta, y la acción principal a un click de
distancia.
