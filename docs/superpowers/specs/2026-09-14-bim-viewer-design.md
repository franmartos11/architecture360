# Modelos BIM en el portfolio — diseño

**Fecha:** 2026-09-14
**Alcance:** subsistema nuevo (tabla, bucket, ingesta, visor 3D, admin a nivel cuenta, sección de landing, pestaña de portfolio)
**Archivos que toca:** `supabase/schema.sql`, `lib/project-sections.ts`, `components/admin/DeleteProjectModal.tsx`, `app/api/admin/projects/[id]/route.ts`, `app/(social)/portfolio/[handle]/`, más rutas y componentes nuevos

## Objetivo

Que un arquitecto pueda publicar su modelo BIM como pieza de portfolio:
un visor 3D navegable con la información del modelo adentro (árbol de
elementos, propiedades, cortes), acompañado de una galería de imágenes,
compartible por link, y opcionalmente asociado a uno de sus proyectos.

**No es** una herramienta de venta ni de colaboración de obra. No hay 4D,
ni avance, ni versionado, ni BCF, ni issues. El destinatario es el
arquitecto que quiere mostrar su trabajo, no la constructora que lo
ejecuta ni el comprador que elige un departamento.

## Por qué encaja acá

La jerarquía de datos de la plataforma ya es casi isomorfa a la de IFC
(`IfcSite`→`projects`, `IfcBuilding`→`buildings`,
`IfcBuildingStorey`→`floors`, `IfcSpace`→`units`/`units.rooms`), y
`three.js` + `@react-three/fiber` + `@react-three/drei` ya están en
`package.json` prácticamente sin usar. El costo de entrada es bajo.

Lo que **no** se hace en esta fase, aunque el isomorfismo lo tiente:
derivar pisos y unidades automáticamente desde el IFC. Es otro producto
(acelerador de carga de datos) con otro riesgo (IFCs del mundo real
vienen sucios). El modelo de datos de acá no lo bloquea.

## Formato de entrada

**IFC como formato principal, GLB como secundario.**

Si solo se aceptara GLB, lo que se construye es un visor 3D, no un BIM:
un mesh que gira y no dice nada. Lo que hace que la pieza se lea como BIM
—y lo que el arquitecto quiere lucir— es la información adentro del
modelo, y eso solo viene del IFC. IFC además es el estándar abierto de
buildingSMART que exportan Revit, Archicad, Allplan, Vectorworks y Tekla:
es el archivo que los arquitectos ya intercambian.

GLB se acepta igual, en el mismo visor, sin panel de propiedades, para
quien viene de SketchUp/Rhino/Blender. Cuesta poco porque three.js lo lee
nativo, y salva la adopción.

Se descartó Autodesk APS (Forge) Viewer: costo por traducción, los
modelos de los clientes saldrían de la infraestructura propia hacia
Autodesk, y ata el pricing a un tercero. Para una feature de portfolio no
se justifica.

## Decisiones tomadas

### 1. La conversión ocurre en el navegador del que sube

`app/api/admin/upload/route.ts` recibe el archivo como `formData` dentro
de una función serverless. En Vercel el body de una serverless function
está limitado a ~4.5 MB; un IFC pesa de decenas a cientos de MB. **No
puede pasar por ahí.**

La subida del modelo va **directo del navegador a Supabase Storage con
una signed upload URL**; la API solo firma el permiso. Y el IFC se
convierte **en la máquina del que lo sube**, con `web-ifc` (WASM)
corriendo en un Web Worker:

```
Navegador del arquitecto                         Backend / Supabase
─────────────────────────                        ──────────────────
1. elige el .ifc
2. web-ifc lo parsea en un Web Worker
3. extrae geometría optimizada + propiedades + árbol
4. captura el canvas como portada
5. pide signed URLs            ─────────────────► POST /api/bim/sign
6. sube geometría + propiedades + portada ──────► Storage (bucket bim-models)
7. confirma                    ─────────────────► POST /api/bim  (status: ready)
```

Motivos:

- **No agrega infraestructura.** No hay cola, worker, Edge Function ni
  costo de cómputo. El stack sigue siendo Next + Supabase.
- **No hay timeout.** Parsear un IFC grande puede tardar minutos; una
  serverless function se corta, la pestaña del usuario no.
- **El archivo pesado nunca cruza el backend.** Solo sube el resultado ya
  reducido.
- El que sube es un arquitecto en una computadora con el proyecto
  abierto. El que mira no paga nada de ese costo.

Costos aceptados: hay que hacer una UI de progreso real, y el Web Worker
es obligatorio (sin él la pestaña se congela). En un dispositivo móvil se
bloquea con un mensaje explícito en vez de intentarlo y fallar.

Si más adelante se quiere conversión server-side, el modelo de datos no
cambia: se reemplazan los pasos 2-4.

**Nunca se carga el IFC crudo en el navegador del visitante.** El
visitante baja únicamente el resultado convertido.

### 2. El modelo pertenece al autor, el proyecto es un vínculo opcional

```sql
create table if not exists bim_models (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,
  title          text not null,
  description    text,
  source_format  text check (source_format is null or source_format in ('ifc','glb')),
  source_url     text,          -- original, para descarga/reproceso (opcional)
  geometry_url   text,          -- nullable: ver decisión 6
  properties_url text,          -- árbol + propiedades (solo IFC)
  gallery_images text[] not null default '{}',
  cover_image    text,
  stats          jsonb,         -- {elements, storeys, triangles, bytes}
  status         text not null default 'processing'
                 check (status in ('processing','ready','failed')),
  error_message  text,
  is_public      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_bim_models_author on bim_models(author_id, created_at desc);
create index if not exists idx_bim_models_project on bim_models(project_id);
```

- **`author_id` obligatorio, `project_id` opcional.** Un mismo modelo
  aparece en el perfil del arquitecto y, si lo asocia, también en la
  landing del proyecto. `on delete set null` hace que el modelo sobreviva
  al borrado del proyecto en lugar de desaparecer del portfolio.
- **Bucket nuevo `bim-models`, público en lectura.** No va en
  `project-media` porque `lib/supabase/delete-project-storage.ts` barre
  ese bucket entero al borrar un proyecto, y acá el modelo debe
  sobrevivir a eso salvo que el autor decida lo contrario (decisión 3).

RLS: lectura pública cuando `is_public = true and status = 'ready'`;
escritura solo cuando `author_id = auth.uid()`.

**Nueva sección `'bim'`** en `SECTION_REGISTRY` de `lib/project-sections.ts`,
disponible para todos los tipos de proyecto (sin entrada en
`AVAILABILITY`), ubicada después de `masterplan`. La landing la renderiza
solo si existe un `bim_models` asociado con `status = 'ready'`. Así entra
gratis al sistema de reordenar y prender/apagar que ya existe.

### 3. Al borrar un proyecto, el autor elige qué pasa con sus modelos

`components/admin/DeleteProjectModal.tsx` ya exige escribir el nombre
exacto. Cuando el proyecto tiene modelos BIM asociados, se agrega un
bloque antes del campo de confirmación:

> **Este proyecto tiene N modelos BIM asociados.**
> ◉ Conservarlos en mi portfolio *(recomendado)*
> ○ Eliminarlos también

**Default: conservar** — es la opción no destructiva, y el modelo vive en
el portfolio del autor con independencia del proyecto.

`DELETE /api/admin/projects/[id]` acepta `deleteBim` (query param
booleano). Cuando es `true`, borra las filas **y** los objetos del bucket
`bim-models`: el cascade de la base nunca borra archivos de Storage, que
es exactamente el motivo por el que existe `deleteProjectStorageFiles`.

**"Eliminar también" solo alcanza a los modelos cuyo `author_id` es quien
está borrando.** Si un colaborador asoció un modelo propio, ese se
desvincula (`project_id = null`) pero no se borra: el dueño del proyecto
no puede borrarle una pieza de portfolio a otro arquitecto. Cuando ese
caso existe, el modal lo dice ("1 modelo de otro colaborador se
desvinculará").

### 4. Qué hace el visor

Criterio de inclusión: cada función tiene que hacer evidente que esto es
un BIM y no un modelito 3D.

Entra:

- Órbita, pan y zoom; encuadre automático al abrir; botón de resetear vista.
- **Árbol de elementos** en panel lateral, agrupado por pisos
  (`IfcBuildingStorey`) y por categoría (muros, losas, aberturas,
  estructura, MEP).
- **Click en un elemento → panel de propiedades**: nombre, tipo, material
  y los PropertySets del IFC. Es el corazón de la feature.
- **Aislar / ocultar** un piso o una categoría desde el árbol.
- **Plano de sección arrastrable.** Cortar el edificio en vivo es el
  gesto que más lee como BIM y el que mejor luce en un portfolio.
- Vistas preseteadas: planta, frente, isométrica.
- Pantalla completa **que sale con Escape**. Explícito porque el visor
  360 existente arrastra esa queja; el visor nuevo nace sin ese bug.
- En móvil: controles táctiles, y el panel de propiedades como hoja
  inferior en lugar de barra lateral.
- Mientras el modelo baja se muestra la portada con barra de progreso,
  así la sección no cambia de alto.

Queda afuera a propósito:

- Medición de distancias — útil, pero no es lo que hace la demo.
- Anotaciones o comentarios sobre el modelo — es el producto de
  colaboración de obra que se descartó.
- Modo caminata en primera persona — el recorrido 360 existente hace eso
  mejor; duplicarlo es competir contra una feature propia.
- Comparación de versiones del modelo.

Para GLB el visor es el mismo, sin árbol ni panel de propiedades.

### 5. Admin a nivel cuenta, y cuatro lugares donde se ve

El admin va **a nivel cuenta**, fuera del shell de proyecto, porque el
modelo es del autor:

- **`/admin/bim`** — lista de modelos del arquitecto: subir, editar
  título y descripción, marcar público/privado, gestionar la galería de
  imágenes, y un desplegable para asociarlo a alguno de sus proyectos o a
  ninguno.
- **Portada automática**: se captura del canvas al terminar la
  conversión. No se le pide al usuario que suba una imagen de portada.
  Si la pieza no tiene modelo, la portada es la primera imagen de la
  galería.

Se ve en:

1. **Landing del proyecto** — sección `bim`, ordenable, solo si hay
   modelo asociado en `ready`.
2. **Portfolio `/portfolio/[handle]`** — pestaña nueva en `ProfileTabs`
   con la grilla de piezas.
3. **Página propia `/bim/[id]`** con metadata Open Graph usando
   `cover_image`. Es central para el caso de uso: el arquitecto quiere
   mandar un link por WhatsApp y que se vea la miniatura.
4. **Admin** — la lista de `/admin/bim`.

### 6. Modelo e imágenes, ambos opcionales, nunca los dos vacíos

Cada pieza acepta **las dos cosas a la vez**: el modelo navegable y una
galería de imágenes (renders, capturas, cortes, axonométricas, láminas).

Las imágenes suben por `/api/admin/upload`, la ruta que ya existe: son
archivos chicos, ese camino funciona, y no hay motivo para inventar otro.
El camino de signed URL es exclusivo del modelo pesado. En el admin se
ordenan arrastrando con `@dnd-kit`, ya instalado y ya usado en otras
pantallas.

En la página pública el visor 3D va arriba y la galería debajo. Si no hay
modelo, la galería ocupa el lugar principal.

**`geometry_url` es nullable** en consecuencia: un arquitecto puede
publicar una pieza solo con imágenes, sin IFC. Esto resuelve el problema
de adopción —quien todavía no exportó su IFC entra igual con sus
renders, y suma el modelo después sin rehacer nada.

**Regla de validación:** una pieza no puede publicarse vacía. Para pasar
a `status = 'ready'` tiene que tener `geometry_url`, al menos una entrada
en `gallery_images`, o ambos. `source_format` es nullable por el mismo
motivo: una pieza solo-imágenes no tiene formato de origen.

### 7. Errores y límites

- Estados `processing` / `ready` / `failed`. `error_message` se muestra
  únicamente al autor, nunca en la vista pública.
- IFC corrupto o sin geometría: `failed` con mensaje explicando qué pasó.
- **Límites concretos**, para que el mensaje de error nunca sea un
  "error" genérico:
  - Geometría convertida: máximo **50 MB**. Por encima se rechaza con
    "el modelo convertido pesa N MB y el máximo es 50 MB". A partir de
    25 MB se sube igual pero se avisa que va a tardar en abrir.
  - IFC de origen: no hay límite duro (nunca llega al backend), pero por
    encima de **300 MB** se advierte antes de empezar que la conversión
    puede tardar varios minutos.
  - Galería: los límites que ya aplica `/api/admin/upload` (15 MB por
    imagen), más un tope de **30 imágenes** por pieza.
- Navegador sin WebGL2: cae a la portada estática más la galería.
- Conversión iniciada desde un móvil: se bloquea antes de empezar con
  "subí el modelo desde una computadora".

### 8. Testing

Con `vitest`, que ya está configurado:

- Mapeo IFC → estructura (pisos, categorías, propiedades) contra un
  fixture IFC chico versionado en el repo.
- `POST /api/bim/sign`: solo el autor autenticado obtiene la firma.
- `DELETE /api/admin/projects/[id]` con y sin `deleteBim`, incluyendo el
  caso del modelo de otro colaborador (se desvincula, no se borra).
- Validación de publicación: pieza vacía no pasa a `ready`.
- Consultas de repositorio y RLS (público ve solo `is_public` + `ready`).

El visor 3D no se testea en jsdom: no hay WebGL. Esa parte se verifica a
mano en el navegador.

## Orden de implementación sugerido

El subsistema es grande; conviene que el plan lo corte en fases que dejen
algo usable al final de cada una:

1. **Datos y galería.** Tabla, bucket, RLS, `/admin/bim` con título,
   descripción, imágenes y asociación a proyecto. Sin modelo 3D todavía.
   Ya se puede publicar una pieza solo-imágenes en el portfolio y en
   `/bim/[id]`.
2. **Ingesta del modelo.** Signed URLs, Web Worker con `web-ifc`,
   conversión, portada automática, estados y límites.
3. **Visor.** Geometría, árbol, propiedades, aislar, sección, vistas,
   fullscreen, móvil.
4. **Integración.** Sección `bim` en la landing, pestaña de portfolio y
   el cambio en `DeleteProjectModal` + `DELETE` de proyectos.

## Fuera de alcance

- Derivar `floors` / `units` automáticamente desde el IFC.
- Cualquier función de colaboración de obra: 4D, avance, versionado,
  BCF, issues.
- Aceptar `.rvt` nativo (requeriría Autodesk APS).
- Medición y anotaciones dentro del visor.
- Arreglar el límite de 100 MB para video en `/api/admin/upload`, que
  probablemente ya esté fallando en Vercel por el mismo motivo descrito
  en la decisión 1. Es un bug preexistente e independiente; vale la pena
  verificarlo aparte.
