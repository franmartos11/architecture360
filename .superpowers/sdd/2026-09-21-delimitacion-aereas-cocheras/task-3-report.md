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

## Ronda de corrección 1

El redespacho anterior de esta corrección se había caído por límite de cuenta
antes de escribir código (árbol en `e8240c1`, limpio). Este es ese mismo
trabajo, retomado desde cero en el mismo worktree, sobre los cuatro hallazgos
del brief (`task-3-fix-round-1-brief.md`). Las dos decisiones de diseño ya
ratificadas (reemplazo de pantalla en piso de cocheras, resolución del plano
en `mapProject()`) no se tocaron.

### Hallazgo 1 — floorId de `parking_spots` sin remapear al duplicar

**Arreglo elegido: remapear, no excluir.** Agregué `remapParkingSpotFloors()`
en `lib/units.ts` (al lado de los otros helpers de cocheras) y la usé en
`app/api/admin/buildings/[id]/duplicate/route.ts` y
`app/api/admin/projects/[id]/duplicate/route.ts`, donde antes el spread de
`...rest` copiaba `parking_spots` tal cual.

Elegí remapear en vez de excluir (que es lo que hace `floors/[id]/duplicate`
y `apply-template`) porque el contexto es distinto: esos dos duplican DENTRO
del mismo edificio, así que copiar la cochera dejaría al depto nuevo
señalando el subsuelo de siempre — de ahí la exclusión deliberada del
implementador original. `buildings/[id]/duplicate` y `projects/[id]/duplicate`
en cambio copian el edificio (o el proyecto) ENTERO, subsuelo incluido: el
`floorIdMap` que arman dos líneas antes de la copia de unidades ya cubre el
piso de cocheras, así que remapear deja a la unidad copiada apuntando al
subsuelo de SU PROPIA copia — mismo resultado visual para el admin (la Torre
B nace con sus cocheras ya marcadas) sin el bug de dos deptos dueños del
mismo espacio. Excluir habría sido más simple pero peor: un dato ya cargado
a mano (la ubicación de 20 cocheras) desaparecería de la copia sin necesidad,
justo lo que el usuario pidió explícitamente evitar.

`remapParkingSpotFloors()` descarta (no rompe) una cochera cuyo `floorId` no
esté en el mapa — no debería pasar en el flujo normal (una cochera siempre
pertenece a un piso del mismo edificio que la unidad, y ese edificio se
duplica entero), pero cubre el caso de datos ya huérfanos de antes.

Tests nuevos: `lib/units.test.ts` (la función pura) y un test por endpoint
(`buildings/[id]/duplicate/route.test.ts`,
`projects/[id]/duplicate/route.test.ts` — **no existían antes**, los creé
siguiendo el patrón `mockSupabase`/`jsonRequest`, interceptando la llamada de
`.insert()` de unidades con un spy para poder inspeccionar el payload
insertado) que verifican el remapeo y el descarte de huérfanas.

### Hallazgo 2 — "Vaciar esta forma" podía borrar una cochera guardada

En `components/admin/FloorParkingDelimiter.tsx`, `buildParkingSpots()` armaba
la lista a persistir mirando solo el polígono EN VIVO de cada `WorkingSpot`
(`polygon.length >= 3`). "Vaciar esta forma" de `PolygonCanvas` llama a
`onPointsChange` con `[]` sin pasar por `onComplete` — es decir, dibuja un
estado "a medio redibujar", no un pedido de guardar ni de borrar. Si en ese
momento se guardaba OTRA cochera del mismo depto en el mismo piso, la
reconstrucción de la lista completa de esa unidad perdía la vaciada.

**Arreglo**: agregué `savedPolygon` a `WorkingSpot` (el último polígono
confirmado en la base — se completa al cargar y se actualiza en cada guardado
exitoso). `buildParkingSpots()` ahora usa el polígono en vivo si tiene forma
cerrada, y si no, cae a `savedPolygon` en vez de descartar el spot. Así,
resetear una forma sin guardar/borrar no le hace perder su dato persistido a
otro guardado disparado por una acción distinta.

No toqué `PolygonCanvas.tsx` (fuera de alcance, otro agente lo está tocando
en paralelo). El único residuo visual: la fila de la cochera "vaciada" sigue
mostrando "sin dibujar" en pantalla hasta que se recarga el plano o se
redibuja — ya no es pérdida de dato (queda intacto en la base), solo un
reflejo de que el admin todavía no terminó de redibujarla. Me pareció la
frontera correcta: el hallazgo era sobre pérdida de datos, no sobre pulir esa
UX.

### Hallazgo 3 — falla parcial al reasignar dejaba la cochera en dos deptos

`persist()` mandaba los dos PATCH de una reasignación con `Promise.all`
(en paralelo): si el de la unidad nueva salía bien y el de la anterior
fallaba, la base quedaba con la cochera en las dos.

**Arreglo**: `persist()` ahora es secuencial para el caso de dos destinos
(los llamadores — `handleSave`/`handleAssign` — ya pasaban `[dueña nueva,
dueña anterior]` en ese orden, no hizo falta tocarlos). Se aplica primero a
la unidad nueva; solo si eso sale bien se saca de la anterior. Si el segundo
PATCH falla, se intenta revertir el primero (un PATCH más, con el
`parking_spots` que tenía la unidad nueva ANTES de esta operación) para
volver al estado previo a la reasignación en vez de dejarla duplicada.
`persist()` devuelve `'ok' | 'error' | 'inconsistent'`: `'inconsistent'` es
el caso raro en que ni la reversión se pudo aplicar — ahí sí puede haber
quedado duplicada, y el toast dice explícitamente que hay que revisar a
mano, en vez del genérico "Error al guardar".

Elegí este orden (agregar-primero, sacar-después, con reversión) por sobre
sacar-primero-agregar-después porque ese segundo orden, ante la misma falla
parcial, termina en la cochera PERDIDA de las dos unidades (ni A ni B la
tienen) en vez de duplicada — peor resultado dado que el usuario pidió
explícitamente no perder datos cargados a mano. El caso con reversión exitosa
(el más común) no deja ningún residuo: la cochera queda exactamente como
estaba antes del intento fallido.

El caso de un solo destino (guardar sin reasignar, o borrar) sigue siendo un
solo PATCH — ahí no hay estado intermedio posible, no necesitaba este
tratamiento.

### Hallazgo 4 — pantalla de delimitar unidades inalcanzable en un loteo con piso Cochera

En `.../pisos/[floorId]/plano/page.tsx`, el render probaba
`view === 'cocheras'` ANTES que `unitIsLand`, así que un piso `floor_kind =
'parking'` dentro de un proyecto de lotes (donde `showTabs` es `false` por
`unitIsLand`, y no hay forma de cambiar `view` desde la UI) dejaba
`FloorUnitsDelimiter` inalcanzable — sin pantalla para delimitar los lotes
propios de ese piso.

**Arreglo**: dí vuelta la prioridad del ternario — `unitIsLand` ahora gana
sobre `view === 'cocheras'`, coherente con el criterio que ya usa `showTabs`
(`!unitIsLand && ...`: un loteo nunca tiene vista de cocheras). También
ajusté el ternario del título/instrucciones de arriba (`isParking &&
!unitIsLand`) para que no diga "Marcar cocheras en el plano" mientras en
realidad se muestra el delimitador de lotes — quedaría un texto mintiendo
sobre lo que hay en pantalla. No toqué el `useEffect` que decide el `view`
inicial (sigue poniendo `'cocheras'` aunque sea un loteo): es inofensivo,
porque el render ya lo ignora en ese caso, y tocarlo agregaba un warning de
`react-hooks/exhaustive-deps` sin ganar nada.

### Qué no toqué

Sin validación de forma del jsonb, sin tocar `PolygonCanvas.tsx` ni
`proyecto/aereas/**` ni `api/admin/aerial-hotspots/**`, sin resolver los
spots huérfanos al borrar/recrear un piso (diferido, inherente al diseño sin
FK), sin persistir la etiqueta antes de Guardar — todo según el brief.

### Verificación

```
$ npx tsc --noEmit -p .
(sin salida)
```

```
$ npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"
 Test Files  1 failed | 108 passed (109)
      Tests  2 failed | 877 passed (879)
```

Los 2 que fallan siguen siendo los mismos preexistentes de
`app/api/admin/bim/[id]/route.test.ts` ("se quedó sin resultados en la
cola"), ajenos a esta tarea — ya estaban así antes de esta ronda. Los 10
tests nuevos de esta ronda (3 de `lib/units.test.ts` para
`remapParkingSpotFloors`, 4 en el test nuevo de `buildings/[id]/duplicate`, 3
en el test nuevo de `projects/[id]/duplicate`) pasan:

```
$ npx vitest run lib/units.test.ts "app/api/admin/buildings/[id]/duplicate" "app/api/admin/projects/[id]/duplicate" --reporter=verbose
 Test Files  3 passed (3)
      Tests  24 passed (24)
```

```
$ npx eslint lib/units.ts lib/units.test.ts \
    "app/api/admin/buildings/[id]/duplicate/route.ts" "app/api/admin/buildings/[id]/duplicate/route.test.ts" \
    "app/api/admin/projects/[id]/duplicate/route.ts" "app/api/admin/projects/[id]/duplicate/route.test.ts" \
    components/admin/FloorParkingDelimiter.tsx \
    "app/admin/(authenticated)/(project)/edificios/[id]/pisos/[floorId]/plano/page.tsx"
```
Sin errores. Dos warnings preexistentes en su forma (`_rows is defined but
never used`), misma convención que ya usan los tests de rutas de la casa
(parámetro con `_` a propósito para poder tipar el spy).

No hay tests de componente para `FloorParkingDelimiter.tsx` ni para
`plano/page.tsx` (el repo no monta infraestructura para eso — restricción
del plan): la verificación ahí fue lectura + typecheck + lint + revisión
manual del flujo de estados.

### Riesgos y dudas que quedan

1. **Finding 2, residuo visual**: como se explica arriba, después de "Vaciar
   esta forma" sin redibujar ni borrar, la fila sigue diciendo "sin dibujar"
   en esa sesión aunque el dato siga intacto en la base (se ve bien de nuevo
   al recargar el plano). No me pareció parte del hallazgo (que era sobre
   pérdida de datos), pero lo dejo anotado por si se prefiere pulirlo.
2. **Sin probar contra la base real** — mismo límite que la implementación
   original: no tengo acceso a Supabase, así que no pude ejercitar a mano ni
   la duplicación de edificio/proyecto con cocheras cargadas, ni la
   reasignación con falla parcial simulada de verdad (esa parte se cubre acá
   solo con el test de `lib/units.test.ts` y la lectura del código; no hay
   test de componente que la ejercite).
3. **Orden de `persist()` para dos destinos**: depende de que los llamadores
   sigan pasando `[nueva, anterior]` en ese orden — es así hoy en los dos
   lugares que llaman con dos ids (`handleSave`, `handleAssign`), pero si en
   el futuro se agrega un tercer llamador con ese patrón, tiene que respetar
   el mismo orden o el rollback queda invertido.
