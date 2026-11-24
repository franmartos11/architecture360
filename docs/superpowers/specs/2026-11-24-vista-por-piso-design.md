# Vista por piso — diseño corto

Fecha: 2026-11-24 · Estado: aprobado ("hacelo" sobre la explicación)

## Para qué

Viene del análisis contra Urbania3D ("vistas reales por altura": relevamiento con drone de lo que se ve desde cada piso). En pozo el comprador no puede subir a ver, y en una torre buena parte de la diferencia de precio entre pisos es la vista. Mostrarla ayuda a vender los pisos altos.

## Qué se construye

- **Carga (panel, Edificios → tabla de pisos):** cada piso tiene un botón "Vistas" que abre un panel con 8 lugares, uno por orientación (N, NE, E, SE, S, SO, O, NO), para subir una foto. Hay además un lugar opcional para una panorámica 360° del piso. Cada foto se guarda sola al subirla, como el plano.
- **Sitio (unidad):** nueva pestaña "Vista" en escritorio y celular, visible solo si hay alguna vista aplicable.
  - Elige sola la foto cuya orientación está más cerca de la de la unidad (`orientationDegrees`, o el cardinal guardado en `orientation`). Las demás orientaciones del piso quedan como botones para cambiar.
  - Si el piso de la unidad no tiene vistas, usa el piso más cercano del mismo edificio que sí tenga. Ante un empate de distancia, elige el de abajo, para no vender una vista mejor que la real. En ese caso lo aclara: "Vista aproximada desde el piso X".
  - Si el piso tiene panorámica 360°, un selector "Fotos | 360°" la muestra con el visor 360 existente (`VirtualTour` con `imageUrl`).
  - Leyenda: "Imagen tomada a la altura del piso. La vista real puede variar."

## Datos

`floors.view_photos jsonb not null default '[]'` (`[{ direction, url }]`, con dirección única entre los 8 cardinales) y `floors.view_panorama text` (null si no hay). El loader del sitio ya trae `floors(*)`, así que sin el SQL corrido las columnas faltan y se tratan como vacías.

SQL (a mano en producción, antes de deployar):
`alter table floors add column if not exists view_photos jsonb not null default '[]'::jsonb;`
`alter table floors add column if not exists view_panorama text;`

## Enfoques

- **Columnas en `floors` (elegido):** la vista es un atributo del piso, siempre se lee con él y la ruta `PATCH /api/admin/floors/[id]` ya valida y guarda con permisos.
- **Tabla `floor_views` aparte:** suma tabla, RLS y rutas para a lo sumo 9 imágenes por piso. Descartado.
- **Vista por unidad:** obligaría a cargar la misma foto en todas las unidades de un piso. Descartado: la vista depende de la altura y la orientación, no de la unidad.

## No-objetivos

- Orientar la panorámica 360° automáticamente hacia la orientación de la unidad (haría falta calibrar el norte de cada panorámica). Arranca donde arranca la imagen.
- Vistas en casas y loteos (no tienen pisos): el editor vive solo en la tabla de pisos.
- Incluir la vista en la ficha PDF o en el bot de WhatsApp.
- Interpolar entre pisos o generar vistas.

## Llamadas mías (corregibles)

- Ocho orientaciones fijas, las mismas de la brújula de la unidad.
- Sin orientación cargada en la unidad, la pestaña arranca por la primera foto en orden N → NO.
- Las fotos se comprimen al subir (`compress`), salvo la panorámica, que necesita la resolución completa.
- La pestaña va después de "Galería" en escritorio y después de "360°" en celular.
- Una vista aproximada se toma de cualquier piso del mismo edificio, sin límite de distancia. Lo aclara siempre.
