# Tarea 3 — Cochera marcada en el plano del piso de cocheras

Reporte de implementación. Worktree: `.claude/worktrees/agent-a756fb6d023baebba`.

## Qué quedó hecho

Un depto ahora puede tener sus cocheras **dibujadas sobre el plano del piso de
cocheras** (el subsuelo), y el comprador las ve en la ficha pública con su
espacio resaltado. La carga es masiva: se entra una sola vez al plano del
subsuelo y se marcan las 20 cocheras eligiendo el depto de un desplegable.

### 1. Base de datos — `supabase/schema.sql`

Columna nueva `units.parking_spots jsonb not null default '[]'::jsonb`, en dos
lugares y con el estilo de las columnas vecinas:

- dentro del `create table if not exists units (...)` (bases nuevas);
- como `alter table units add column if not exists ...` después del bloque de
  `garage_covered` / `garage_uncovered` (bases ya creadas).

No se tocó ninguna columna vecina, no hay `unique`, ni índices, ni `update` de
backfill. **La migración NO está aplicada** (ver "Qué tiene que correr el
usuario").

Cada elemento del jsonb: `{ floorId, label?, polygon: [{x,y}, …] }`, con `x`/`y`
en % sobre el `plan_image` del piso referenciado — las mismas coordenadas que
`units.polygon` y `units.rooms`. Los contadores `garage_spaces` /
`garage_type` / `garage_covered` / `garage_uncovered` **no se tocaron**: siguen
siendo "cuántas", esto es "cuál y dónde".

### 2. Tipos

- `types/database.ts`: `UnitRow.parking_spots: ParkingSpot[] | null` (null =
  base sin la migración). Dos helpers de test que arman una `UnitRow` completa
  (`lib/unit-fields.test.ts`, `components/admin/unit-groups/registry.test.ts`)
  suman `parking_spots: null`.
- `types/index.ts`: `ParkingSpot` (forma guardada) y `UnitParkingSpot`
  (`ParkingSpot` + `planImage` + `floorLabel`, resueltos para el público), y
  `Unit.parkingSpots?: UnitParkingSpot[]`.
- `lib/unit-fields.ts` **no** se tocó, a propósito: ahí viven los campos del
  *formulario* de la unidad (`UnitFormValues`, los grupos de
  `components/admin/unit-groups/*`), y la cochera no se carga desde la ficha de
  la unidad sino desde el plano del piso. Meterla ahí habría implicado la
  solapa por unidad que el usuario descartó.

### 3. API

- `app/api/admin/units/[id]/route.ts`: `parkingSpots → parking_spots` en el
  `FIELD_MAP` del PATCH. Sin sanitización de texto (no es texto libre del
  `TEXT_FIELD_MAX_LENGTH`) y sin validación de forma, igual que `polygon`,
  `rooms` y `levels` — misma política que ya tenía la casa para jsonb.
- `app/api/admin/units/route.ts` (POST): manda `parking_spots` **solo si el
  body lo trae**. Un alta normal no lo manda, así que sigue funcionando en una
  base sin la migración aplicada (el default `'[]'` se encarga).
- `app/api/admin/units/route.ts` (GET global): cada fila enriquecida suma
  `building_id`. Es lo único que faltaba para que la pantalla de cocheras
  liste, con **un solo fetch**, las unidades de todos los pisos del edificio
  (ya venían `floor_number` / `building_slug` / `building_name`, pero no el
  uuid del edificio, que es lo que la URL del admin conoce). La alternativa era
  un `fetch` por piso.
- Tests nuevos (patrón de la casa: `mockSupabase` / `jsonRequest`):
  `parkingSpots` se mapea tal cual; `parkingSpots: []` se distingue de "no
  mandar nada"; el alta normal no manda la columna y el alta con `parkingSpots`
  sí. El test existente del listado global se actualizó por `building_id`.

**Lo que NO cambié**: `app/api/admin/floors/[id]/duplicate/route.ts` y
`.../apply-template/route.ts` copian campos de unidad a unidad. No les agregué
`parking_spots` a propósito: duplicar un piso crearía deptos nuevos apuntando al
**mismo** espacio físico del subsuelo, o sea dos dueños para una cochera. La
cochera se marca a mano, una vez, sobre el plano.

### 4. Público — cómo llega el dato

El paso de conversión que había que encontrar es **`mapProject()` en
`data/project-repository.ts`**: ahí las filas snake_case de Supabase se
convierten en los tipos que consume el sitio (`room_plan_image` →
`roomPlanImage`). El campo nuevo viaja por ahí: `parking_spots` →
`parkingSpots`.

- `components/unit/ParkingPlanViewer.tsx` (nuevo): plano + `<svg viewBox="0 0
  100 100">` encima con el polígono resaltado y una etiqueta en el centroide.
  Mismo enfoque que `RoomPlanViewer` (imagen a proporción natural, zoom con
  `react-zoom-pan-pinch`), pero sin hover ni click: es "dónde está tu cochera",
  no un navegador de ambientes.
- `components/unit/tabs/PlanoTab.tsx`: cuarto botón **"Cochera"** en el selector
  que ya tenía Ambientes / Plano 3D / Plano técnico. Si el depto tiene cocheras
  en más de un subsuelo aparece un selector de subsuelo, con el mismo estilo que
  el selector de plantas que ya existía.
- `components/unit/UnitViewer.tsx`: `tabHasContent.plano` ahora también es true
  si hay cochera marcada (mismo criterio de "solapa sin contenido se oculta"), y
  la vista inicial del tab cae en `cochera` si no hay ambientes ni planos 3D /
  técnico.
- `lib/units.ts`: `drawnParkingSpots()` (solo las que tienen forma cerrada **y**
  plano) y `parkingFloorGroups()` (agrupadas por piso). Con tests en
  `lib/units.test.ts`.

### 5. Admin — pantalla de marcado masivo

`components/admin/FloorParkingDelimiter.tsx` (nuevo), enganchado en
`app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/plano/page.tsx`.

Flujo: **Agregar cochera** → dibujar el espacio con `PolygonCanvas`
(Rectángulo / Forma libre) → elegir el depto del desplegable → **se guarda
solo**. Elegir el depto es el último paso, así que al elegirlo se dispara el
PATCH y se puede seguir con la siguiente. También hay Guardar / Borrar
explícitos, etiqueta opcional ("C-12") y reasignación (cambiar el depto del
desplegable mueve la cochera: la saca del anterior y la pone en el nuevo, en dos
PATCH).

- El desplegable lista unidades de **todos los pisos del edificio**
  (`Piso 7 · 7B`), porque la cochera del subsuelo es de un depto de arriba.
- La cochera se guarda en **la unidad dueña** (`PATCH /api/admin/units/[id]` con
  `parkingSpots`), no en el piso.
- `PolygonCanvas` se usa **tal cual**, sin tocarlo (otro agente lo está
  modificando en paralelo; su interfaz no cambia).
- Aviso suave cuando un depto tiene más cocheras marcadas que las declaradas en
  su ficha (`garage_spaces`) — solo informativo, no bloquea ni toca el contador.

**Completar sin pisar lo cargado a mano**: el PATCH manda la lista *completa* de
`parkingSpots` de la unidad, así que antes de guardar se reconstruye como
`[cocheras de la unidad en OTROS pisos, tal cual estaban] + [las de este piso]`.
Marcar el subsuelo 2 nunca borra lo que ese mismo depto tenga marcado en el
subsuelo 1. Esa es la regla que implementa `buildParkingSpots()`, y está
explicitada en la UI con una nota al pie del panel.

## Las dos decisiones de diseño

### A. Dónde va la pantalla de marcado: reemplazo (con una salvedad)

**Decisión**: cuando el piso es `floor_kind = 'parking'`, el contenido de la
pantalla de plano **se reemplaza** por el marcador de cocheras, sin solapas.
Excepción: si ese piso igual tiene unidades propias cargadas, se muestran las
solapas con **Cocheras** primera y activa por defecto, más las dos de siempre.

**Por qué**: esa pantalla ya decide entre reemplazar y tabular según el
contexto, y no al revés — con `isSingleHouse` (casa) manda directo al editor de
ambientes sin solapas, y con `unitIsLand` (lote) muestra solo el delimitador y
esconde la solapa "Ambientes", porque un lote no tiene ambientes que marcar. Un
piso de cocheras está en la misma situación: no tiene unidades propias que
delimitar ni ambientes, así que las dos vistas de siempre quedarían vacías.
Seguir el patrón de la pantalla es reemplazar.

La salvedad existe para no volver inalcanzable un dato ya cargado: si alguien
cargó "unidades" dentro de un subsuelo (por ejemplo cocheras como unidades
vendibles, de una carga vieja), reemplazar a secas le sacaría la única pantalla
donde delimitarlas. Con unidades propias, entonces, las tres vistas conviven
como solapas.

### B. De dónde sale el `plan_image` del piso de cocheras: de `mapProject()`

**Decisión**: se resuelve en `mapProject()` de `data/project-repository.ts` y se
adosa a cada cochera (`planImage`, `floorLabel`) al armar el `Unit` público.

**Por qué**: la unidad guarda el `floorId` de su cochera, no la imagen, y el
fetch público de la unidad (`getUnitById` → `getProjectBySlug`) trae
la unidad por su piso, no por el subsuelo. Pero `mapProject()` ya recibe
**todos** los pisos del proyecto (`floorRows`) para armar los edificios: es el
único lugar del camino donde el dato ya está a mano. Resolverlo ahí no agrega
ninguna consulta, ni prop drilling desde la page hasta `PlanoTab`, y deja al
visor recibiendo lo mismo que recibe para los ambientes: una imagen y un
polígono en %. Es además el mismo paso donde `room_plan_image` se convierte en
`roomPlanImage`, que es el camino que el plan pedía reusar.

Las dos alternativas descartadas: (1) una consulta extra a `floors` desde la
página pública de la unidad — trabajo de más para un dato que ya estaba
cargado; (2) guardar la URL del plano dentro de cada `parkingSpot` — se
desincroniza en cuanto el admin cambia el plano del subsuelo.

Consecuencia documentada: si al piso de cocheras le sacan el plano, las cocheras
marcadas dejan de mostrarse (no rompen), porque `drawnParkingSpots()` exige
`planImage`. Los datos quedan intactos y vuelven a verse al recargar el plano.

## SQL que tiene que correr el usuario

**No tengo acceso a la base: la migración NO está aplicada.** Hasta que se
aplique, la pantalla de cocheras del admin va a fallar al guardar (la columna no
existe) y el sitio público simplemente no muestra el botón "Cochera". Nada más
se rompe: el alta de unidades y el resto del PATCH siguen andando.

Correr en el SQL editor de Supabase (es idempotente, se puede correr dos veces):

```sql
alter table units add column if not exists parking_spots jsonb not null default '[]'::jsonb;
```

Equivale a correr `supabase/schema.sql` entero, que ya lo incluye.

## Verificación

Todo desde la raíz del worktree.

```
$ npx tsc --noEmit -p .
(sin salida)
TSC_EXIT=0
```

```
$ npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"
 Test Files  1 failed | 106 passed (107)
      Tests  2 failed | 867 passed (869)
```

Los 2 que fallan son los preexistentes de `app/api/admin/bim/[id]/route.test.ts`
("se quedó sin resultados en la cola"), ajenos a esta tarea y ya avisados en el
plan. Antes de mis cambios la suite tenía 865 tests; los 4 nuevos (2 de rutas +
2 de `lib/units`) pasan:

```
$ npx vitest run app/api/admin/units --reporter=verbose
 ✓ POST /api/admin/units > alta normal: no manda parking_spots; si el body lo trae, sí
 ✓ PATCH /api/admin/units/[id] > parkingSpots se mapea a la columna parking_spots tal cual
 ✓ PATCH /api/admin/units/[id] > vaciar las cocheras: manda [] (no se confunde con "no mandar nada")
 Test Files  2 passed (2)
      Tests  27 passed (27)

$ npx vitest run lib/units.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

```
$ npx eslint <los 16 archivos tocados>
```
Sin errores propios. Quedan avisos y errores **preexistentes**, en líneas que no
toqué: `_payload is defined but never used` (convención de los tests de rutas que
ya estaba), `BimUnifiedViewer is defined but never used` en `UnitViewer.tsx`, y
tres `no-explicit-any` en `components/admin/unit-groups/registry.test.ts` (líneas
75/86/93 — mi cambio en ese archivo fue solo la línea 21).

No hay tests de componentes: no monté infraestructura para eso (restricción 2
del plan). Para el admin y el visor público la verificación fue typecheck + lint
+ suite.

## Riesgos y dudas

1. **Sin probar contra la base real.** No pude correr la migración ni abrir el
   admin: el flujo completo (dibujar → elegir depto → guardar → verlo en la
   ficha pública) está verificado por lectura y tipos, no a mano. Es lo primero
   que conviene probar después de aplicar el SQL.
2. **Sin validación de forma en el PATCH.** `parkingSpots` se guarda tal cual,
   igual que `polygon` / `rooms` / `levels`. Es la política que ya tenía la
   casa para jsonb; si se quiere endurecer, habría que hacerlo para los cuatro
   campos junto, no solo para este.
3. **El `floorId` de una cochera no tiene FK** (vive dentro de un jsonb). Si se
   borra el piso de cocheras, las cocheras quedan apuntando a un piso que no
   existe: no rompen nada (no se dibujan, porque no hay `planImage`), pero
   quedan como dato colgado. Es exactamente el mismo comportamiento que ya
   tienen los `floor.unit_dots` "huérfanos" del delimitador de unidades.
4. **Concurrencia.** Si dos personas marcan cocheras del mismo subsuelo a la
   vez, el último PATCH de una unidad gana (se manda la lista completa). Con un
   solo administrador no es un problema; con varios, la pantalla no avisa.
5. **`building_id` en el listado global de unidades** es un campo agregado: es
   aditivo y no rompe a los consumidores actuales (`/admin` e `inventory`), pero
   vale saber que ese endpoint ahora devuelve una clave más.
6. **Duda abierta**: si un depto vende su cochera o se reasigna entre deptos, hoy
   hay que entrar al plano del subsuelo y reasignarla desde ahí. Alcanza para lo
   pedido; un padrón de cocheras (espacios libres, venta suelta) quedó
   explícitamente fuera de alcance.
