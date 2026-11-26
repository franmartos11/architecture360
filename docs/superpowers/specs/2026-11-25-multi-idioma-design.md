# Sitio del proyecto en varios idiomas — diseño

Fecha: 2026-11-25 · Estado: borrador para aprobación

## Para qué

Último ítem del análisis competitivo contra Urbania3D: el sitio público de cada proyecto en inglés (y más adelante otros idiomas) para compradores del exterior e inmobiliarias de afuera. Hoy todo el sitio público está en castellano: ~700 líneas de texto fijo en ~70 componentes, listas de etiquetas en `lib/` y el texto que carga cada desarrolladora (descripciones, amenities, avance de obra…), que existe en un solo idioma. No hay librería de i18n ni código de idioma en el repo.

## Decisiones del usuario

- **Contenido de la desarrolladora: traducción automática con IA (A).** Se traduce solo, queda guardado y la desarrolladora puede corregirlo. Descartados: que lo escriba la desarrolladora (casi nadie lo completa y el sitio queda mezclado) y traducir solo el texto fijo (el comprador lee la descripción en castellano).
- **Dirección propia por idioma (1).** `/proyecto/torre-sol/en/unidades`; en subdominio o dominio propio, `/en/unidades`. Un link en inglés abre en inglés, Google indexa las dos versiones, una inmobiliaria de afuera comparte el link en inglés con su `?ref=`. Descartados: idioma recordado solo en el navegador (Google ve solo castellano, el link compartido no lleva el idioma) y `?lang=en` (peor para Google, mismo costo).

## Objetivos

- Castellano sigue siendo el idioma por defecto, sin cambios en sus direcciones.
- Inglés completo en el sitio público: texto fijo, etiquetas, formatos (fechas, números) y el contenido de la desarrolladora traducido.
- Selector "ES / EN" en la barra del sitio, que lleva a la misma página en el otro idioma.
- Google: `hreflang` (es, en, x-default), canonical por idioma, `<html lang>` correcto, sitemap con las dos versiones, metadata (títulos, descripción, Open Graph) traducida.
- Panel: pantalla para revisar y corregir las traducciones del proyecto.
- Chat, ficha PDF, formularios de contacto y emails de avance de obra en el idioma del comprador.
- Arquitectura lista para sumar idiomas (portugués) sin tocar componentes: agregar un diccionario y el código del idioma.

## No-objetivos

- Traducir el panel de administración.
- Otros idiomas además del inglés en esta entrega.
- Traducir el brief PDF (es un archivo subido; sigue en un idioma).
- Cambiar de idioma solo según el navegador. Como mucho se sugiere (ver Sitio).
- Traducir nombres propios: nombre del proyecto, edificios, códigos y modelos de unidad, puntos de interés, nombre del bot, ubicación.
- Analítica por idioma (las visitas ya guardan el `path`, que incluye `/en`; queda para después).

## Anti-objetivos

- Que una página en inglés muestre texto inventado: la IA traduce, no agrega ni resume.
- Que tipear en el panel dispare decenas de llamadas a la IA (el panel guarda solo, con cada cambio).
- Romper los filtros, links o direcciones que ya existen en castellano (incluidos los links con `?ref=` ya repartidos).
- Que el sitio en castellano se vuelva más lento.

## Enfoques considerados

Ver "Decisiones del usuario" (dirección por idioma vs. navegador vs. `?lang=`; IA vs. manual vs. solo texto fijo). Para el texto fijo: diccionario propio tipado vs. una librería (next-intl). Llamada mía: **diccionario propio**. Son dos idiomas, los componentes ya usan contextos propios (base path, WhatsApp, tipo de proyecto) y una librería obliga a reestructurar rutas con un segmento `[locale]`.

## Diseño

### Idioma en la dirección

- `proxy.ts` es el único punto que mapea hosts y paths. Si el path público empieza con `/en` (`/proyecto/slug/en/...`, o `/en/...` en subdominio/dominio propio), reescribe al path sin `/en` y agrega el header de pedido `x-atrium-lang: en`. Sin `/en`, castellano. `/es/...` redirige (308) a la dirección sin prefijo.
- Las redirecciones existentes (a dominio propio) conservan el `/en`.
- `getProjectBasePath(slug)` (servidor) y `useProjectBasePath()` (cliente) devuelven el prefijo **con** `/en` cuando el idioma es inglés. Así los ~62 links internos armados con `basePath` quedan en el idioma correcto sin tocarlos, y `projectSectionFor`/Navbar (que recortan el basePath del pathname) siguen funcionando.
- Lugares que arman direcciones sin basePath (canonical, links absolutos de compartir, ficha, QR, links que manda el chat/bot) se revisan uno por uno: el builder los lista.
- `lib/i18n/locale.ts`: `LOCALES = ['es','en']`, `DEFAULT_LOCALE = 'es'`, `getLocale()` (servidor, lee el header), `LocaleProvider`/`useLocale()` (cliente, montado en el layout del proyecto).
- `<html lang>`: hoy fijo `es` en `app/layout.tsx`. Debe reflejar el idioma de la página pública. Lo resuelve el builder sin volver dinámicas páginas que hoy no lo son (leer el header en el layout raíz o ajustarlo en el cliente; si elige el cliente, documentar por qué).

### Texto fijo

- `lib/i18n/messages/es.ts` (fuente) y `en.ts` con el mismo tipo de claves (TypeScript falla si falta una). `t(clave, variables)` con reemplazo simple y plural básico. Servidor: `getT()`; cliente: `useT()`.
- Se pasan por el diccionario todos los textos visibles del sitio público: `app/proyecto/**`, componentes del sitio (`components/unit`, `floorplan`, `units`, `project-landing`, `amenities`, `aerial`, `location`, `masterplan`, `tour`, `financing`, `bim`, `chat`, `Calculator`, `HomeContactForm`, `components/ui` del sitio), `not-found`.
- Las listas de `lib/` que llegan al visitante reciben el idioma: tipos de proyecto (`lib/project-types.ts` unitLabel/buildingLabel y concordancias), estados/categorías/tipos/ambientes/características de unidad (`lib/units.ts`, `pluralize`), orientaciones (`lib/floor-views.ts`; en inglés N/NE/E/SE/S/SW/W/NW), tipos de piso, categorías de POI y de amenity, índices de financiación, meses del avance de obra, tiempo relativo, `lib/project-nav.ts`.
- Formatos: fechas y números con el locale del idioma (`es-AR` / `en-US`). Precios: la moneda sigue mandando (`formatPrice`), solo cambia el formato de los separadores.
- Valores en castellano que hoy son también claves de filtro (`units.type`, `units.features` en `tipo=`/`feats=`): las claves de URL quedan en castellano (no se rompen links); solo se traduce lo que se muestra.
- El mismo `SECTION_COMPONENTS` se usa en la vista previa del panel: sin `LocaleProvider` cae en castellano.

### Contenido de la desarrolladora

- **Qué se traduce** (fuente, tabla y columna):
  - projects: `description`, `tagline`, `before_after[].label`, `common_areas_tour` (nombres y notas de nodos, etiquetas y textos de hotspots), `construction_progress` (etiquetas de etapas, `deliveryEstimate`, título, cuerpo y `view` de cada novedad);
  - buildings: `amenities_tour` (como el tour);
  - floors: `label` (salvo códigos cortos como "PB", "L"), `floor_kind_description`;
  - units: `other_rooms_description`, `rooms` (nombre y notas), `levels[].label`, `tour_data`;
  - aerial_slides: `label`;
  - amenities: `name`, `description`, `category`, `location`, `specs` (clave y valor);
  - points_of_interest: `description`, `distance_label`;
  - bim_models: `title`, `description`;
  - project_collaborators: `contribution`;
  - calculator_settings.financing_plans: `name`, `note`.
  - No se traducen: nombres propios (ver No-objetivos), `model_name`, `parking_spots[].label`, perfiles.
  - Tampoco pasan por la IA el tipo de unidad (`units.type`), sus características (`units.features`) ni las de cada ambiente (`rooms[].features`): salen de catálogos fijos (`UNIT_TYPES`, `ALL_UNIT_FEATURES`, `ROOM_FEATURES_BY_KIND`) y se traducen con el diccionario, solo al mostrarlos; el dato y las claves de filtro (`tipo=`, `feats=`) siguen en castellano. Un valor fuera del catálogo (dato viejo o cargado a mano) se muestra en castellano.
- **Dónde se guarda:** tabla nueva `content_translations` (project_id, locale, clave, texto fuente con su huella, texto traducido, `editada` boolean, updated_at), única por (project_id, locale, clave). La clave identifica el campo de forma estable (por ejemplo `amenities:<id>:description`, `progress:update:<id>:title`, `tour:project:node:<id>:name`). Lectura: el sitio la trae con el proyecto. Escritura: el servidor (service-role) y el panel: corregir una traducción es de editor en adelante (RLS rango ≥ 1, como el resto del contenido).
- **Extractor:** función pura que, de las filas del proyecto, saca la lista `{clave, texto}` de todo lo traducible (mismo estilo que `deleteProjectStorageFiles`, tolerante a jsonb viejos o rotos).
- **Aplicar:** función pura `localizarProyecto(project, traducciones, locale)` que devuelve el `Project` con los textos reemplazados. Si falta la traducción de un campo o su huella no coincide con el texto actual, queda el castellano. El proyecto cacheado (`unstable_cache`, tag `project:<slug>`) incluye las traducciones; no se agrega otra entrada de caché por idioma.
- **Cuándo se traduce (a pedido, con candado):** no en cada guardado del panel (anti-objetivo). Cuando se arma una página en inglés y hay textos sin traducir o desactualizados, se programa (después de responder) una traducción del proyecto, con un candado por proyecto para que no corran dos a la vez. Al terminar, se invalida la caché del proyecto. También se dispara desde el panel ("Traducir ahora") y al activar el inglés del proyecto. La primera visita en inglés después de un cambio puede ver ese campo en castellano.
- **La traducción:** por tandas, con Claude (mismo cliente que el bot, `crearClienteClaude`; modelo y parámetros del bot: `claude-opus-5-5`, effort low), salida JSON validada con zod. Instrucciones: traducir al inglés para compradores de inmuebles, sin agregar ni quitar información, conservar números, medidas, monedas, nombres propios y saltos de línea. Uso registrado en `wa_uso_ia` con origen `'traduccion'` (sin bot).
- **Correcciones:** una traducción `editada` no se pisa mientras el texto en castellano no cambie. Si el castellano cambia, se vuelve a traducir y deja de estar marcada como editada; el panel lo avisa ("cambió el original, revisá la traducción").

### Panel

- Configuración del sitio: interruptor **"Sitio en inglés"** por proyecto (`projects.locales text[] default '{es}'`). Sin él, `/en` da 404 y no aparece el selector. Al activarlo se dispara la traducción.
- Permisos: corregir traducciones, editor en adelante. Activar el inglés, "Traducir ahora" y "Volver a traducir" (gastan llamadas a la IA), administrador en adelante, con su propia ruta que controla el rol (no por el guardado automático de `projects`).
- Pantalla **"Traducciones"** (editor en adelante, como el resto del contenido): lista por sección (Proyecto, Amenities, Unidades, Avance de obra…), castellano a la izquierda e inglés editable a la derecha, marca de "sin traducir" o "cambió el original", botón "Traducir ahora" y "Volver a traducir" por campo. Cada corrección se guarda sola, como el resto del panel.

### Sitio

- Selector "ES / EN" en la barra (y en el menú del celular), solo si el proyecto tiene el inglés activado. Lleva a la misma página en el otro idioma, conservando la query (`?ref=`, filtros).
- Sugerencia: en castellano, si el navegador está en inglés y el visitante no eligió idioma, una franja chica "View this site in English" que se puede cerrar (se recuerda en el navegador). No redirige.
- Metadata: títulos y descripciones traducidos, `alternates.languages` (es, en, x-default → es), canonical a la versión del idioma, `og:locale`. `app/sitemap.ts` suma las direcciones en inglés de los proyectos con inglés activo.

### Otras salidas

- **Chat:** la burbuja (saludo, sugerencias, avisos, etiquetas) en el idioma de la página; la ruta recibe el idioma. El system del canal web le dice que responda en el idioma en que escribe el comprador (por defecto, el de la página); la ficha del bot sigue armada en castellano y la IA traduce al responder. Los links que manda (unidad, sitio) van en ese idioma.
- **Leads:** columna `leads.locale` ('es'|'en') que guardan el formulario y el chat; el tablero muestra una marca "EN" y el aviso/email al vendedor dice "Habla inglés" (el texto al equipo sigue en castellano). Mensajes por defecto de los formularios y textos de WhatsApp prearmados en el idioma de la página.
- **Ficha PDF:** el botón pasa el idioma; la ficha sale con etiquetas y contenido traducidos, fecha en formato del idioma y QR a la página en ese idioma.
- **Emails de avance de obra:** a los leads con `locale 'en'`, en inglés (texto fijo del email más título/cuerpo de la novedad traducidos; si falta la traducción, se traduce antes de mandar o va en castellano — decide el builder, anotándolo). La página de baja, en el idioma del lead.

## Entrega por etapas

Cada etapa se puede subir y usar sola:

1. **Base:** idioma en la dirección, diccionario, todo el texto fijo y las listas traducidas, formatos, selector, interruptor por proyecto, metadata/hreflang/sitemap, `<html lang>`. El contenido de la desarrolladora todavía sale en castellano.
2. **Contenido:** tabla de traducciones, extractor, traducción a pedido con candado, aplicación al proyecto, pantalla "Traducciones" en el panel.
3. **Salidas:** chat, leads con idioma, formularios, ficha PDF, emails de avance de obra, sugerencia por navegador.

## Llamadas mías (corregibles)

- Diccionario propio en vez de una librería.
- Inglés activable por proyecto, apagado por defecto: ninguna desarrolladora ve aparecer traducciones automáticas sin elegirlo.
- Corregir traducciones: editor en adelante. Activar el inglés y pedir traducciones (gastan): administrador en adelante.
- Tipos y características de unidad con el diccionario (catálogos fijos), no con la IA; un valor fuera del catálogo queda en castellano.
- Traducción a pedido (al visitar en inglés o desde el panel), no en cada guardado.
- Mismo modelo que el bot para traducir.
- Las claves de filtro de la URL quedan en castellano.
- `/es/...` redirige a la dirección sin prefijo.
- La sugerencia por navegador no redirige.
- El texto para el equipo (avisos, emails al vendedor) sigue en castellano, con la marca del idioma del comprador.

## Lo que queda al builder

- Cómo resolver `<html lang>` sin volver dinámicas páginas estáticas.
- La forma exacta de las claves de `content_translations` y el tamaño de las tandas.
- Cómo se ordena la migración de ~700 textos (por carpeta, con un test que falle si queda castellano visible en componentes del sitio cuando sea razonable).
- Qué hacer con un email de avance en inglés si la novedad todavía no está traducida.
- Diseño visual del selector y de la pantalla "Traducciones" siguiendo el panel y el tema del sitio.
