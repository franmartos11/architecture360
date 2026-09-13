# Landings de proyecto — coherencia del recorrido (Fase A)

**Fecha:** 2026-09-13
**Superficie:** el sitio público de un proyecto — `app/proyecto/[slug]/**` y las vistas que montan sus sub-rutas.

## Objetivo

Hacer que el recorrido del comprador —landing → unidades → unidad → contacto—
se sienta como un solo sitio: con el theme del proyecto presente en todas las
pantallas, una navegación global única, y sin los callejones sin salida que hoy
cortan el recorrido justo antes de la conversión.

Esta fase **no** cambia el aspecto visual de las vistas del explorador (eso es
una fase aparte, ver "Fuera de alcance"). Cambia dónde vive el theme, dónde vive
la navegación, y arregla dos bugs de navegación concretos.

## Por qué

Un análisis de las landings encontró que el recorrido está partido en tres
sistemas visuales y que la navegación se pierde al entrar al explorador. La
causa raíz es estructural y es una sola:

**Las sub-rutas son hermanas de `page.tsx`, no hijas.** El theme y el `Navbar`
los monta `app/proyecto/[slug]/page.tsx` (líneas 56-69): el envoltorio
`<div style={theme.cssVars}>`, el `fontFaceCss`, las clases de fuente y el
`<Navbar>` viven ahí. `app/proyecto/[slug]/layout.tsx` (21 líneas) sólo resuelve
`basePath`. Como `/unidades`, `/amenities`, `/ubicacion`, `/masterplan`,
`/recorrido` y `/edificio/[buildingId]` son páginas hermanas bajo ese mismo
layout, **no heredan nada de eso**.

Consecuencias medidas:

1. **El theming white-label desaparece en el explorador.** Las variables
   `--theme-*` no están en scope en ninguna sub-ruta. Ninguna de las cinco
   vistas del explorador usa una sola variable del theme:

   | Vista | Líneas | `trevo-*` | `gray-*` | `brand-*` | `var(--theme-*)` |
   |---|---|---|---|---|---|
   | `components/units/UnitsListView.tsx` | 910 | 110 | 0 | 0 | **0** |
   | `components/unit/UnitViewer.tsx` | 1110 | 0 | 99 | 13 | **0** |
   | `components/floorplan/FloorPlanViewer.tsx` | 946 | 0 | 75 | 0 | **0** |
   | `components/amenities/AmenitiesView.tsx` | 432 | 15 | 0 | 2 | **0** |
   | `components/location/LocationView.tsx` | 383 | 10 | 0 | 0 | **0** |

   Los `trevo-*` son la paleta de marca de otro producto de la plataforma
   apareciendo dentro de una página que la desarrolladora paga por
   personalizar.

2. **Ninguna sub-ruta monta el `Navbar` global.** Cada vista arma su propia
   navegación ad hoc, con links distintos entre sí: `UnitsListView` ofrece
   Masterplan/Amenities/Contactar (`:244-269`), `AmenitiesView` ofrece
   Unidades/Ubicación (`:112-120`), `LocationView` otra combinación (`:149`).

3. **La marca de la plataforma se filtra en la landing.** El `Navbar` muestra
   un logo "360" y el texto "InteractiveRE" hardcodeados
   (`components/ui/Navbar.tsx:39-46`), mientras el footer de la misma página
   muestra `project.name.toUpperCase()` (`page.tsx:132`).

4. **"Ver similares" no lleva a nada similar.** En `UnitsListView.tsx:814` y
   `:888` el `href` es idéntico para una unidad vendida y una disponible
   (`${basePath}/edificio/${unit.buildingId}/unidad/${unit.id}`); sólo cambia
   la etiqueta. Una unidad vendida ofrece "Ver similares" y lleva a sí misma.

5. **No se puede volver de la ficha de unidad al listado filtrado, y en
   escritorio no se puede volver a ningún lado.** `UnitViewer` tiene un único
   control de retroceso, en `:632-637`, y su contenedor es `md:hidden` — o sea
   que **sólo existe en mobile**, y va al plano de piso, nunca al listado. En
   escritorio la barra superior (`:676`) ofrece "Planta N" y "Cambiar planta"
   (`:712-717`), que es una acción de cambio de piso, no un retroceso. Un
   comprador de escritorio que filtró por presupuesto y abrió un detalle
   depende enteramente del botón "atrás" del navegador.

## Decisiones tomadas

- **Alcance: estructural, no cosmético.** Esta fase mueve el theme y la
  navegación a donde corresponde y arregla los bugs; **no** reemplaza las 324
  clases de color hardcodeadas. Razón: son 324 cambios puramente visuales en
  3.781 líneas, imposibles de verificar sin navegador (hoy bloqueado por un
  conflicto de perfil de Chrome con otra sesión), y ni `tsc` ni los tests
  detectan una regresión de color. Esta fase es además prerrequisito técnico:
  hasta que las variables no estén en scope, no se puede reemplazar nada por
  ellas.
- **El `Navbar` muestra el nombre del proyecto**, no la marca de la plataforma,
  para ser coherente con el footer de la misma página y con la promesa
  white-label.

### Lo que se verificó y NO es un problema

- **Modo `showcase` sin formulario de contacto es intencional.** El análisis
  inicial lo reportó como falla, pero `lib/project-types.ts:222-227` define
  `showcase` con `showLeads: false` a propósito: un "proyecto único" (escuela,
  museo) no tiene unidades en venta y no captura leads. `ContactSection` se
  apaga correctamente (`ContactSection.tsx:6`). No se toca.
- **Las librerías pesadas ya están bien separadas.** marzipano, leaflet y swiper
  se cargan con `next/dynamic({ ssr: false })`. No se toca.
- **`getPublicProjectBySlug` ya está memoizado** con `cache()` de React
  (`data/project-repository.ts:208`). Por eso el layout puede pedir el proyecto
  sin agregar un query por request.

## A. Theme y `Navbar` al layout

`app/proyecto/[slug]/layout.tsx` pasa a ser el dueño del "chrome" del sitio del
proyecto. Hoy sólo resuelve `basePath`; pasa a además:

1. Traer el proyecto con `getPublicProjectBySlug(slug)` — gratis, la llamada se
   deduplica con la que ya hace cada página en la misma request.
2. Resolver `typeConfig` y `theme`.
3. Envolver `children` en el `<div>` con `theme.cssVars`, `ALL_FONT_CLASSNAMES`,
   `fontFamily: 'var(--theme-font-body)'` y las clases de fondo, e inyectar
   `theme.fontFaceCss` — exactamente el envoltorio que hoy vive en
   `page.tsx:56-61`.
4. Montar el `<Navbar>` con las mismas props derivadas que hoy calcula
   `page.tsx:62-69` (`showCalculator`, `hasTour`, `singleUnit`, `unitsLabel`).

`app/proyecto/[slug]/page.tsx` pierde ese envoltorio, el `fontFaceCss` y su
`<Navbar>`; conserva su hero, sus secciones, comentarios y footer.

Las 6 sub-rutas heredan theme + fuentes + `Navbar` **sin modificarlas**.

**Proyecto inexistente:** el layout debe manejar el caso igual que las páginas
(hoy cada una hace `if (!project) notFound()`), para no renderizar un chrome
temizado alrededor de un 404.

**Espacio del `Navbar`:** el `Navbar` es `fixed` con `h-16`
(`Navbar.tsx:35,37`). Hoy la landing lo compensa con el `min-h-screen` del hero
y un `mt-16` (`page.tsx:87`). Las sub-rutas nunca convivieron con él: cada vista
tiene su propio primer bloque con su propio padding superior (ej.
`AmenitiesView.tsx:110` `pt-[26px]`, `UnitsListView.tsx:242` `pt-[26px]`). Al
montar el `Navbar` global, ese primer bloque queda tapado.

**Decisión:** el espacio se da **una sola vez, en el envoltorio del layout**, no
parcheando cada vista. La landing, que hoy se compensa sola con el hero a
`min-h-screen` y su `mt-16`, debe ajustarse para no quedar con doble
compensación. Parchear vista por vista se descarta explícitamente: son seis
vistas, cada parche es una oportunidad de olvidarse de una, y el defecto
resultante (contenido tapado por el nav) no lo detecta ninguna herramienta
automática.

## B. Reconciliar las navegaciones ad hoc

Con el `Navbar` global montado, las filas de navegación propias de cada vista
pasan a ser una segunda navegación redundante. Se remueven:

| Vista | Qué se saca |
|---|---|
| `UnitsListView.tsx:244-269` | el link `← NOMBRE` y los botones Masterplan / Amenities |
| `AmenitiesView.tsx:97-101` | el link `← NOMBRE` del estado vacío |
| `AmenitiesView.tsx:112-124` | el link `← NOMBRE` y los pills de sección |
| `LocationView.tsx:147-151` | el link `← NOMBRE` |

**Lo que NO se saca:**

- **Las barras sticky de filtros y controles** (ej. `UnitsListView.tsx:299`).
  Son controles de la vista, no navegación. Se quedan tal cual.
- **La acción "Contactar".** El `Navbar` global no tiene ninguna acción de
  contacto: su CTA es "Explorar Proyecto" → masterplan (`Navbar.tsx:74-84`).
  El botón "Contactar" de `UnitsListView.tsx:263-268` llama `openLead()`, que
  abre `LeadCaptureModal`. Ese botón es el más prominente de **cinco** puntos de
  entrada a `openLead()` en esa vista (los otros: `:486` estado vacío sin
  resultados, `:521` CTA de asesor, `:657` desde el comparador). Sacar la fila
  sin preservar la acción sería una pérdida de capacidad. Debe conservarse —
  reubicada en la barra sticky de la vista, que es donde viven los demás
  controles de esa pantalla.

**El "Volver al proyecto ×" de `LocationView` (`:219-226`) se queda, con otra
etiqueta.** No es navegación: llama `setSelectedId(null)`, que deselecciona el
punto de interés activo y devuelve el mapa a la vista del proyecto. Con un
`Navbar` que ahora sí ofrece "Inicio", esa etiqueta pasa a competir con una
acción real de navegación y a prometer algo que no hace. Se conserva el control
y se le cambia el texto por uno que describa lo que hace — quitar la selección
del punto, no salir de la página.

## C. Marca del proyecto en el `Navbar`

`Navbar.tsx:39-46` reemplaza el logo "360" + "InteractiveRE" hardcodeados por el
nombre del proyecto, tomando el mismo criterio que ya usa el footer
(`page.tsx:132`).

Como el `Navbar` es un Client Component y ya recibe props desde el server, el
nombre viaja como una prop más. El `Navbar` ya usa variables del theme en todo
su marcado (`--theme-bg-alt`, `--theme-accent`, `--theme-text-on-dark`…), así
que no hace falta tocarle ni una clase de color.

## D. "Volver a resultados" con contexto preservado

Dos piezas:

1. **Serializar los filtros de `UnitsListView` en la URL.** La vista ya recibe
   un filtro inicial por query param (`initialBuildingFilter`, alimentado desde
   `unidades/page.tsx:8,26` con `searchParams.edificio`), pero el resto del
   estado de filtros vive sólo en memoria. Al reflejarlo en la URL, el listado
   filtrado se vuelve una dirección a la que se puede volver (y que se puede
   compartir, un beneficio secundario real en este dominio).

2. **`UnitViewer` ofrece volver al listado, en mobile y en escritorio.** Pasa a
   recibir un `backHref` opcional que apunte al listado filtrado de donde vino
   el usuario.

   - En **mobile**, la barra superior (`:632-637`) ya tiene un control de
     retroceso: pasa a usar `backHref` cuando está presente, y a mantener el
     plano de piso como destino cuando no lo está (ej. si el usuario llegó
     directo por un link compartido).
   - En **escritorio hay que agregar el control, porque hoy no existe
     ninguno.** La barra superior de escritorio (`:676`) sólo tiene "Planta N" y
     "Cambiar planta" (`:707-718`), que es una acción de cambio de piso, no un
     retroceso — no se reutiliza ni se le cambia el significado.

   Un `backHref` ausente no debe dejar controles muertos: si no hay a dónde
   volver, no se muestra un botón de volver.

## E. "Ver similares" lleva a unidades similares

En `UnitsListView.tsx:814` (tarjeta) y `:888` (fila), el `href` de una unidad
**vendida** deja de apuntar a esa misma unidad y pasa a apuntar al listado
filtrado por unidades comparables **disponibles**.

Criterio de similitud, usando sólo campos que `Unit` ya tiene (`type`,
`totalArea`, `price`, `buildingId`, `status`): mismo `buildingId` y misma
tipología, con `status === 'available'`. No hace falta infraestructura de datos
nueva. Si ese filtro no deja ninguna unidad, la etiqueta no debe prometer algo
que no existe: en ese caso conviene no ofrecer "Ver similares".

La misma lógica habilita, más adelante, un bloque de alternativas dentro de
`UnitViewer` para unidades vendidas — pero eso es Fase B, no esta.

## Fuera de alcance

- **El re-theming de colores del explorador** (las 324 clases `trevo-*`/
  `gray-*`/`brand-*`). Fase propia, a hacer con navegador disponible para
  verificar visualmente.
- **Los componentes nuevos** (widget de disponibilidad embebido en la landing,
  bloque de unidades similares dentro de `UnitViewer`, favoritos visibles en el
  nav, `ComparePicker` conectado). Fase B.
- **Rendimiento y SEO** (las 9 rutas sin ISR por el `headers()` del layout y el
  `cookies()` del cliente Supabase, el sobre-fetch con `select('*')`, los
  thumbnails sin `next/image`, la imagen Open Graph y el JSON-LD faltantes, la
  query duplicada). Fase C. **Nota de coordinación:** la Fase C va a tocar el
  mismo `layout.tsx` que esta fase modifica, porque el `headers()` que fuerza
  el render dinámico vive ahí. Esta fase no debe agregar llamadas nuevas a
  `headers()` ni a `cookies()` en el layout — el fetch que agrega (A.1) ya está
  memoizado y la Fase C lo va a reconsiderar junto con el resto.
- **El `saleMode: 'showcase'` sin captura de leads**, que es intencional.

## Testing

El repo corre vitest con `include: ['**/*.test.ts']` — sólo `.ts`, sin tests de
componentes. La superficie testeable de esta fase es el criterio de similitud de
la sección E: conviene extraerlo como función pura en `lib/` con su test
(mismo patrón que `lib/floor-status.ts` y `lib/unit-fields.ts` de fases
anteriores), cubriendo: hay similares disponibles, no hay ninguno, y que la
unidad de origen nunca se incluya a sí misma.

El resto (mover el envoltorio, remover filas de navegación, propagar `backHref`)
se verifica por revisión de diff, `tsc`, `eslint`, y un recorrido en navegador
cuando esté disponible. **El recorrido en navegador importa especialmente en
esta fase**, porque montar un `Navbar` `fixed` sobre seis vistas que nunca
convivieron con él es exactamente el tipo de cambio cuyo defecto es visual
(contenido tapado) y no lo detecta ninguna herramienta automática.
