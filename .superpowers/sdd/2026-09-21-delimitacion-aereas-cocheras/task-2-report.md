# Tarea 2 — Vistas aéreas: trabajar sobre todas las del proyecto

Worktree: `agent-a27e4ccffd859046e`, rama `worktree-agent-a27e4ccffd859046e`.

## Archivos tocados

- `app/admin/(authenticated)/(project)/proyecto/aereas/[slideId]/page.tsx` — reescrito.
- `app/api/admin/aerial-hotspots/bulk/route.ts` — nuevo.
- `app/api/admin/aerial-hotspots/bulk/route.test.ts` — nuevo.

No toqué `components/admin/PolygonCanvas.tsx` (otro agente lo está modificando en paralelo, lo usé tal cual está — mismas props/tipos) ni `types/database.ts` (no hizo falta).

## Qué cambié y por qué

### 1. La página deja de estar atada al slide de la URL

Antes, `slideId` venía de `params` (segmento dinámico de ruta) y todo el estado
(`points`, `pinOverrides`, `hotspots`) se indexaba solo por `buildingId`, con un
`useEffect(load, [slideId])` que reconsultaba `/api/admin/project` cada vez que
cambiaba el segmento de la URL. Para pasar de una aérea a otra había que
navegar, lo que remonta el componente y pierde todo el estado en memoria.

Ahora:
- `activeSlideId` y `activeBuildingId` son estado de React, inicializados desde
  `params.slideId` y `?building=` respectivamente, pero **no dependen más de
  la URL después del primer render**.
- `load()` se llama una sola vez al montar (`useEffect(load, [])`), trae
  **todas** las slides y **todos** los hotspots del proyecto (el dato ya
  venía completo en `/api/admin/project`, como decía el plan — antes se
  descartaba con `.find()`/`.filter()`).
- `points` y `pinOverrides` pasan a indexarse por `slideId::buildingId`
  (función `keyOf`), así cada combinación aérea×edificio tiene su propio
  dibujo en memoria (requisito 3).
- La tira de miniaturas (una por cada `aerial_slide` del proyecto, con
  contador "X de Y marcados" y un punto ámbar si tiene cambios sin guardar)
  permite saltar de aérea con un simple `setActiveSlideId(id)` — sin
  `router.push`, sin remount, sin refetch (requisito 1).
- Como `activeBuildingId` es un estado aparte que no se toca al cambiar de
  aérea, el edificio elegido se mantiene al saltar entre fotos (requisito 2).

### 2. Sin refetch después de guardar

`handleSave` (guardado individual, igual que antes) ya no llama a `load()`:
actualiza `hotspots` en memoria con la fila que devuelve el POST/PATCH
(upsert local por `slide_id`+`building_id`). Con varias aéreas abiertas a la
vez, el `load()` viejo hubiera pisado ediciones sin guardar de las otras
(requisito 4).

### 3. "Guardar todo" + endpoint bulk

- Cada combinación slide×edificio con algo dibujado o el pin movido se marca
  `dirty` (indicado con un punto ámbar en la tira y al lado de cada edificio
  en la lista).
- El botón "Guardar todo (N)" aparece solo si hay algo sin guardar, arma un
  array de items (`{slideId, buildingId, x, y, polygon?}`) con **todas** las
  combinaciones dirty de **todas** las aéreas, y lo manda de una sola vez a
  `POST /api/admin/aerial-hotspots/bulk` (requisito 5).
- El endpoint nuevo hace upsert por fila: si ya existe un hotspot para esa
  combinación slide+building, `UPDATE`; si no, `INSERT`. Copié la validación
  de seguridad del endpoint singular (`resolveProjectIdFromSlide` +
  `resolveProjectIdFromBuilding` para cada id único, verificando que TODOS
  resuelvan al mismo proyecto, y recién ahí `requireProjectAccess`). Ningún
  dato del body se usa antes de esa validación. Devuelve `{ results: [...] }`
  con un resultado por ítem (`success`/`data`/`error`) para que la UI pueda
  informar si alguno falló sin tirar abajo el resto del guardado — la
  respuesta HTTP es 200 aunque algún ítem individual haya fallado (fallo de
  autorización/pertenencia sí aborta TODO con 400/401/404, antes de escribir
  nada).
- Tests nuevos en `route.test.ts` (8 casos): sin items → 400; item mal
  formado → 400; slide/building de otro proyecto → 400 (rechazado antes de
  llegar a `requireProjectAccess`); building inexistente → 404; sin acceso →
  401; error al leer hotspots existentes → 500; camino feliz con insert +
  update mezclados; y un item que falla en la escritura mientras el otro se
  guarda igual.

### 4. URL sincronizada sin remontar (la ambigüedad del requisito 6)

Decisión: la URL se actualiza con `window.history.replaceState(...)` dentro
de un `useEffect` que corre cuando cambian `activeSlideId`/`activeBuildingId`,
en vez de usar `router.replace()` de Next. `router.replace` en un segmento
dinámico del App Router vuelve a ejecutar el árbol de esa ruta (params nuevos
→ remount del client component), que es exactamente lo que hay que evitar.
`history.replaceState` cambia lo que se ve en la barra de direcciones y lo
que devuelve `location.href`, pero no dispara el router de Next (no hay
`popstate`), así que React nunca desmonta el componente.

Con esto:
- Los links existentes (`/admin/proyecto/aereas/<id>` desde
  `proyecto/page.tsx`, y `/admin/proyecto/aereas/<id>?building=<id>` desde
  `edificios/page.tsx`) siguen funcionando igual: son la carga **inicial** de
  la página, que sigue leyendo `params.slideId` y `?building=` para el primer
  estado.
- Saltar de aérea con la tira no navega ni refetchea; solo actualiza el
  estado en memoria y, en un efecto aparte, la URL visible.

Riesgo conocido y aceptado: como no pasa por el router de Next, el botón
**Atrás/Adelante del navegador** no queda interceptado por esto — un
`replaceState` no genera una entrada nueva en el historial, así que "Atrás"
te saca de la pantalla entera (al `/admin/proyecto` anterior), no te vuelve a
la aérea previa dentro de esta pantalla. Es una limitación conocida de mezclar
navegación manual de `history` con el App Router; no la resolví con un truco
de `pushState`+`popstate` porque agregaba complejidad y fragilidad (los
`confirm()` de "salir sin guardar" no se pueden enganchar de forma confiable
a `popstate`) para un caso de uso secundario. Lo dejo documentado por si el
usuario lo nota.

### 5. Avisar antes de salir con cambios sin guardar (requisito 7)

Dos mecanismos, porque no hay uno solo que cubra todo:
- `beforeunload`: cubre cerrar la pestaña, recargar, o tipear otra URL.
- `guardedNavigate(href)`: los dos links que sacan de esta pantalla dentro
  del admin ("← Proyecto" y "Editar →" de cada edificio, que antes eran
  `TransitionLink`) pasan a ser botones que, si hay algo sin guardar, piden
  confirmación (`window.confirm`) antes de navegar con
  `useTransitionRouter().push(...)`.
- Limitación aceptada (la misma de arriba): el botón Atrás/Adelante del
  navegador no dispara ni `beforeunload` ni `guardedNavigate` de forma
  confiable en una SPA — es una limitación conocida de la plataforma, no
  intenté un workaround con `pushState`/`popstate` por el mismo motivo que en
  el punto anterior.

### 6. Detalle menor de comportamiento (no pedido explícitamente, pero conviene avisarlo)

Si la URL trae un `slideId` que ya no existe (aérea borrada, link viejo), la
página ahora cae de vuelta a la primera aérea del proyecto en vez de mostrar
"vista aérea no encontrada" (antes sí mostraba ese error). Me pareció más
coherente con "trabajar sobre todas las del proyecto de una" — el usuario no
queda en un callejón sin salida si hay otras aéreas disponibles — pero es un
cambio de comportamiento que no estaba pedido explícitamente; si se prefiere
el error original, es un `if` de una línea para revertir.

## Verificación

```
$ npx tsc --noEmit -p .
(sin salida — sin errores)

$ npx eslint "app/admin/(authenticated)/(project)/proyecto/aereas/[slideId]/page.tsx" \
    app/api/admin/aerial-hotspots/bulk/route.ts app/api/admin/aerial-hotspots/bulk/route.test.ts
(sin salida — sin errores)

$ npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"
 Test Files  1 failed | 107 passed (108)
      Tests  2 failed | 870 passed (872)
```

Los 2 tests que fallan son el ruido preexistente ya avisado en el plan
(`app/api/admin/bim/[id]/route.test.ts`, cola del mock incompleta) — no los
toqué. El resto de la suite, incluidos los 8 tests nuevos del endpoint bulk,
queda verde.

No hay tests de componentes para la página (no se montó infraestructura
nueva, siguiendo la restricción global 2) — la verificación de la UI es
`tsc` + `eslint` + lectura manual del archivo completo.

## Dudas / riesgos para quien revise

1. **Botón Atrás del navegador**: no queda cubierto por el aviso de "cambios
   sin guardar" ni por el sync de URL (ver puntos 4 y 5). Es una limitación
   de plataforma, no un bug, pero quiero que quede explícita.
2. **Fallback silencioso ante un `slideId` inexistente en la URL** (punto 6):
   cambio de comportamiento no pedido explícitamente. Lo dejé porque encaja
   con el espíritu del pedido, pero es fácil de revertir si se prefiere el
   error original.
3. El endpoint bulk devuelve siempre 200 si pasa la validación de seguridad,
   aunque algún ítem individual falle al escribir (ítem por ítem vía
   `results[].success`). Elegí eso en vez de abortar todo en 500 para no
   perder el resto de la tanda por un fallo puntual — coincide con "Devolvé
   un resultado por ítem para que la UI pueda informar" del plan, pero
   marcalo si esperaban otro contrato (por ejemplo, un 207 Multi-Status).
4. No pude probar en el navegador real (sin acceso a Supabase desde este
   entorno) — solo verificación estática + suite de tests. Recomiendo una
   pasada manual en `/admin/proyecto/aereas/<id>` con un proyecto que tenga
   2+ aéreas antes de dar por cerrado el ítem.

## Ronda de corrección 1

Dos hallazgos Important de la revisión, ambos en
`app/admin/(authenticated)/(project)/proyecto/aereas/[slideId]/page.tsx`.
No hizo falta tocar `components/admin/PolygonCanvas.tsx` (cerrado por el otro
agente) ni el modelo de datos.

### Hallazgo 1 — condición de carrera entre "guardar" y "seguir editando"

El bug real: `handleSave`/`handleSaveAll` limpiaban `dirty[key] = false` de
forma incondicional cuando volvía la respuesta del servidor, sin chequear si
`points[key]`/`pinOverrides[key]` habían cambiado *después* de armar el
payload que ya estaba en vuelo. Escenario del revisor (cerrar una forma
dispara `onComplete` → `handleSave`, y justo después arrastrar un vértice de
esa misma forma mientras el POST/PATCH todavía no respondió) hacía que el
ajuste más nuevo quedara marcado como "guardado" sin estarlo, y encima
apagaba `hasUnsavedChanges` — con lo cual ni `beforeunload` ni
`guardedNavigate` alcanzaban a avisar.

Arreglo: un contador de versión por combinación slide+edificio,
`editVersionRef` (un `useRef<Record<string, number>>`, no `useState`, porque
no necesita re-render — es solo para comparar en el momento en que vuelve la
respuesta). `bumpVersion(key)` se llama en los tres lugares que tocan una
forma: `handlePointsChange`, `handleClear` y el `onPinPlace` del canvas.

- `handleSave`: captura `versionAtSave = editVersionRef.current[key]` justo
  antes de mandar el fetch. Al volver la respuesta, solo hace
  `setDirty(..., [key]: false)` si `editVersionRef.current[key]` sigue
  siendo igual a `versionAtSave` — si cambió, quiere decir que hubo una
  edición nueva mientras el request estaba en vuelo, y `dirty` se deja como
  estaba (true).
- `handleSaveAll`: mismo mecanismo pero por cada item de la tanda —
  `versionAtSave` se captura al armar el array de `items` (justo antes del
  fetch), y al procesar `results` cada key se limpia de `dirty` solo si su
  versión no cambió desde entonces.

Con esto, el estado guardado en el servidor puede quedar momentáneamente
"un paso atrás" de lo que hay en memoria (el POST ya salió con el payload
viejo), pero **eso ya era así antes** de este fix — el punto es que ahora
`dirty`/`hasUnsavedChanges` reflejan la verdad: si hay algo sin mandar, se
sigue avisando y "Guardar todo" lo sigue ofreciendo.

### Hallazgo 2 — "Guardar" individual y "Guardar todo" no se excluían

Aplicada la corrección mínima que sugirió el revisor, sin tocar el modelo de
datos: los dos botones ahora respetan el estado del otro.

- Botón "Guardar todo": `disabled={savingAll || savingId !== null}` (antes
  solo miraba `savingAll`).
- Botón "Guardar" de cada edificio: `disabled={savingId === b.id || savingAll
  || (pointCount < 3 && !pinOverrides[key])}` (se agregó `savingAll`).

No se tocaron los guardados individuales de edificios *distintos* entre sí
(pueden seguir corriendo en paralelo): como cada uno usa una key
`slideId::buildingId` distinta, no hay riesgo de fila duplicada entre ellos —
el riesgo descrito por el revisor era específicamente individual-vs-"todo".

### Verificación

```
$ npx tsc --noEmit -p .
(sin salida — sin errores)

$ npx eslint "app/admin/(authenticated)/(project)/proyecto/aereas/[slideId]/page.tsx"
(sin salida — sin errores)

$ npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"
 Test Files  1 failed | 107 passed (108)
      Tests  2 failed | 870 passed (872)
```

Mismos 2 fallos preexistentes de `bim/[id]/route.test.ts` (no tocado en esta
ronda tampoco). No agregué tests de componente para estos dos fixes —
siguen sin existir tests de componentes en el repo (restricción global 2) y
ambos son cambios de lógica de UI pura, cubiertos por `tsc`/`eslint` +
lectura manual del flujo completo (los tests de `bulk/route.test.ts`, que sí
cubren el endpoint, no cambiaron porque el endpoint no se tocó en esta
ronda).

### Dudas que quedan

Ninguna nueva. Siguen en pie las 4 ya declaradas en el reporte original
(especialmente la limitación del botón Atrás del navegador, que no es parte
de estos dos hallazgos y no la toqué).
