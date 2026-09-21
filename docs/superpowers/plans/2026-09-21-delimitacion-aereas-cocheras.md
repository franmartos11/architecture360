# Plan — delimitación, vistas aéreas y cocheras

Tres cambios independientes, aprobados por el usuario el 2026-09-21. Se ejecutan
en paralelo, cada uno en su propio worktree, porque no comparten archivos.

## Contexto del proyecto

`my-app` es un panel de administración Next.js (App Router) + Supabase para
proyectos inmobiliarios: se cargan edificios, pisos, unidades (departamentos),
planos, vistas aéreas y tours 360°. Hay un admin (`app/admin/**`) y un sitio
público (`app/proyecto/**`). **Toda la UI y todos los comentarios de código van
en español rioplatense** (voseo: "cargá", "marcá", "elegí").

## Restricciones globales

Valen para las tres tareas:

1. **Ignorá por completo `.claude/worktrees/`** — es una copia de trabajo ajena
   que contamina búsquedas y tests.
2. **No hay tests de componentes en este repo** (0 archivos `.test.tsx`). Los
   tests existentes son de rutas de API y de `lib/`, con vitest, usando
   `mockSupabase` y `jsonRequest` de `lib/test-helpers/supabase-mock.ts`. **No
   montes una infraestructura de testing de componentes** — es scope creep. Para
   cambios de UI pura, la verificación es typecheck + lint + suite verde. Para
   rutas de API nuevas, sí escribí tests siguiendo el patrón existente (mirá
   `app/api/admin/floors/[id]/duplicate/route.test.ts` como modelo).
3. **Comandos de verificación** (todos desde la raíz de `my-app`):
   - `npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"`
   - `npx tsc --noEmit -p .`
   - `npx eslint <los archivos que tocaste>`
   Ojo: `app/api/admin/bim/[id]/route.test.ts` tiene **2 tests que ya fallaban
   antes** de este trabajo (le faltan entradas en la cola del mock). No los
   arregles ni te alarmes: es ruido preexistente y ajeno a estas tareas. El
   resto de la suite tiene que quedar verde.
4. **Sin zoom ni desplazamiento (pan)** en el lienzo de dibujo del admin. Se
   evaluó y se dejó fuera de alcance a propósito.
5. Seguí los patrones que ya existen en el repo (Tailwind, componentes de
   `components/ui/`, estilo de los comentarios). No refactorices cosas que no
   hacen falta para tu tarea.
6. Commiteá tu trabajo en tu worktree. Mensajes de commit en español.

---

## Tarea 1 — PolygonCanvas: botones fuera de la imagen y puntos más chicos

**Archivo a tocar: `components/admin/PolygonCanvas.tsx` y nada más.**

`PolygonCanvas` es el único motor de dibujo de polígonos del admin. Lo usan tres
pantallas sin modificarlo: delimitar edificios sobre una vista aérea
(`app/admin/(authenticated)/(project)/proyecto/aereas/[slideId]/page.tsx`),
delimitar unidades sobre un plano de piso (`components/admin/FloorUnitsDelimiter.tsx`)
y delimitar ambientes dentro de una unidad (`components/admin/UnitRoomsEditor.tsx`).

Queja textual del usuario: *"los botones de delimitar edificios dificultan poder
marcar la forma, al igual que los puntos que se ponen cuando clikeas, deberían
ser más pequeños"*.

### Requisito 1 — sacar los botones de encima de la imagen

Hoy el grupo "Listo / Deshacer / Vaciar esta forma" está en
`className="absolute top-2 right-2 …"` **dentro del contenedor de la imagen**
(alrededor de la línea 359). Son pastillas opacas y clickeables encima de la
foto: en una vista aérea esa esquina casi siempre tiene construcción, así que el
click va al botón en vez de al lienzo y no se puede dibujar ahí.

Reestructurá el render del componente para que la raíz sea una columna:
1. el contenedor de la imagen + SVG (mantiene `relative`, el borde y el redondeo);
2. **debajo**, una barra de acciones con esos tres botones.

Los carteles de ayuda que hoy están en `absolute top-2 left-1/2` ("Click para
cerrar la forma", y los del modo pin) también tapan la imagen: pasalos a esa
misma barra inferior como texto de ayuda. Mantené el texto en español tal cual.

La barra solo aparece cuando tiene algo que mostrar (hoy el grupo de botones se
renderiza condicionalmente; respetá esa lógica para no dejar una barra vacía
saltando el layout).

### Requisito 2 — puntos más chicos

Hoy cada vértice se dibuja **dos veces, superpuestos**:
- un `<circle>` SVG (alrededor de la línea 278) con `r={1.3}`, que además es el
  blanco de `onMouseDown` / `onDoubleClick`;
- encima, un globito HTML numerado de `width: 14, height: 14` px (alrededor de
  la línea 320).

Hay un defecto de fondo: el SVG usa `viewBox="0 0 100 100"` con
`preserveAspectRatio="none"`, así que **los círculos se estiran con la imagen** —
en una aérea apaisada el "punto" es un óvalo de ~15px de ancho por ~6px de alto.

El arreglo aprovecha esa duplicación:
- **El globito HTML pasa a ser el punto visible**: ~7px de diámetro, redondo
  (no se deforma porque es HTML), **sin el número adentro**, conservando el
  anillo blanco (`boxShadow`) para que se vea sobre cualquier fondo.
- **El `<circle>` SVG pasa a ser invisible** (`fill="transparent"`, sin trazo) y
  **más grande**, quedando solo como zona de agarre. Mirá cómo lo resuelve ya el
  pin en el mismo archivo (un `<circle r={2.5} fill="transparent">` aparte del
  ícono visible) y seguí ese patrón.

Resultado esperado: el punto se ve chico y prolijo, pero sigue siendo fácil de
agarrar para arrastrar.

**Conservá la señal visual de "estás por cerrar la forma"**: hoy, cuando el
cursor está cerca del primer punto (`nearFirstPoint`), ese primer círculo se
agranda y se pinta con el color de la forma. Reimplementalo sobre el globito
HTML (el primer punto se agranda un poco y se pinta), porque el círculo SVG ya
no se ve.

### Qué NO hacer

- No cambies la interfaz del componente (props, tipos exportados). Las tres
  pantallas que lo usan **no se tocan**.
- No agregues zoom ni pan.
- No rompas nada de lo que ya anda: arrastrar un vértice, doble click para
  borrarlo, cerrar la forma clickeando el primer punto, el modo rectángulo, el
  modo pin, deshacer (botón y Ctrl/Cmd+Z), Escape.

### Verificación

`npx tsc --noEmit -p .`, `npx eslint components/admin/PolygonCanvas.tsx`, y la
suite completa verde (salvo el ruido preexistente de bim). Revisá a conciencia,
leyendo el archivo entero, que los handlers de mouse sigan colgando del elemento
correcto después de mover cosas de lugar.

---

## Tarea 2 — Vistas aéreas: trabajar sobre todas las del proyecto

**Archivos principales:**
`app/admin/(authenticated)/(project)/proyecto/aereas/[slideId]/page.tsx`,
más un endpoint nuevo `app/api/admin/aerial-hotspots/bulk/route.ts` con su test.

Queja textual del usuario: *"al momento de cargar y delimitar las vistas aéreas
hacer que se pueda trabajar sobre todas las del mismo proyecto, sino es muy
complicado tener que volver a entrar a cada una cada vez"*.

### Cómo funciona hoy

Las vistas aéreas (`aerial_slides`) pertenecen **al proyecto** y sobre **cada
una** se delimitan **los mismos edificios** (`aerial_hotspots`, una fila por
slide+edificio, con `polygon` en % y un pin `x`/`y`). Con 3 aéreas y 5 torres son
15 delimitaciones repartidas hoy en 3 páginas distintas.

Para pasar de una aérea a la siguiente hay que volver a `/admin/proyecto`,
buscar la tarjeta y clickear "Delimitar": dos navegaciones, refetch completo, y
se pierde el edificio activo, el modo y el historial de deshacer.

**Dato clave**: la página **ya trae todas las aéreas del proyecto** — hace
`fetch('/api/admin/project')` y descarta todas menos la del `slideId` de la URL
(mirá el `.find()` y el `.filter()` dentro de `load`). El dato ya está; falta la
pantalla.

### Requisitos

1. **Tira de vistas aéreas**: mostrar todas las del proyecto (miniatura +
   etiqueta + un contador tipo "3 de 5 marcados") y permitir saltar entre ellas
   **sin navegar ni remontar la página**.
2. **El edificio activo se mantiene al cambiar de aérea.** Es el punto que más
   dolor saca: el usuario elige la Torre A una vez y la marca en las 3 fotos
   seguidas.
3. **Los cambios sin guardar dejan de perderse al cambiar de aérea.** Hoy
   `points` y `pinOverrides` están indexados solo por `buildingId`; pasalos a
   estar indexados por slide y por edificio.
4. **Sacar el refetch completo después de cada guardado.** Hoy `handleSave`
   termina llamando a `load()`, que re-pide todo el proyecto y pisa el estado
   local — con varias aéreas en juego eso borraría trabajo sin guardar de las
   otras. Actualizá el estado local de `hotspots` con lo que devuelve la
   respuesta.
5. **"Guardar todo"**: un botón que manda de una vez todo lo pendiente de todas
   las aéreas, contra el endpoint nuevo. Mostrá de alguna forma clara cuáles
   tienen cambios sin guardar.
6. **La URL sigue reflejando la aérea activa** para que los links que ya existen
   (`/admin/proyecto/aereas/<id>`, y el de `edificios/page.tsx` que agrega
   `?building=<id>`) sigan funcionando. Actualizala sin provocar un remonte ni
   un refetch.
7. **Avisar antes de salir** si hay cambios sin guardar.

### Endpoint nuevo

`POST /api/admin/aerial-hotspots/bulk` que reciba varios hotspots y haga upsert
de cada uno (PATCH si ya existe la fila slide+edificio, INSERT si no).

**Copiá la validación de seguridad del endpoint que ya existe**
(`app/api/admin/aerial-hotspots/route.ts`): verificar acceso al proyecto y que
**cada** slide y **cada** edificio pertenezcan a ese proyecto. No confíes en
nada del body. Devolvé un resultado por ítem para que la UI pueda informar.

Escribí su test siguiendo el patrón de la casa (`mockSupabase`, `jsonRequest`),
cubriendo al menos: sin acceso → 401; un slide o edificio de otro proyecto →
rechazado; y el camino feliz con varios ítems.

### Qué NO hacer

- No cambies el modelo de datos ni las tablas.
- No toques `components/admin/PolygonCanvas.tsx` — otro agente lo está
  modificando en paralelo. Usalo tal como está, su interfaz no cambia.
- No rediseñes la grilla de tarjetas de `/admin/proyecto`; como mucho ajustá a
  dónde apunta el link "Delimitar" si hace falta.

### Verificación

Suite completa verde (salvo el ruido preexistente de bim), `npx tsc --noEmit -p .`
y eslint sobre lo que tocaste.

---

## Tarea 3 — Cochera marcada en el plano del piso de cocheras

**La más grande: toca base de datos, admin y sitio público.**

Pedido del usuario: *"agregar, en caso de que un depto tenga estacionamiento, la
imagen con ese espacio específico marcado"*. Ya decidió **cómo** quiere cargarlo:
sube el plano de cocheras **una sola vez** (en el piso de tipo Cochera que ya
existe) y después marca, **desde ese mismo plano**, qué espacio le toca a cada
departamento, eligiendo el depto de un desplegable. Cargar 20 cocheras tiene que
ser una sola sentada, no entrar a 20 deptos.

### Lo que ya existe (no lo rehagas)

- **La imagen ya se puede subir hoy**: un piso con `floor_kind = 'parking'`
  (etiqueta "Cochera", ver `lib/floorKinds.ts`) usa el mismo campo
  `floors.plan_image` que cualquier otro piso. Media funcionalidad está hecha.
- En `units` hay **contadores** de cochera (`garage_spaces`, `garage_type`,
  `garage_covered`, `garage_uncovered`) que hoy se muestran como texto en la
  ficha pública. **No los toques ni los reemplaces**; lo que agregás es otra
  cosa: *cuál* es el espacio.
- El patrón "imagen + forma marcada encima" ya está resuelto dos veces:
  `floors.plan_image` + `units.polygon`, y `units.room_plan_image` +
  `units.rooms`. Mirá `components/admin/UnitRoomsEditor.tsx` (admin) y
  `components/unit/RoomPlanViewer.tsx` (público) y **copiá ese patrón**.

### El detalle que condiciona el diseño

La cochera del depto 7B está dibujada sobre el plano del **subsuelo**, no sobre
el plano del piso 7. El campo `units.polygon` que ya existe es la silueta de la
unidad **en su propio piso**, así que no sirve: hace falta un campo nuevo que
guarde, por unidad, **en qué piso** está su cochera y **qué forma** tiene.

### Modelo de datos

Columna nueva en `units`:

```
parking_spots jsonb not null default '[]'::jsonb
```

Cada elemento: `{ floorId: string, label?: string, polygon: [{x, y}, …] }`, con
`x`/`y` en porcentaje sobre el `plan_image` del piso referenciado — las mismas
coordenadas que usa todo el resto del sistema. Es una lista (no un solo espacio)
porque el sistema ya permite deptos con más de una cochera (`garage_spaces`).

`supabase/schema.sql` en este repo es un script idempotente: agregá la columna
con el mismo estilo `alter table … add column if not exists …` que usan las
columnas vecinas. **No podés correr la migración vos** (no hay acceso a la base):
dejá dicho en tu reporte que el usuario tiene que aplicarla.

Actualizá también los tipos (`types/database.ts`, `types/index.ts`) y el mapeo
de la API de unidades (`app/api/admin/units/route.ts` y
`app/api/admin/units/[id]/route.ts`), siguiendo cómo están mapeados los campos
vecinos. Mirá si `lib/unit-fields.ts` también corresponde.

**Averiguá vos mismo** cómo un campo como `room_plan_image` termina llegando al
sitio público como `unit.roomPlanImage`, y hacé que el campo nuevo viaje por ese
mismo camino. Hay un paso de conversión que tenés que encontrar.

### Admin — pantalla de marcado masivo

Sobre el plano del piso de cocheras. La pantalla de delimitar de un piso es
`app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/plano/page.tsx`
(hoy con solapas para unidades y ambientes, usando `components/admin/FloorUnitsDelimiter.tsx`).

Cuando el piso es de tipo `parking`, el usuario tiene que poder:
- ver el plano del piso con `PolygonCanvas`;
- **agregar una cochera**: marcar su forma y elegir de un desplegable a qué
  departamento pertenece. El desplegable lista unidades de **todos los pisos del
  mismo edificio** (la cochera del subsuelo es de un depto del piso 7), no solo
  del piso actual;
- ver la lista de cocheras ya marcadas, con el depto de cada una, y poder
  borrarlas o reasignarlas;
- opcionalmente ponerle una etiqueta (ej. "C-12").

Decidí vos la forma concreta (solapa nueva, o reemplazo del contenido cuando el
piso es de tipo cochera) siguiendo lo que ya hace esa pantalla. Justificá la
decisión en tu reporte.

Guardá contra la API de unidades que ya existe (PATCH de la unidad con su
`parkingSpots`). Ojo: una cochera se guarda en **la unidad dueña**, no en el
piso — tenelo en cuenta al armar el guardado.

### Público — ficha del departamento

`components/unit/tabs/PlanoTab.tsx` ya tiene un selector con
"Ambientes / Plano 3D / Plano técnico" (alrededor de la línea 60). Agregá un
cuarto botón **"Cochera"** que muestre el plano del piso de cocheras con **el
espacio de este depto resaltado**, reusando el enfoque de
`components/unit/RoomPlanViewer.tsx` (imagen a proporción natural + `<svg
viewBox="0 0 100 100">` encima con el polígono).

El botón **solo aparece si el depto tiene al menos una cochera marcada** — mismo
criterio de "solapa sin contenido se oculta" que ya usa `components/unit/UnitViewer.tsx`
(mirá `tabHasContent`). Para pintarlo necesitás el `plan_image` del piso de
cocheras referenciado: resolvé de dónde sacarlo en el fetch público y dejalo
documentado en tu reporte.

### Qué NO hacer

- **No** construyas un padrón/inventario de cocheras (cocheras libres, venta de
  cocheras sueltas). Se evaluó y se descartó por alcance.
- **No** agregues una solapa "Cochera" por unidad en el admin: el usuario eligió
  explícitamente la carga masiva desde el plano.
- **No toques `components/admin/PolygonCanvas.tsx`** — otro agente lo está
  modificando en paralelo. Usalo tal como está; su interfaz no cambia.
- No toques los contadores de cochera que ya existen.

### Verificación

Suite completa verde (salvo el ruido preexistente de bim), `npx tsc --noEmit -p .`,
eslint sobre lo que tocaste, y tests para los cambios de rutas de API siguiendo
el patrón de la casa.
