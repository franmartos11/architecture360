# Analítica de visitas y links de broker — diseño

Fecha: 2026-11-24 · Estado: borrador para aprobar

## Para qué

Sale del análisis competitivo contra Urbania3D: ellos venden "métricas: unidades más visitadas, tiempo en pantalla" y "links ilimitados para brokers con métricas por inmobiliaria". Atrium hoy no registra ninguna visita, y `leads.source` solo dice desde qué formulario entró el lead (`form_modal`, `home_contact_form`), no quién lo trajo.

La desarrolladora quiere poder responder dos preguntas desde el panel:

1. **¿Qué se mira?** Cuánta gente entra al sitio, qué unidades miran más, cuánto tiempo, cuántas abren el recorrido 360, y cuántas terminan consultando.
2. **¿Quién trae a la gente?** Cada inmobiliaria que comercializa el proyecto (y cada campaña: Instagram, cartel de obra) recibe su propio link. La desarrolladora ve visitas y consultas separadas por cada una, y cada lead queda marcado con quién lo trajo.

Un **link de broker** es el link del sitio con una marca: `torredelmar.com/?ref=perez`. El comprador ve exactamente el mismo sitio; el sistema solo anota de dónde vino.

## Objetivos

- Registrar visitas del sitio público de cada proyecto: páginas, unidades vistas (con tiempo), recorridos 360 abiertos, descargas del brief, clics al botón de WhatsApp.
- Capturar el canal de llegada (`?ref=`, o `utm_source` si no hay `ref`) y el sitio de origen (Google, Instagram, directo…), y asociarlo a las visitas y al lead que ese visitante deje después.
- ABM de "inmobiliarias y canales" por proyecto, con su link listo para copiar.
- En el panel: resumen de visitas, ranking de unidades, embudo visita → consulta, y desglose por canal — todo con filtro por período.
- Guardar `unit_id` en los leads del formulario (hoy se pierde, ver abajo).

## No-objetivos

- **El bot de WhatsApp queda afuera** (decisión del usuario): no se toca el bot ni se atribuyen a un broker los leads que crea el bot. El clic en el botón de WhatsApp del sitio sí se cuenta, porque es un evento de la web.
- Panel propio para cada inmobiliaria (opción B, descartada por el usuario: solo la desarrolladora ve los números).
- Mapas de calor y grabación de sesiones.
- Integraciones con CRMs / API pública (se dejaron para más adelante).
- Exportar las métricas a CSV, vista en tiempo real, alertas.
- QR por canal (va con el proyecto "ficha PDF por unidad con QR", que trae la librería de QR).

## Anti-objetivos (fallaría aunque funcione)

- Que el registro haga más lento el sitio público o que, si falla, rompa algo: tiene que ser "disparar y olvidar".
- Contar como visitas la vista previa del borrador del dueño.
- Que el `?ref` cambie lo que ve el comprador.
- Guardar datos personales del visitante (IP, cookies de terceros, huellas del navegador).

## Enfoques considerados

- **A — Registro propio en Supabase (elegido por el usuario).** El sitio manda eventos a una ruta nuestra, que los guarda en una tabla por proyecto. El panel los consulta con los mismos permisos que los leads. Sin terceros, sin banner de cookies, todo dentro del panel. No trae mapas de calor. Volumen chico: ~200 bytes por evento, 100.000 eventos ≈ 20 MB.
- **B — Servicio externo (PostHog o similar).** Mapas de calor y grabaciones gratis, pero para mostrar números en nuestro panel hay que consultar su API por proyecto, un tercero ve los visitantes de cada desarrolladora, y es otra cuenta y otro costo. Descartado.

## Diseño

### Datos (`supabase/schema.sql`, se corre a mano en producción)

**`project_channels`** — las inmobiliarias y campañas de un proyecto.
- `id uuid pk`, `project_id uuid → projects on delete cascade`, `name text` ("Inmobiliaria Pérez"), `slug text` (lo que va en `?ref=`, generado del nombre con `lib/slug.ts`, editable), `kind text check in ('inmobiliaria','campaña')`, `archived_at timestamptz null`, `created_at`.
- `unique (project_id, slug)`.
- RLS: lectura y escritura con `project_role_rank(project_id) >= 2` (gestor en adelante, igual que leads).

**`site_events`** — un evento por fila.
- `id uuid pk` (lo genera el navegador, para poder completar la duración después), `project_id uuid → projects on delete cascade`, `visitor_id uuid` (anónimo, ver abajo), `session_id uuid` (ver "Visita"), `type text check in ('page','unit','tour','brief','whatsapp')`, `path text`, `unit_id uuid null → units on delete set null`, `ref text null` (el canal **atribuido** al visitante, first-touch — no el del link de esa llegada puntual), `referrer_host text null`, `device text check in ('mobile','desktop')`, `duration_seconds int null` (solo en `unit`), `created_at timestamptz default now()`.
- Índices: `(project_id, created_at)`, `(project_id, unit_id)`, `(project_id, ref)`.
- RLS: sin políticas para anon (se inserta con service-role desde la ruta). Lectura `project_role_rank(project_id) >= 2`.

**`leads`**: `add column if not exists ref text`, `add column if not exists visitor_id uuid`.

**Canal = texto, no FK.** Eventos y leads guardan el `ref` como texto (en minúsculas); el cruce con `project_channels.slug` se hace al consultar. Así "Registrar" un link sin registrar le asigna automáticamente todo lo pasado, sin reescribir filas. Para que los links ya repartidos (cartel de obra, flyers) no se rompan, **el slug de un canal se bloquea apenas tiene tráfico** (algún evento o lead con ese `ref`); hasta entonces es editable. El nombre siempre es editable.

### Identificar unidades (corrección sobre el código actual)

El sitio público usa el **código** de la unidad como `Unit.id` (`data/project-repository.ts`: `id: u.code`), no el uuid, y el código solo es único por piso (`unique (floor_id, code)`). Por eso `leads.unit_id` quedó sin usar (comentario en `schema.sql`) y `LeadCaptureModal` manda hoy el código en `unitId`. Se agrega al `Unit` del sitio un campo nuevo con el uuid real (p. ej. `dbId`), sin cambiar `id` (las URLs y todo el front lo usan). Eventos y leads mandan ese uuid. Si `/api/leads` recibe algo que no es un uuid de una unidad del proyecto, lo ignora y guarda el lead igual (nunca un 500 por esto).

**Leads viejos:** las consultas por unidad del ranking cuentan los leads con `unit_id`; para los anteriores, que solo tienen `unit_name`, se hace un backfill único que completa `unit_id` cuando el código coincide con **una sola** unidad del proyecto. Los ambiguos quedan sin unidad.

### Definiciones de las cifras

- **Visitante único**: `visitor_id` distinto en el período.
- **Visita**: sesión. `session_id` se guarda en `localStorage` con la hora del último evento; si pasaron más de 30 min sin actividad, se genera uno nuevo.
- **Vio una unidad**: evento `unit`. Se dispara al abrir la ficha de la unidad **y** al abrir la unidad en el panel del plano del piso (`FloorPlanViewer` / `MobileUnitPanels`), porque mucha gente navega solo desde el plano. El comparador no cuenta.
- **Consulta (web)**: lead creado desde el sitio (formulario o modal) **o** clic en el botón de WhatsApp, contado por visitante. Es lo que se usa en el embudo, la conversión y los números por canal: todo lo que se puede atribuir a una visita.
- Los leads que crea el bot de WhatsApp (`source = 'whatsapp_bot'`) **no** entran en conversión ni en canales (el bot queda afuera de este trabajo). Se muestran aparte, como un número informativo "otros leads del período".

### Captura en el sitio público

Un componente cliente `SiteTracker` montado en `app/proyecto/[slug]/layout.tsx` (cubre todas las sub-rutas, el dominio propio y el modo embed).

- **Visitante**: `visitor_id` = uuid aleatorio en `localStorage` (con try/catch; si no hay storage, uno por pestaña). Sin cookies. En un dominio propio es otro origen, así que es otro id: está bien.
- **Canal**: al cargar cualquier página, si la URL trae `ref` (o, si no, `utm_source`), se guarda en `localStorage` junto con la fecha. **Gana el primer canal** (first-touch) durante **90 días**: si alguien llegó por Pérez y una semana después vuelve por Instagram, sigue siendo de Pérez. Pasados los 90 días, el próximo `ref` lo reemplaza. La URL no se limpia.
- **Origen**: `document.referrer` → solo el host (`google.com`, `instagram.com`), y vacío si es el mismo sitio.
- **Eventos**:
  - `page` en cada navegación (incluye cambios de ruta del cliente).
  - `unit` al entrar a la ficha de una unidad; al salir (`visibilitychange` a hidden o cambio de ruta) se manda otra vez el mismo `id` con `duration_seconds` y la ruta hace upsert. Tope de duración 30 min (pestañas olvidadas).
  - `tour` al abrir un recorrido 360 (áreas comunes o de una unidad, con `unit_id` si aplica).
  - `brief` al tocar "Descargar brief".
  - `whatsapp` al tocar el botón de WhatsApp del sitio.
- **Transporte**: `navigator.sendBeacon` (con `fetch keepalive` de respaldo) a `POST /api/track`. Nunca se espera la respuesta ni se muestra un error.
- **No se registra** si es vista previa del borrador (`isDraftPreview`), ni si el user agent es un bot.

### Ruta `POST /api/track`

- Valida con zod (mismo patrón que `/api/leads`), resuelve `project_id` por slug, valida que `unit_id` sea una unidad del proyecto (si no, lo deja en null), pasa `ref` a minúsculas, deduce `device` del user agent, descarta bots e inserta / hace upsert con service-role.
- No guarda la IP. La usa solo para un rate limit por IP generoso (p. ej. 300 eventos / 10 min) que corte abusos sin cortar a un visitante real.
- Responde `204` siempre que el payload sea válido, aunque el proyecto no exista (no le sirve de oráculo a nadie).
- El proxy ya deja pasar `/api/**` en dominios propios y maneja CORS (ver `proxy.ts`).

### Leads

- `POST /api/leads` acepta y guarda el uuid de la unidad (ver "Identificar unidades"), además de `ref` y `visitorId`. El cliente los lee del mismo `localStorage` del tracker.
- El evento "consulta" no se duplica en `site_events`: la consulta es la fila en `leads`.

### Panel

Nueva entrada de primer nivel **"Métricas"** en `ProjectAdminShell`, visible para gestor en adelante y solo si el proyecto es "para vender" (`showLeads`, igual que Leads). Dos pestañas:

**Resumen** — filtro de período 7 días / 30 días / todo (mismo control que el dashboard).
- Cifras: visitantes únicos, visitas, consultas web, tasa de conversión (visitantes que consultaron / visitantes únicos), y aparte "otros leads del período" (bot / cargados a mano).
- Embudo: visitantes → vieron una unidad → abrieron un 360 → consultaron.
- Ranking de unidades: vistas, visitantes únicos, tiempo promedio, recorridos 360, consultas (leads con ese `unit_id`), estado actual. Ordenable; por defecto, más vistas primero.
- Origen del tráfico: por canal registrado, links sin registrar, y sin link agrupado por sitio de origen (Google, Instagram, directo…).
- Dispositivo: % celular / computadora.

**Inmobiliarias y canales**
- Lista de canales con: nombre, tipo, link completo con botón "Copiar" (URL pública del proyecto con `getProjectDisplayUrl` + `?ref=slug`, respetando el dominio propio), visitantes, consultas y conversión del período.
- Alta, edición y archivo. El slug se puede editar solo mientras el canal no tiene tráfico (después se muestra bloqueado, con la explicación). Archivar no borra: el link sigue atribuyendo, pero sale de la lista principal.
- "Links sin registrar": los `ref` que llegaron y no coinciden con ningún canal (p. ej. alguien inventó `?ref=instagram`), con botón "Registrar" que crea el canal con ese slug; como el cruce es por texto, lo pasado queda asignado solo.

**Dashboard (`/admin`)**: una tarjeta chica con visitantes y consultas del período y un link a Métricas.

**Leads › Tablero**: columna "Canal" y filtro por canal.

Las agregaciones se hacen en Postgres (funciones SQL `security invoker`, para que apliquen las RLS), no trayendo eventos crudos al navegador.

## Llamadas mías (corregibles)

- **First-touch por 90 días** para atribuir al broker: el cliente es de quien lo presentó primero. Es la decisión con más peso comercial; si prefieren "último link que usó", es un cambio chico.
- Se acepta `utm_source` como canal cuando no hay `ref` (así las campañas de Meta/Google entran sin configurar nada).
- Se guardan los `ref` desconocidos y se muestran como "sin registrar", en vez de descartarlos.
- "Métricas" como ítem propio del menú (no adentro de Leads, que ya tiene una pestaña "Visitas" del bot y se confundiría).
- Solo proyectos "para vender"; gestor en adelante.
- Las visitas del equipo de la desarrolladora al sitio publicado se cuentan como cualquier otra (solo se excluye la vista previa del borrador).
- No se guarda la IP; no hay cookies.
- El canal se guarda como texto y el slug se bloquea apenas tiene tráfico, para que no se rompan links impresos.
- "Consulta" = formulario del sitio o clic en WhatsApp; los leads del bot van aparte y no cuentan para canales ni conversión.
- "Visita" = sesión con corte a los 30 minutos sin actividad.
- Abrir una unidad en el plano del piso cuenta como "vio la unidad", igual que entrar a su ficha.
- Backfill de leads viejos por código de unidad, solo cuando no hay ambigüedad.

## Para quien lo construya

- Nombres de componentes y archivos, y la forma exacta de las funciones SQL de agregación.
- Cómo detectar cambios de ruta del cliente en el tracker (App Router).
- Regex de bots y heurística de dispositivo.
- Diseño visual de las pantallas de Métricas, siguiendo `components/admin/panel-ui` y el rediseño de Leads.
- Política de retención de eventos crudos (hoy no se borra nada).
- Al duplicar un proyecto no se copian canales ni eventos; al borrarlo se borran en cascada.
