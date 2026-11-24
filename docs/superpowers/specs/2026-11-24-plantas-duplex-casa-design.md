# Plano y render por planta — dúplex y casa (admin)

## Por qué
Un dúplex o una casa de 2+ plantas tiene que mostrar el plano y el render de
cada planta. El sitio público ya lo soporta (`units.levels[]` + selector de
planta en los tabs Planos / Planta 3D). El problema está en la carga:

- El flujo guiado de **Dúplex** pide "Plantas: 2" y no ofrece cargar nada por planta.
- La ficha de unidad (sección **Planos**) solo deja subir el render de planta baja.
- El flujo guiado de **Casa** marca ambientes como "Planta alta" pero los guarda
  todos en planta baja (`rooms[].group`, que el público ignora).

## Objetivo
Que cargar plano + render de cada planta sea directo, y que en un dúplex se
cargue **una vez por modelo** y se aplique a todas sus unidades.

**No-objetivos:** 360° o galería por planta; cambios en el sitio público;
plantas espejadas (A/B del mismo modelo con plano invertido).

**Anti-objetivo:** pisar algo cargado a mano en una unidad puntual.

## Approaches (elegido: B)
- A. Solo un link desde la pantalla final del dúplex a la primera unidad y copiar a mano. Barato, pero sigue siendo N cargas.
- **B. Paso nuevo "Plantas" en el flujo del dúplex, por modelo, aplicado a todas sus unidades.** Elegido: 1 carga por modelo y planta, coincide con lo que ya promete la pantalla final ("van al modelo y se ven en todas").

## Diseño

### 1. Flujo guiado Dúplex — paso "Plantas"
- Pasos: Conjunto → Plano del conjunto → **Plantas** → Listo ("Paso N de 4").
- Unidades agrupadas por `model_name`. Si hay más de un modelo, una pestaña por modelo.
- Por cada planta del modelo (`floors_count`, máx. de sus unidades) una fila con dos cargadores:
  - **Plano** → planta baja: `room_plan_image`; planta k: `levels[k-1].planImage`
  - **Render 3D** → planta baja: `floor_plan_3d_url`; planta k: `levels[k-1].plan3dImage`
- "Aplicar a las N unidades": por cada unidad y cada casillero, **solo completa si está vacío**. Si alguna unidad ya tenía otra imagen en ese casillero, se mantiene y se avisa ("D2-B ya tenía otro render en planta alta; se mantuvo").
- El valor inicial de cada casillero es el que comparten las unidades del modelo (si difieren, se muestra el primero y el aviso).
- El paso se puede saltear ("Lo cargo después").
- Al agregar un nivel nuevo en `levels` se conservan id, nombre y ambientes de los existentes.

### 2. API de carga guiada (`/api/admin/guided`)
- GET: suma `room_plan_image`, `floor_plan_3d_url`, `levels` a las columnas de unidad.
- PATCH: acepta `roomPlanImage`, `floorPlan3dUrl` (URL) y `levels` (validado con el schema `level` de `lib/unit-schema.ts`).

### 3. Ficha de unidad → Planos
- Con `floors_count > 1`, "Planta 3D" tiene selector de planta (como ya tiene el editor de casa) y escribe `levels[k].plan3dImage`.

### 4. Flujo guiado Casa — ambientes por planta
- Pestañas: Planta baja, una por cada planta extra declarada, Exterior.
- Al guardar: planta baja + exterior → `rooms`; planta k → `levels[k-1].rooms` (sin tocar plano/render de ese nivel).
- Al cargar: se reconstruye desde `rooms` + `levels`; un `group: 'pa'` viejo cae en la primera planta extra.

### 5. Nombres de planta
- Helper único: con 2 plantas → "Planta alta"; con más → "Piso 1", "Piso 2"…
- Un nivel que ya tiene nombre lo mantiene.

## Queda a criterio del que lo construye
Layout visual del paso (seguir el patrón SplitLayout/StepIntro de los otros pasos),
textos exactos, y tests de la lógica de "completar sin pisar" por casillero.
