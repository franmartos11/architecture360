# Ficha PDF por unidad con QR — diseño

Fecha: 2026-11-24 · Estado: borrador para aprobación

## Para qué

Sale del análisis competitivo contra Urbania3D: ellos tienen "descargar ficha" por unidad. En la venta en pozo la ficha en papel o PDF sigue siendo el material con el que se mueven compradores e inmobiliarias: se imprime para la sala de ventas, se manda por WhatsApp o mail y se compara con otras opciones. Hoy en Atrium solo existe el *brief* del proyecto (un PDF que la desarrolladora sube a mano), no hay nada por unidad.

El QR es lo que conecta el papel con el sitio: lleva a la ficha online de esa unidad (3D, recorrido 360°, precio actualizado). Si el comprador llegó por el link de una inmobiliaria, el QR conserva ese `?ref=`, y las visitas que entren por la ficha impresa siguen contando para esa inmobiliaria (ver `docs/superpowers/specs/2026-11-24-analitica-y-links-de-broker-design.md`).

## Decisiones del usuario

- **Precio con fecha (opción A):** si la unidad muestra precio en el sitio, la ficha dice "Precio al 24/11/2026: US$ 145.000", más los montos de los planes de pago. El QR lleva al precio actual. Descartado sin precio (B): la ficha sirve menos para comparar.
- **Se arma en el servidor (opción 1)**, en el momento de pedirla, como el CV del portfolio. Se suma la dependencia `sharp` para convertir imágenes. Descartados: armarla en el navegador (pesada en celulares, sin link para compartir) y una página imprimible (incómoda en celular, cambia según el navegador).

## Objetivos

- Botón "Descargar ficha" en la página de cada unidad, en escritorio y celular.
- PDF A4 vertical, pensado para entrar en una página: render, plano, datos, precio con fecha, planes de pago, QR y contacto.
- Link propio y estable: `/api/ficha/<slug>/<uuid de la unidad>` (más `?ref=` opcional). Se puede pegar en un mensaje y abre la ficha.
- El QR conserva el `ref` de la inmobiliaria.
- La descarga queda registrada en la analítica del proyecto ("Fichas descargadas" en Métricas).

## No-objetivos

- Ficha de proyecto completo o de varias unidades (comparativa).
- Que la desarrolladora edite el diseño de la ficha (plantillas, logo propio, textos legales propios).
- Guardar los PDF generados (siempre se arman con los datos de ese momento).
- Que el bot de WhatsApp mande la ficha (posible más adelante, gracias al link).
- Fuentes propias del tema del proyecto (se usa Helvetica, como el CV).

## Anti-objetivos

- Una ficha que muestre algo que el sitio oculta: precio en proyectos o unidades sin precio visible, estado si el sitio no lo muestra, borradores a quien no es del proyecto.
- Que una imagen rota, lenta o en formato no soportado impida bajar la ficha: la imagen se omite y la ficha sale igual.
- Montos de planes que no cierran con los del sitio (se usa el mismo `computePlan`).

## Enfoques considerados

1. **PDF en el servidor con `@react-pdf/renderer` + `sharp` (elegido).** Mismo resultado en cualquier dispositivo, link propio, ya hay precedente (`app/api/admin/profile/cv/route.tsx`). Costo: dependencia nativa nueva (Vercel la soporta; Next la aprovecha también para `next/image`) y 1–3 s de CPU por ficha.
2. **PDF en el navegador** (react-pdf cargado al tocar el botón, imágenes convertidas con canvas). Sin servidor ni dependencia, pero ~1 MB de código en el celular, lento en teléfonos viejos, depende del CORS del almacenamiento y no hay link para compartir.
3. **Página imprimible + "Guardar como PDF".** Sin librerías, pero en el celular es incómodo y el resultado varía por navegador.

## Diseño

### Ruta

`GET /api/ficha/[slug]/[unitId]` → `app/api/ficha/[slug]/[unitId]/route.tsx` (runtime Node).

- `unitId` es el **uuid** de la unidad (`Unit.dbId`), no el código: el código solo es único por piso (`unique (floor_id, code)`), así que dos unidades de distintos pisos o edificios pueden llamarse igual. El uuid además no cambia si se renombra la unidad, y el link compartido sigue andando. Algo que no es uuid → 404 (`isUuid` de `lib/analytics/project-unit`).
- Carga el proyecto con `getSiteProjectBySlug(slug)`: publicado para cualquiera, borrador solo para miembros logueados (mismo criterio que el sitio). Proyecto inexistente o unidad que no es de ese proyecto → 404.
- `/api/**` queda fuera del rewrite de dominios propios, así que la ruta responde también en el dominio del proyecto.
- Query `ref` opcional: se pasa por `normalizeRef` (`lib/analytics/ref.ts`); si queda vacío se ignora.
- Respuesta `application/pdf`, `Content-Disposition: inline; filename="ficha-<slug-proyecto>-<slug-unidad>.pdf"` (inline para que el link abra en el visor del navegador; el botón usa el atributo `download`).
- `Cache-Control: private, no-store` (puede ser un borrador y el precio cambia).
- Si falla el armado del PDF: 500 con log (`console.error('[ficha] …')`).

### Qué muestra (y cuándo)

Todo lo que el sitio decide mostrar se decide con la misma configuración: `getProjectTypeConfig(project.projectType, project.saleMode)`.

- **Encabezado:** nombre del proyecto y ubicación (`project.location`); a la derecha, nombre de la unidad y, si `showStatus`, el estado (Disponible / Reservada / Vendida, con las mismas etiquetas del sitio).
- **Subtítulo:** modelo/tipología para viviendas; categoría (local, cochera, etc.) para el resto; nada para lotes (igual que el visor).
- **Imagen principal:** la primera que exista de `interiorImageUrl`, `galleryImages[0]`, `floorPlan3dUrl`.
- **Plano:** la primera que exista de `technicalPlanUrl`, `plan3dUrl`, `roomPlanImage`. Sin plano, la columna de datos ocupa todo el ancho.
- **Datos:** edificio y piso (si el tipo de proyecto tiene esos pasos), superficies (total, cubierta, balcón, exterior; solo las > 0), terreno en casas, dormitorios, baños, ambientes, orientación, cocheras, expensas. Mismo criterio y etiquetas que la ficha de la unidad en el sitio; reutilizar los helpers existentes de `lib/units` cuando los haya.
- **Precio:** solo si `showPrice` y la unidad tiene precio: "Precio al DD/MM/AAAA" (fecha de hoy en America/Argentina/Buenos_Aires) y el monto con `formatPrice(price, currency)`. Si no, y `showLeads`, el texto "Consultá el precio actual" junto al QR.
- **Planes de pago:** solo si se muestra el precio y `showUnitCalculator(...)` da verdadero con la cantidad de planes del proyecto. Una fila por plan: nombre, precio del plan si tiene descuento/recargo, anticipo, "N cuotas de $X", "R refuerzos de $Y" (con frecuencia), saldo a la posesión, y la leyenda del índice ("cuotas ajustables por CAC"). Montos con `computePlan` y redondeados como en el sitio. Nota del plan si tiene. Leyenda: "Montos calculados al DD/MM/AAAA. Las cuotas se ajustan según el índice indicado." Los planes se leen en el servidor de `calculator_settings.financing_plans` con `parseStoredPlans` (extraer la lectura que hoy hace `GET /api/settings` a un helper de `lib/` y usarlo en los dos lugares).
- **QR + link:** QR (PNG generado con `qrcode`) a la URL pública de la unidad, con el texto "Escaneá para ver la unidad en 3D, el recorrido 360° y el precio actualizado" y la URL escrita debajo (clickeable en el PDF).
  - URL = `projectCanonical(slug, '/edificio/<buildingId>/unidad/<código codificado>')` (`lib/project-canonical.ts`: dominio propio activo, subdominio o `/proyecto/slug`) + `?ref=<ref>` si hay ref.
  - Proyecto en borrador (solo lo ven miembros): el QR apunta igual a la dirección pública (anda una vez publicado) y la ficha lleva una franja "Vista previa · proyecto sin publicar".
- **Contacto:** WhatsApp del proyecto solo si el sitio lo ofrece (`project.whatsappNumber`, mismo criterio que `ProjectWhatsappProvider`), escrito como número legible y como link `wa.me`.
- **Pie:** "Precios, disponibilidad y planes sujetos a cambios sin previo aviso. Imágenes ilustrativas." + "Ficha generada el DD/MM/AAAA".

Diagramación aproximada (A4 vertical):

```
┌───────────────────────────────────────────────┐
│ PROYECTO X                    Unidad N01-07   │
│ Ubicación                     ● Disponible    │
│ DUET 106 JARDÍN                               │
│ ┌───────────────────────────────────────────┐ │
│ │            imagen principal               │ │
│ └───────────────────────────────────────────┘ │
│ ┌──── datos ─────────┐ ┌──── plano ────────┐  │
│ │ Piso 1 · Torre A   │ │                   │  │
│ │ 106 m² totales …   │ │                   │  │
│ └────────────────────┘ └───────────────────┘  │
│ Precio al 24/11/2026   US$ 145.000            │
│ Planes: Plan 36 cuotas — anticipo … cuotas …  │
│ ┌────┐ Escaneá para ver la unidad en 3D …     │
│ │ QR │ https://…/unidad/N01-07?ref=inmo-sur   │
│ └────┘ WhatsApp +54 9 11 …                    │
│ Precios sujetos a cambios · Generada 24/11/26 │
└───────────────────────────────────────────────┘
```

Si hay muchos planes y no entra en una hoja, el contenido sigue en una segunda página (react-pdf corta solo); el encabezado no se repite.

Color de acento: el color principal del tema del proyecto (`resolveTheme`), con texto oscuro sobre fondo blanco. Si el color es muy claro para leerse sobre blanco, se usa el gris oscuro por defecto.

### Imágenes

react-pdf solo acepta JPG y PNG; las imágenes del proyecto pueden ser WebP o SVG. Para cada imagen:

1. Solo URLs `https` de hosts permitidos (los mismos de `images.remotePatterns` en `next.config`: `*.supabase.co`, `images.unsplash.com`). Otro host → se omite (evita que la ruta pida direcciones internas).
2. Descarga con tiempo máximo de 8 s y tamaño máximo de 15 MB.
3. `sharp`: rotación según EXIF, redimensionar a 1600 px de lado mayor como máximo (sin agrandar), fondo blanco para transparencias, salida JPEG calidad 80. Sirve igual para WebP, PNG, JPG, AVIF y SVG.
4. Cualquier error en un paso → la imagen se omite y se loguea; la ficha sale igual.

Las imágenes se descargan en paralelo.

### Botón en la unidad

- Escritorio (`UnitViewer`): botón "Descargar ficha" con ícono de descarga en la tarjeta de la unidad, cerca de "Consultar precio" / calculadora.
- Celular (`UnitMobileView`): mismo botón en la sección de la unidad, cerca del precio/CTA principal, sin competir con "Consultar".
- Es un `<a href=... download>`. El `href` suma `?ref=` con el ref vigente del visitante (`currentRef()` de `lib/analytics/client-state`), resuelto en el cliente (no en el render del servidor).
- Se muestra siempre, también en proyectos "solo para mostrar" (en ese caso la ficha sale sin precio ni planes).

### Analítica

- Nuevo tipo de evento `ficha` (`TRACK_TYPES` en `lib/analytics/track-schema.ts`), registrado con `useTrack()` al tocar el botón, con la unidad (`unitId` uuid, como `unit`).
- SQL (se corre a mano en producción antes de deployar, como sentencias sueltas):
  - reemplazar el check de `site_events.type` para sumar `'ficha'`;
  - sumar `'ficha_downloads'` (cantidad de eventos `ficha` en el período) a `site_metrics_summary`.
- Métricas: un número "Fichas descargadas desde el sitio" junto a los existentes. Cuenta toques del botón (con visitante y sesión, como el resto de los eventos); abrir el link `/api/ficha/...` directo no suma, a propósito: no hay visitante que atribuir.
- Las visitas que entran por el QR ya cuentan con el `ref` por el mecanismo existente; no hace falta marcar "vino por QR".

## Llamadas mías (corregibles)

- Una sola hoja A4 vertical como objetivo; si no entra, sigue en una segunda.
- El PDF abre en el visor del navegador cuando se usa el link (inline) y se descarga desde el botón.
- Sin caché: siempre se arma con los datos de ese momento.
- Helvetica, sin logo (no hay campo de logo); el nombre del proyecto hace de marca y el color de acento sale del tema.
- Imágenes de hosts no permitidos se omiten.
- Fecha en hora de Argentina.
- El botón aparece siempre, aunque la unidad esté vendida (la ficha sirve igual como referencia; el estado lo dice).

## Lo que queda al constructor

- Dimensiones, tipografía y espaciado exactos de la diagramación.
- Ícono del botón y ubicación precisa dentro de cada tarjeta.
- Qué helper de `lib/units` reutilizar para la lista de datos, o extraer uno compartido si hoy la lista vive dentro de un componente.

## Fuera de alcance (detectado al revisar)

- La página pública de la unidad busca la unidad solo por código e ignora el edificio de la URL; con códigos repetidos entre edificios puede mostrar otra unidad. Es previo a esta ficha y queda anotado aparte.
