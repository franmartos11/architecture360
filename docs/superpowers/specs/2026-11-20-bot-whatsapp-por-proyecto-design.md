# Bot de WhatsApp con IA por proyecto — diseño

Fecha: 2026-11-20 · Estado: borrador para aprobar

## 1. Qué es y por qué

Cada proyecto de 360Proyects puede vincular **su propio número de WhatsApp** escaneando un QR (igual que en aspa-software). Los clientes le escriben a ese número por su cuenta y **una IA les responde** con la información real del proyecto: unidades, precios, disponibilidad, superficies, amenities, ubicación, financiación. Cuando la IA juzga que la persona está **bastante interesada**, el bot le manda un WhatsApp al **vendedor** con un resumen y crea el lead en el tablero.

Para qué: que el desarrollador no tenga que atender cada consulta repetida ("¿cuánto sale?", "¿tienen 2 ambientes?", "¿dónde queda?") y que solo le lleguen los clientes con los que vale la pena hablar, ya precalificados.

Todo vive en **Leads** del admin: el tablero de siempre, las conversaciones y la configuración del bot.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Vincular un número por proyecto con QR desde el admin y ver su estado (conectado / esperando QR / caído).
- Responder solo, en español rioplatense, con datos **en vivo** del proyecto (precio y estado de unidad se leen al momento de responder).
- Mandar fotos y planos de unidades cuando el cliente los pida.
- Detectar interés con la IA y avisar al vendedor **una vez** por cliente, con resumen y link `wa.me`.
- Crear/actualizar el lead en el kanban de Leads con el resumen y la conversación enlazada.
- Ver todas las conversaciones en Leads y poder **contestar como vendedor** desde ahí, desde el número del proyecto; mientras el vendedor habla, el bot se calla en ese chat.
- Usar el número del proyecto en el botón "Consultar por WhatsApp" del sitio público (hoy está fijo en `5491100000000`).

**No-objetivos (v1)**
- API oficial de WhatsApp Cloud.
- Varios números por proyecto o un número compartido entre proyectos.
- Mensajes salientes a clientes que no escribieron (tandas, recontacto, seguimientos).
- Transcribir audios: el bot responde pidiendo que lo escriban.
- Varias máquinas / pase por caída / mover número (hay un solo servidor del bot).
- Roles propios del bot: usa los roles de proyecto de 360 (editor < gestor < administrador < dueño, ver §7.10), no agrega otros.

**Anti-objetivos (aunque "funcione", sería un fracaso)**
- Que el bot **invente** precios, disponibilidad, fechas de entrega o condiciones de pago. Si no está en los datos, dice que lo consulta con el equipo.
- Que el bot conteste mientras el vendedor está hablando con el cliente.
- Que el número termine bloqueado por WhatsApp por comportamiento de robot.
- Que el vendedor reciba avisos por cualquier consulta suelta (spam de avisos).
- Que el bot quede conversando con otro bot (contestadores automáticos).

## 3. Restricciones

- **WhatsApp Web no oficial** (`whatsapp-web.js` + Chromium headless), como aspa. Necesita un proceso **siempre prendido** con disco persistente: no puede correr en Vercel. Corre en un **servidor propio de 360, totalmente independiente de aspa-scout y de aspa-software** (no comparte máquina, usuario, base ni código en ejecución), contra la **Supabase de 360**. El paquete es agnóstico de la máquina: sirve igual en un VPS (Hetzner, DigitalOcean, etc.) o en una mini PC propia.
- **IP del servidor**: WhatsApp desconfía más de las IP de data center (aspa documenta que necesita IP residencial). Una mini PC en una oficina/casa es lo de menor riesgo; un VPS es más cómodo pero suma riesgo de bloqueo. La elección de máquina queda abierta y no cambia el código.
- Cada número abierto es un Chromium (~200–300 MB RAM). Un servidor de 4–8 GB alcanza para decenas de proyectos; si crece, se evalúa la API oficial.
- 360 no tiene migraciones: los cambios de esquema van en `supabase/schema.sql` (idempotente) y se aplican pegándolo en el SQL Editor.
- Multi-cuenta por proyecto con roles (`project_members` + `project_role_rank()`: editor 1, gestor 2, administrador 3, dueño 4) y RLS por rango. Ver §7.10.
- Riesgo de bloqueo: aceptado, mitigado (ver §7.6). El bot **nunca inicia** conversación con un cliente.

## 4. Enfoques considerados

1. **Puente propio en este repo, en un servidor propio de 360, con la IA adentro (elegido).** Un proceso `scripts/whatsapp-bot.ts` mantiene las sesiones, recibe, llama a Claude con herramientas que leen Supabase, y despacha la cola de salida. El admin (Vercel) solo escribe en la base. Una pieza nueva, baja latencia, datos siempre frescos.
2. **Puente en el servidor + IA como endpoint en Vercel.** Separa transporte y cerebro, pero suma salto de red, autenticación entre servicios y timeouts de funciones serverless, sin ganancia (el puente ya tiene acceso a la base).
3. **Managed Agents de Anthropic.** Pensado para agentes con contenedor y archivos; acá el bot solo consulta datos. Cobra tiempo de sesión y suma latencia.

Descartados antes: reutilizar el puente de aspa-software (el usuario quiere que viva en este proyecto, y aspa descarta contactos que no son prospectos/clientes); API oficial de Cloud (evaluada en la conversación; el usuario prefirió el método QR de WhatsApp Web).

Elegido el 1 por Claude, con el visto bueno del usuario ("hacelo con tus criterios").

## 5. Decisiones del usuario

- Un número de bot **por proyecto**, vinculado por QR, método aspa.
- El número del **vendedor se carga por proyecto** y queda asociado a un usuario (`vendedor_user_id`: quien crea la configuración del bot, un administrador o el dueño).
- **La IA decide** cuándo alguien está interesado.
- Conversaciones y configuración del bot en **Leads**.
- Implementado dentro de 360Proyects, no en aspa-software.
- **Totalmente independiente de aspa-scout**: el bot corre en un servidor propio. No se usa la API oficial.

## 6. Decisiones de Claude (corregibles)

- El vendedor contesta **desde el número del proyecto** dentro de Leads (bandeja). El aviso igual trae link `wa.me` por si prefiere su personal.
- Aviso **una vez por conversación**; se rearma si el cliente vuelve tras ≥ 7 días sin escribir.
- El lead se crea **al momento del aviso** (el tablero queda con gente interesada); todas las conversaciones se ven en la pestaña Conversaciones.
- Modelo: `claude-opus-5-5` (default actual), con caché de la ficha del proyecto. Cambiar a un modelo más barato es decisión del usuario.
- Toma humana: 12 h de silencio del bot en ese chat desde el último mensaje del vendedor, con botón "Devolver al bot".
- **Línea dedicada**: el número del bot debería ser un chip solo para el proyecto. La pantalla de vinculación lo recomienda explícitamente. Como resguardo por si vinculan un teléfono en uso: el bot **solo responde chats cuya primera conversación empezó después de vincular** (`wa_conversaciones.creada_post_vinculo`); los chats preexistentes se guardan pero quedan en `modo = 'humano'` permanente. Nunca responde al `vendedor_whatsapp`, y la config no permite que `vendedor_whatsapp` sea el mismo número del bot.
- **Identidad**: el bot puede usar un nombre ("Sofía, del equipo de Torre Alba"), pero **nunca afirma ser una persona**: si le preguntan, dice que es el asistente virtual del proyecto y que puede pasarlo con alguien del equipo. El texto de ayuda de "Se presenta como" lo aclara.
- **Leads existentes, sin pisar lo cargado a mano**: `avisar_vendedor` busca primero un lead del mismo proyecto con el mismo teléfono (normalizado) — venga del bot o del formulario web — y lo vincula/actualiza; solo crea uno si no existe. Al actualizar: completa campos vacíos (`name`, `email`, `unit_name`), agrega el resumen nuevo al final de `message` con fecha, **nunca cambia `status`** (si estaba en negociación sigue ahí). El re-aviso tras 7 días sigue la misma regla.
- **Proyectos no publicados**: el bot responde igual si un administrador o el dueño lo activó (activarlo es la decisión explícita). El botón público de WhatsApp solo aparece en proyectos publicados.
- **Producción y pruebas**: hay una sola Supabase compartida. Para que una notebook no tome bots reales, el puente solo atiende bots con `wa_bots.host_permitido = BOT_HOST` (se completa con el nombre del servidor de producción al instalarlo; editable solo por service role/SQL). Para probar en local se crea un proyecto de prueba con `host_permitido` = nombre de la notebook y un número de prueba.
- **Despliegue**: el código sale del repo `architecture360` (GitHub, rama `main`), app en `my-app/`. En el servidor propio (Linux): clon con deploy key de solo lectura, usuario `p360`, Chromium del sistema, unidad systemd `p360-whatsapp-bot` y un `ops/instalar-bot-linux.sh` + `ops/actualizar-bot.sh` (git pull, `pnpm install --frozen-lockfile`, reinicio). Sin timer de actualización automática en v1: cada reinicio corta el bot ~1 min, mejor controlarlo a mano.

## 7. Diseño

### 7.1 Piezas

```
Cliente ─WA─▶ número del proyecto ─▶ scripts/whatsapp-bot.ts (servidor propio)
                                       ├─ sesiones whatsapp-web.js (una por bot)
                                       ├─ recepción → guarda mensaje → (si corresponde) turno de IA
                                       ├─ IA: Claude + herramientas sobre Supabase 360
                                       └─ despacho de wa_salida (respuestas, adjuntos, avisos)
Admin (Vercel) /admin/leads ─▶ Supabase 360: config, QR, mensajes del vendedor, pedidos
Sitio público ─▶ botón WhatsApp con el número del proyecto
```

### 7.2 Datos (`supabase/schema.sql`)

Prefijo `wa_` para no chocar con `messages` (social).

- **`wa_bots`** — uno por proyecto (`project_id` unique).
  - Estado: `estado` (`desconectado` | `esperando_qr` | `conectado` | `error`), `numero` (E.164, se completa al conectar), `qr` (dataURL) + `qr_at`, `heartbeat_at`, `puente_host`, `puente_hasta` (lease), `ultimo_error`.
  - Pedido desde la app: `pedido` (`conectar` | `desconectar` | `reiniciar` | null) + `pedido_at`.
  - Config: `activo` (bot responde sí/no), `nombre_bot` (cómo se presenta), `vendedor_nombre`, `vendedor_whatsapp`, `vendedor_user_id` (default: quien crea la configuración), `conocimiento` (texto libre: financiación, cuotas, entrega, horarios de visita, FAQ), `criterio_aviso` (texto libre opcional).
- **`wa_bots`** también lleva `host_permitido text` (null = ningún puente lo toma) y `vinculado_at`.
- **`wa_conversaciones`** — `bot_id`, `project_id`, `contacto_numero` (unique por bot), `contacto_nombre` (pushname), `creada_post_vinculo` (bool), `modo` (`bot` | `humano`), `humano_hasta`, `avisado_at`, `lead_id` → `leads`, `ultimo_mensaje`, `ultimo_mensaje_at`, `ultimo_entrante_at`, `no_leidos`, `resumen` (el último resumen de la IA).
- **`wa_mensajes`** — `conversacion_id`, `wa_id` (unique, dedupe), `direccion` (`entrante` | `saliente`), `autor` (`cliente` | `bot` | `vendedor` | `telefono`), `tipo` (`texto` | `imagen` | `audio` | `documento` | `otro`), `cuerpo`, `media_url`, `enviado_at`, `ack`.
- **`wa_salida`** (cola) — `bot_id`, `conversacion_id` (null para el aviso al vendedor), `destino` (número), `cuerpo`, `adjunto_url`, `origen` (`bot` | `vendedor` | `aviso`), `autor_id`, `estado` (`pendiente` | `enviando` | `enviado` | `error`), `intentos`, `error`, `creado_at`, `enviado_at`.
- **`leads`**: + `wa_conversacion_id uuid`. El bot inserta con `source = 'whatsapp_bot'`, `method = 'whatsapp'`, `message` = resumen, `unit_name` = unidad(es) de interés.

**RLS** (por rango, con `(select project_role_rank(project_id))`; detalle en §7.10): `wa_conversaciones`, `wa_mensajes` y `wa_salida` desde gestor (rango ≥ 2, igual que `leads`); `wa_bots` (configuración, `qr`, pedidos) desde administrador (rango ≥ 3). Desde el panel solo se puede insertar en `wa_salida` con `origen = 'vendedor'`, `autor_id` propio, sin adjunto, cuerpo de 1 a 4000 caracteres y al contacto de una conversación existente del mismo bot. El puente usa service role.

**Público**: una vista o función `public_project_whatsapp(slug)` que devuelva el número solo si `estado = 'conectado'`, para el botón del sitio.

### 7.3 El puente (`scripts/whatsapp-bot.ts` + `lib/whatsapp-bot/`)

Se porta de aspa-software lo necesario, reducido:
- `navegador.ts`, `whatsapp-web.ts` (parches de internos de WA Web, listar chats, bajar medios) y `patches/whatsapp-web.js+1.34.7.patch` (patch-package) para mandar archivos.
- De `session.ts`: ciclo de vida del `Client` (`LocalAuth` por `bot_id`, QR → `wa_bots.qr`, `ready`, `disconnected`, chequeo de salud cada 60 s, detección de dormida). Sin índice de contactos, sin tandas, sin verificación de números.
- De `envio.ts`/`politica.ts`: toma atómica de un ítem de la cola, reintentos con espera creciente (máx. 5), pausas.
- De la regla SQL `whatsapp_es_automatica`: detección de contestadores automáticos.

Bucle: cada 5 s toma/renueva lease (90 s) solo de los bots con `host_permitido = BOT_HOST`, así una notebook de desarrollo nunca toma un bot real; atiende `pedido`; despacha `wa_salida` (Realtime para enterarse rápido + sondeo cada 10 s de respaldo); late `heartbeat_at`.

Arranque: `pnpm bot` (`tsx --env-file=.env.bot scripts/whatsapp-bot.ts`). Servicio systemd `p360-whatsapp-bot` en el servidor propio; logins en `.wwebjs_auth/` del servidor. Variables: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `BOT_HOST`.

### 7.4 Recepción

Por cada `message_create`:
1. Ignorar grupos, estados/broadcast, canales.
2. Si es **saliente** (`fromMe`): si su `wa_id` corresponde a algo que mandó la cola, ya está registrado; si no, lo escribió alguien **desde el celular del número** → guardar con `autor = 'telefono'` y pasar la conversación a `modo = 'humano'` (12 h).
3. Si es **entrante**: buscar/crear `wa_conversaciones`, guardar en `wa_mensajes`, subir medios a Storage (bucket `wa-medios`), sumar `no_leidos`.
4. Decidir si responde la IA: `bot.activo` y `creada_post_vinculo` y el contacto no es `vendedor_whatsapp` y `modo = 'bot'` (o `humano_hasta` vencido) y no es contestador automático y no se superó el tope por conversación.
5. **Agrupar ráfagas**: esperar ~8 s desde el último entrante de ese chat antes de llamar a la IA (la gente manda 3 mensajes seguidos).

Audios: se guardan y la IA recibe "[el cliente mandó un audio]" para pedir que lo escriba. Imágenes del cliente: se guardan; la IA recibe un marcador (sin visión en v1).

### 7.5 La IA (`lib/whatsapp-bot/ia/`)

- **SDK oficial `@anthropic-ai/sdk`**, Messages API con bucle de herramientas propio o Tool Runner. Modelo `claude-opus-5-5`, esfuerzo bajo (es chat), con `fallbacks` del servidor ante rechazos.
- **System prompt** (estable y cacheado): rol (asesor comercial del proyecto, nombre `nombre_bot`), tono (rioplatense, breve, como WhatsApp, sin markdown pesado), reglas duras (no inventar; si falta un dato, decir que lo consulta con el equipo; nunca prometer descuentos; no hablar de otros proyectos), la **ficha del proyecto** (nombre, tagline, descripción, ubicación, tipo, edificios y pisos, amenities con descripciones, puntos de interés con tiempos, `calculator_settings`, `conocimiento`) y la guía de cuándo avisar + `criterio_aviso`.
- **Historial**: últimos ~40 mensajes de la conversación desde `wa_mensajes` (cliente = user, bot/vendedor = assistant, con prefijo cuando habló el vendedor).
- **Herramientas** (leen siempre en vivo):
  - `buscar_unidades({ambientes?, dormitorios?, precio_max?, moneda?, edificio?, estado?})` → lista compacta (código, tipo, m², ambientes, precio, estado, piso, orientación).
  - `ver_unidad({codigo})` → ficha completa (superficies, expensas, cocheras, condición, features, qué fotos/planos hay).
  - `enviar_imagenes({codigo, que: 'fotos'|'plano'|'plano_3d'})` → encola en `wa_salida` hasta 3 imágenes con `adjunto_url`.
  - `avisar_vendedor({nombre?, email?, unidades_interes[], resumen, motivo})` → (ver 7.7). Idempotente: si ya se avisó y no se rearmó, devuelve "ya avisado".
- **Guía de interés** en el prompt: avisar cuando pide visita/showroom, pide hablar con una persona, pregunta por cuotas o reserva de una unidad concreta, deja nombre o email, o da presupuesto + plazo. Solo "¿cuánto sale?" no alcanza. Si pide hablar con una persona, avisar y decirle que en breve lo contacta alguien.
- Salida: el texto final se encola en `wa_salida` (`origen = 'bot'`). Respuestas largas se cortan en 1–3 mensajes por párrafo.
- Errores de API: reintento; si falla del todo, no responde y queda marcado en la conversación (no manda un mensaje de error al cliente).

### 7.6 Medidas anti-bloqueo

- El bot solo responde a quien escribió; nunca inicia (excepto el aviso al vendedor, que es un número conocido).
- Antes de mandar: marcar leído, "escribiendo…" (`sendStateTyping`) durante un tiempo proporcional al largo (2–8 s), pausa de 1–3 s entre partes.
- Tope por conversación: máx. 30 respuestas del bot por hora; superado, se calla y se marca.
- No responde a contestadores automáticos (regla de aspa: texto largo a ≤ 6 s de nuestro mensaje, o frases típicas).
- Tope global por número: 300 mensajes del bot por día.

### 7.7 Aviso al vendedor

Cuando la IA llama `avisar_vendedor`:
1. Vincular o crear el lead según §6 ("Leads existentes"): si hay uno con ese teléfono en el proyecto, completar vacíos y agregar el resumen sin tocar `status`; si no, crear con `status = 'nuevo'`, `source = 'whatsapp_bot'`, `phone`, `name`/`email` si los dio, `unit_name`, `message` = resumen, `wa_conversacion_id`.
2. `wa_conversaciones.avisado_at = now()`, `resumen` = resumen.
3. Encolar en `wa_salida` (`origen = 'aviso'`, `destino = vendedor_whatsapp`):
   ```
   🔥 Cliente interesado – {proyecto}
   {nombre o "Sin nombre"} · {número}
   Le interesa: {unidades con amb, m², precio}
   {resumen en 1–2 líneas}
   Escribile: wa.me/{número}
   Ver chat: {url admin}/admin/leads?c={conversacion_id}
   ```
4. Si no hay `vendedor_whatsapp` cargado: igual se crea el lead.
5. Email de "nuevo lead" (si `RESEND_API_KEY` está), con la misma regla de destinatarios que `app/api/leads/route.ts` (`lib/lead-recipients.ts`): el dueño + gestores y administradores aceptados. Sale sin esperarlo, después de marcar `avisado_at`; si no se pueden leer los miembros, igual se avisa al dueño.

El badge de leads nuevos (`useNewLeadsCount`) ya lo refleja.

### 7.8 Admin: Leads con tres pestañas

`app/admin/(authenticated)/(project)/leads/` pasa a tener pestañas: **Tablero** (kanban actual sin cambios) · **Conversaciones** · **Bot de WhatsApp**. El ítem del menú pasa a mostrarse cuando el proyecto es de venta (igual que hoy).

```
Leads   [Tablero] [Conversaciones •3] [Bot de WhatsApp]

Conversaciones
┌───────────────────────┬──────────────────────────────────────┐
│ 🔍 Buscar              │ Juan Pérez · +54 9 11 5555-1234       │
│ ● Juan Pérez   🔥 14:02│ 🤖 Bot respondiendo   [Tomar chat]    │
│   "¿El 4B tiene coch…" │──────────────────────────────────────│
│   María  ·  13:40      │  cliente: hola, precio del 4B?        │
│   "gracias!"           │  bot: El 4B tiene 2 amb, 65 m², …     │
│   +54 9 351…  · ayer   │  cliente: se puede visitar el sábado? │
│                        │  🔥 Aviso enviado a Carla · ver lead  │
│                        │──────────────────────────────────────│
│                        │ [Escribí como vendedor…      ] [Enviar]│
└───────────────────────┴──────────────────────────────────────┘
```
- Lista con no leídos, 🔥 si se avisó, modo bot/humano. Tiempo real por Supabase Realtime.
- En el chat: burbujas por autor (cliente / bot / vendedor / teléfono), imágenes, estado de envío. "Tomar chat" pone `modo = humano`; escribir también lo pone. "Devolver al bot" lo revierte.
- Las tarjetas del kanban con `wa_conversacion_id` tienen "Ver chat" que abre esta pestaña en esa conversación.

```
Bot de WhatsApp
Número del proyecto   ● Conectado  +54 9 11 4444-0000   [Desconectar]
                      (o: [Vincular número] → QR grande + pasos)
Bot activo            [on]
Se presenta como      [Sofía, del equipo de Torre Alba   ]
Vendedor              [Carla Gómez] WhatsApp [+54 9 11 …]
Lo que el bot tiene que saber (financiación, entrega, visitas, preguntas frecuentes)
[ textarea grande                                          ]
Cuándo avisarme (opcional)
[ ej: solo si pregunta por 3 ambientes                     ]
                                         (guarda solo, como el resto del admin)
```
- APIs nuevas en `app/api/admin/whatsapp-bot/...` con `requireProjectAccess(projectId, { minRole })`: leer/guardar config y pedir conectar/desconectar/reiniciar con `administrador`; listar conversaciones/mensajes, enviar como vendedor y tomar/devolver chat con `gestor`.
- Pestañas por rol (`useProjectRole()`): un gestor ve Tablero y Conversaciones; "Bot de WhatsApp" es de administrador en adelante. Un encabezado "Leads" fijo arriba de las pestañas.
- Aviso si el puente no late hace > 3 min: "El servidor del bot no responde".

### 7.9 Sitio público

`LeadCaptureModal` (y cualquier otro botón WhatsApp del sitio) usa el número del bot del proyecto si está conectado; si no, oculta la opción WhatsApp. El texto prellenado se mantiene ("Hola, me interesa la unidad 4B…"), lo cual además le da contexto a la IA desde el primer mensaje.

### 7.10 Roles de proyecto

Roles de 360 (`lib/project-roles.ts`, `project_role_rank()` en SQL): editor 1 < gestor 2 < administrador 3 < dueño 4.

| Qué | Rol mínimo | API | RLS |
|---|---|---|---|
| Conversaciones, mensajes, enviar como vendedor, tomar/devolver chat, no leídos | gestor | `minRole: 'gestor'` | `wa_conversaciones` select/update, `wa_mensajes` select, `wa_salida` select/insert: rango ≥ 2 |
| Configuración del bot, vincular/desvincular/reiniciar el número, ver el QR | administrador | `minRole: 'administrador'` | `wa_bots` select/insert/update: rango ≥ 3 |

- `wa_bot_project_id(bot_id)` (security definer, solo `authenticated`): proyecto de un bot sin pasar por la RLS de `wa_bots`, para las políticas de `wa_salida` y `wa_conversaciones`; devuelve null si quien pregunta no es gestor o más en ese proyecto.
- Trigger `wa_bots_guard_host_permitido`: desde el panel no se tocan las columnas del puente (`estado`, `numero`, `qr`, `host_permitido`, lease, contadores).
- Trigger `wa_conversaciones_guard_panel`: desde el panel solo cambian `modo`, `humano_hasta` y `no_leidos`; el resto de las columnas (contacto, bot, proyecto, lead, resumen, aviso, último mensaje…) vuelve a su valor anterior. Sin esto un gestor podría cambiar el contacto y hacer que el número del proyecto le escriba primero a cualquiera.
- `wa_conversaciones` update además exige que el bot y el lead sean del mismo proyecto que la conversación.
- `enviar` lee el `estado` del bot con service role (un gestor no lee `wa_bots`), después de `requireProjectAccess` y atado a `bot_id` + `project_id` de la conversación.
- Realtime aplica las mismas políticas de select a cada suscriptor: los gestores reciben los cambios de conversaciones y mensajes.

## 8. Pruebas

- Unitarias (Vitest): detección de contestadores, reglas de "responde o no" (modo, tope, activo), agrupado de ráfagas, armado del prompt y del aviso, idempotencia de `avisar_vendedor`, mapeo de unidades a texto, corte de respuestas largas.
- Herramientas de la IA contra datos semilla (`scripts/seed-supabase.ts`).
- Un set chico de conversaciones de ejemplo para revisar a mano el tono y cuándo avisa (no es un eval formal en v1).
- Prueba real end-to-end con un número de prueba en el servidor propio antes de usarlo en un proyecto real.

## 9. Lo que queda a criterio de quien implemente

- Estructura interna de `lib/whatsapp-bot/` y cuánto del código de aspa se copia tal cual vs. se reescribe.
- Tool Runner del SDK o bucle manual.
- Texto exacto del system prompt y del aviso (respetando §7.5 y §7.7).
- Detalle visual de las pestañas, siguiendo el estilo existente del panel comercial (`lib/panel-comercial-style.ts`).
- Retención de medios en Storage.
