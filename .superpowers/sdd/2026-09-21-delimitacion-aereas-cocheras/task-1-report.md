# Tarea 1 — PolygonCanvas: botones fuera de la imagen y puntos más chicos

Archivo tocado: `components/admin/PolygonCanvas.tsx` (único, como pedía el plan).
No se tocó la interfaz pública del componente: mismas props, mismo tipo
exportado `PolygonShape`, mismos nombres. Las tres pantallas que lo consumen
(`aereas/[slideId]/page.tsx`, `FloorUnitsDelimiter.tsx`, `UnitRoomsEditor.tsx`)
no requieren ningún cambio.

## Qué cambié

### 1. Botones fuera del contenedor de la imagen

Reestructuré el `return` en una columna:

```
<div className="w-full">
  <div className="relative ... rounded-xl overflow-hidden border ...">   ← imagen + SVG + overlays (igual que antes: relative, borde, redondeo)
    <img /> <svg>...</svg> {puntos HTML} {pin}
  </div>
  {activeShape && (
    <div className="... mt-2">   ← barra de acciones, debajo, fuera del contenedor de la foto
      <span>{helpText}</span>
      {botones Listo / Deshacer / Vaciar}
    </div>
  )}
</div>
```

El grupo "Listo / Deshacer / Vaciar esta forma" dejó de estar en
`absolute top-2 right-2` encima de la foto y ahora es una barra normal (flujo
de documento) debajo de la imagen. Ya no compite con el click de dibujo en la
esquina superior derecha.

Los dos carteles de ayuda que estaban en `absolute top-2 left-1/2` encima de la
imagen (el del modo pin: "Click para ubicar el pin" / "Click para reubicar …",
y "Click para cerrar la forma") se movieron a esa misma barra inferior, como
`<span>` de texto (`helpText`, computado antes del `return`). Mismo texto en
español, sin cambios de copy.

### 2. Decisión de diseño: por qué la barra no salta

Esta era la ambigüedad señalada en la consigna. Elegí **montar la barra en
cuanto hay una forma activa (`activeShape`), con un alto mínimo reservado
(`min-h-[38px]`)**, y dejar que solo el *contenido interno* (texto de ayuda,
botones) cambie según el estado de dibujo.

Por qué no clavé la condición vieja (`canUndo || points.length > 0 ||
rectStart`) para decidir si la barra existe: el cartel "Click para cerrar la
forma" depende de `nearFirstPoint`, que se recalcula en cada `mousemove` (el
cursor entra y sale del radio de cierre todo el tiempo mientras se dibuja). Si
el montaje/desmontaje de la barra dependiera de eso, la barra aparecería y
desaparecería en cada movimiento del mouse cerca del primer punto — exactamente
el salto de layout que la consigna pide evitar, y más frecuente que el defecto
original. Atando el montaje solo a "hay una forma activa" (una condición que
cambia por acción del usuario al elegir qué forma editar, no por el gesto de
dibujar) la barra es estable durante todo el dibujo; lo único que se mueve
adentro es contenido de una fila con alto mínimo fijo, así que no empuja nada.

Costo aceptado: por un instante muy chico (forma activa recién elegida, cero
puntos, sin historial) la barra se ve montada pero vacía (solo el alto
mínimo, sin texto ni botones) en lugar de no existir. Preferí ese costo —
imperceptible y sin parpadeo — al riesgo de que la barra parpadee en cada
movimiento de mouse durante el dibujo real.

### 3. Puntos más chicos

Antes cada vértice se dibujaba dos veces superpuesto:
- un `<circle>` SVG visible (`r={1.3}`, blanco con borde de color; `r={2.2}` y
  relleno de color cuando `nearFirstPoint`), que además era el blanco de
  `onMouseDown`/`onDoubleClick`;
- encima, un globito HTML numerado de 14×14px.

Como decía el plan, el `<circle>` se deformaba en óvalo porque el SVG usa
`viewBox="0 0 100 100"` con `preserveAspectRatio="none"` (se estira con la
imagen).

Cambios:
- El **globito HTML** pasa a ser el único punto visible: 7px de diámetro,
  redondo, **sin número**, con el mismo anillo blanco (`boxShadow: '0 0 0
  1.5px white'`) que ya tenía.
- El **`<circle>` SVG** pasa a ser invisible (`fill="transparent"`, sin
  `stroke`) y más grande (`r={2.5}`, mismo radio que ya usa el pin en este
  archivo para su propia zona de agarre) — sigue siendo el blanco de
  `onMouseDown`/`onClick`/`onDoubleClick`, solo que ahora es puramente una zona
  de agarre invisible.
- La señal de "estás por cerrar la forma" (antes vivía en el `<circle>` SVG,
  que en la práctica quedaba tapado por el globito HTML de encima — con lo
  cual el efecto original casi no se veía) se reimplementó sobre el globito
  HTML: el primer punto pasa de 7px a 11px cuando `nearFirstPoint` es
  `true`. Sigue coloreado con `shape.color` en ambos estados (ya lo estaba);
  el cambio observable es el agrandado.

## Verificación

Desde la raíz del worktree (`my-app`):

```
$ npx tsc --noEmit -p .
(sin salida — sin errores)

$ npx eslint components/admin/PolygonCanvas.tsx
/…/components/admin/PolygonCanvas.tsx
  73:9  warning  The 'undoStack' conditional could make the dependencies of useCallback Hook (at line 82) change on every render. …  react-hooks/exhaustive-deps
✖ 1 problem (0 errors, 1 warning)
```

Ese warning está en la línea 73 (`const undoStack = activeShape ? history[...] : [];`),
código que no toqué. Confirmé que ya existía antes de mis cambios corriendo
eslint contra `git show HEAD:components/admin/PolygonCanvas.tsx` (la versión
previa a este trabajo): mismo warning, mismo lugar. No es de esta tarea.

```
$ npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"
 Test Files  1 failed | 106 passed (107)
      Tests  2 failed | 862 passed (864)
```

Los 2 tests que fallan son los del ruido preexistente ya documentado en el
plan (`app/api/admin/bim/[id]/route.test.ts`, "se quedó sin resultados en la
cola (llamada #3 a .from('bim_models'))") — no relacionados con
`PolygonCanvas` ni con esta tarea. Resto de la suite: verde.

No agregué tests de componentes (0 `.test.tsx` en el repo, como indicaba la
restricción global) — la verificación de UI pura fue typecheck + lint + suite
existente + lectura completa del archivo.

## Repaso de comportamiento (no delegado a subagentes, hecho a mano)

Leí el archivo completo después de mover cosas de lugar para confirmar que
ningún handler quedó colgando del elemento equivocado:
- `onMouseDown`/`onMouseMove`/`onMouseUp`/`onClick`/`onMouseLeave` siguen
  todos en el `<svg>` (no se movieron).
- Los handlers por-vértice (`handleVertexMouseDown`, `handleVertexDoubleClick`)
  siguen en el `<circle>` SVG de cada punto (ahora invisible pero con el mismo
  `r={2.5}` que la zona de agarre del pin).
- El pin (`handlePinMouseDown`, `handlePinDoubleClick`) no se tocó: su
  `<circle>` invisible en el SVG y su ícono HTML siguen igual.
- El listener de teclado (`Escape`, `Ctrl/Cmd+Z`) sigue en `window`, sin
  cambios.
- El modo rectángulo (`rectStart`/`rectPreview`) no se tocó.
- `handleFinish`, `handleUndo`, `handleReset` no cambiaron de lógica, solo de
  ubicación visual de sus botones.

No pude probar interactivamente en navegador (no se pidió, y hubiera requerido
levantar la app con datos reales); la verificación es por lectura completa del
componente + los tres comandos de arriba, tal como marcaba la restricción
global de "no montar testing de componentes".

## Riesgos / dudas para quien revise

1. **Tamaño del punto (7px) y de la zona de agarre invisible (r=2.5% del
   ancho de imagen)**: son valores de criterio propio dentro de lo que pedía
   el plan ("~7px", "seguí el patrón del pin que usa r=2.5"). No los validé
   con el usuario real sobre una foto aérea concreta; si el punto queda
   "todavía grande" o "difícil de agarrar" en la práctica, es un ajuste de un
   par de números, no estructural.
2. **Texto del "helpText" cuando no hay nada que mostrar**: dejé
   `<span>{helpText}</span>` con `helpText = null` en ese caso (span vacío).
   No inventé copy nuevo para ese estado porque no estaba pedido y quería
   evitar scope creep; si se prefiere un texto por defecto tipo "Marcá los
   puntos sobre la imagen", es un cambio menor.
3. **Estética de la barra inferior** (fondo gris claro, borde, `rounded-lg`):
   es una elección de estilo siguiendo los grises/bordes que ya usa el resto
   del archivo (`border-gray-200`, `bg-gray-50`), no un requisito explícito
   del plan más allá de "que sea una barra de acciones debajo". Puede necesitar
   un ajuste visual fino cuando alguien lo vea andando en las tres pantallas
   que lo consumen.
4. No pude correr las otras dos tareas en paralelo para confirmar en vivo que
   no rompí nada de su lado — me basé en no tocar la interfaz del componente,
   que es la garantía que pedía el plan.

## Ronda de corrección 1 — barra vacía en el estado inicial

**Hallazgo (Important) del revisor**: el punto 2 de "Riesgos / dudas" de
arriba minimizaba mal el problema. La condición de montaje de la barra era
solo `activeShape` (línea `{activeShape && (...)}`), sin retomar la condición
completa que ya existía para el grupo de botones (`canUndo ||
activeShape.points.length > 0 || rectStart`). Resultado: apenas el usuario
elige una forma activa nueva (0 puntos, sin historial, sin `rectStart`, modo
distinto de `pin`), `helpText` era `null`, el grupo de botones no renderizaba
nada, y la barra se montaba igual como una caja gris vacía debajo de la
imagen. No era un instante imperceptible: es el estado inicial más común del
flujo (recién se eligió la forma a dibujar) y dura todo lo que tarde el
usuario en marcar el primer punto.

El revisor dio dos caminos: (a) condicionar el montaje también al contenido
(`helpText || canUndo || points.length > 0 || rectStart`), reintroduciendo el
riesgo de parpadeo que yo mismo había señalado; o (b) darle a `helpText` un
texto por defecto según el modo, para que nunca sea `null` — resuelve la caja
vacía sin volver a atar el montaje al contenido cambiante.

**Elegí la opción (b)**, tal como sugería el revisor: `helpText` ahora siempre
tiene contenido no vacío. Prioridad, de mayor a menor:

1. Modo pin → el texto que ya existía ("Click para ubicar el pin" / "Click
   para reubicar…").
2. `nearFirstPoint` → "Click para cerrar la forma" (sin cambios).
3. Si no, un texto instructivo por defecto según el modo:
   - modo `rectangle` → "Arrastrá de una esquina a la otra para armar el
     rectángulo".
   - modo `point` (default) → "Marcá los puntos sobre la imagen".

La condición de montaje de la barra (`{activeShape && (...)}`) **no cambió** —
sigue atada solo a si hay una forma activa, que es justamente lo que evita el
parpadeo por `nearFirstPoint` cambiando en cada `mousemove`. Lo que cambió es
que ahora el contenido de esa barra nunca está vacío, así que no hay caja
gris sin texto ni botones en ningún momento: siempre hay, como mínimo, una
instrucción de qué hacer.

Efecto colateral positivo no pedido explícitamente pero consistente con la
intención del hallazgo: el texto por defecto también le dice al usuario qué
hacer en el estado inicial (antes no había ninguna pista ahí), no solo tapa el
hueco visual.

### Verificación después del fix

```
$ npx tsc --noEmit -p .
(sin salida — sin errores)

$ npx eslint components/admin/PolygonCanvas.tsx
  73:9  warning  … react-hooks/exhaustive-deps
✖ 1 problem (0 errors, 1 warning)
```

Mismo warning preexistente de antes (línea 73, código no tocado por esta
tarea ni por esta corrección).

```
$ npx vitest run --exclude "**/node_modules/**" --exclude ".claude/**"
 Test Files  1 failed | 106 passed (107)
      Tests  2 failed | 862 passed (864)
```

Mismos 2 tests preexistentes de `app/api/admin/bim/[id]/route.test.ts` que ya
fallaban antes de esta tarea (documentados como ruido en el plan). Resto de la
suite verde, sin cambios respecto a la primera entrega.

### Dudas que quedan después de esta corrección

- El copy exacto de los textos por defecto ("Marcá los puntos sobre la
  imagen", "Arrastrá de una esquina a la otra para armar el rectángulo") es
  criterio propio; no fue pedido literalmente por el plan ni por el usuario.
  Si no gusta el tono o la redacción, es un cambio de un par de strings, sin
  impacto estructural.
