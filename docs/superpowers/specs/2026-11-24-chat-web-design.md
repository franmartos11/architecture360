# Chat en el sitio (chatbot web) — diseño

Fecha: 2026-11-24 · Estado: borrador para aprobación

## Para qué

Sale del análisis competitivo contra Urbania3D ("chatbot de IA entrenado con los datos del proyecto; responde disponibilidad, medidas, orientación y financiación, y deriva al equipo cuando hay intención de compra"). Atrium ya tiene ese cerebro en el bot de WhatsApp (`lib/whatsapp-bot/`): ficha del proyecto, herramientas (buscar y ver unidades, enviar imágenes y material, anotar preguntas, agenda de visitas, avisar al vendedor) y un simulador del panel que corre el mismo turno sin WhatsApp. El chat web lleva ese cerebro al sitio público, para el comprador que está mirando el proyecto y no quiere salir a WhatsApp ni llenar un formulario.

## Decisiones del usuario

- **Solo donde la desarrolladora lo activa (A).** Interruptor en la pestaña del bot. Usa la configuración del bot: nombre, conocimiento y criterio de aviso. Descartado: chat en todos los proyectos sin configurar (gasta en proyectos que nadie atiende y responde sin el conocimiento ni el criterio cargados).
- **Mismo cerebro, conversación guardada en el servidor (1).** El navegador manda solo el mensaje nuevo; la historia la arma el servidor. Descartados: historia mandada por el navegador (se puede falsificar) y un chat sin herramientas (no deriva ni agenda).
- **El chat deriva, el vendedor no contesta en vivo (A).** Cuando hay interés, el chat junta los datos de contacto, crea el lead y avisa al vendedor; la charla sigue por WhatsApp o teléfono. En el panel la charla web se lee pero no se responde. Descartado: toma en vivo desde el panel (tiempo real hacia el navegador y solo sirve con la página abierta).

## Objetivos

- Burbuja de chat en todas las páginas públicas del proyecto (portada, unidades, unidad, recorrido, etc.) cuando está activado.
- Responde con los datos reales del proyecto, igual que el bot de WhatsApp: disponibilidad, precios (si el sitio los muestra), planes de pago, medidas, orientación, amenities, ubicación.
- Muestra imágenes y material dentro del chat.
- Cuando hay intención de compra, pide nombre y teléfono o email en la charla; con eso crea o actualiza el lead (fuente "Chat web", con la calificación que arma la IA) y avisa al vendedor.
- Agenda visitas si la agenda del bot está activa, una vez que tiene el contacto.
- Anota las preguntas que no sabe responder (mismo `wa_preguntas`).
- La charla queda en Conversaciones, marcada "Web".
- El lead conserva la atribución del sitio: `visitor_id` y `ref` de la inmobiliaria (analítica, `docs/superpowers/specs/2026-11-24-analitica-y-links-de-broker-design.md`).
- El gasto queda acotado (ver Límites).

## No-objetivos

- Que el vendedor responda desde el panel dentro del chat del sitio.
- Respuestas en streaming letra por letra (el bot de WhatsApp responde por partes; el chat muestra "escribiendo…" y después las partes).
- Audios o imágenes que mande el comprador.
- Seguimiento automático: el seguimiento del bot es por WhatsApp; una charla web no recibe mensajes después de que el comprador se fue.
- Otro idioma que el del bot.
- Un modelo distinto del bot (hoy `claude-opus-5-5`, effort low, con fallbacks). Si se quiere uno más barato para la web, lo decide el usuario.

## Anti-objetivos

- Que el chat diga algo que el sitio oculta (precio en "solo para mostrar", unidades vendidas como disponibles): usa la misma ficha que el bot, que ya respeta eso.
- Que un tercero pueda leer una charla ajena o escribir en ella: cada charla tiene un token secreto que solo tiene el navegador que la empezó.
- Que se pueda inventar historia del bot desde el navegador.
- Un gasto sin techo.
- Romper el bot de WhatsApp: el puente (envíos, seguimiento, re-aviso) no toca charlas web.

## Diseño

### Datos (SQL a mano en producción antes de deployar)

- `wa_bots.chat_web boolean not null default false`: el interruptor.
- `wa_conversaciones.canal text not null default 'whatsapp' check (canal in ('whatsapp','web'))`.
- `wa_conversaciones.web_token uuid unique`: el secreto de la charla web (null en WhatsApp).
- `wa_conversaciones.contacto_numero` pasa a aceptar null (las charlas web no tienen número; el teléfono que deja el comprador va al lead, no acá, para no chocar con el `unique (bot_id, contacto_numero)` de una charla de WhatsApp del mismo número).
- `wa_uso_ia.origen` suma `'web'` (para separar el costo del chat web del de WhatsApp y del simulador).
- Función `public_project_chat(p_project_id uuid) returns jsonb`, security definer, como `public_project_whatsapp`: devuelve `{ nombre_bot }` si el proyecto está publicado y `chat_web` está activo; si no, null. El sitio la usa para decidir si muestra la burbuja.
- `leads.source` suma el valor `'chat_web'` si tiene check; si es texto libre, solo se usa el valor.

### API pública

`POST /api/chat/[slug]` (runtime Node, `maxDuration` 60 como el simulador):

- Entrada: `{ token?: uuid, mensaje: string (1–1000 caracteres), visitorId?: uuid, ref?: string }`.
- Proyecto publicado con bot y `chat_web` activo; si no, 404. Un borrador no tiene chat (el simulador del panel ya sirve para probar).
- Sin `token`: crea la conversación web (`canal 'web'`, `web_token` nuevo) y lo devuelve. Con `token`: la busca por `web_token` y proyecto; si no existe, 404.
- Guarda el mensaje del comprador, arma la historia desde `wa_mensajes` de esa conversación (mismos límites de historial que el bot) y corre `responderTurno` con la ficha del proyecto y un system con instrucciones del canal web.
- Guarda las respuestas del bot como mensajes salientes (texto e imágenes).
- Respuesta: `{ token, partes: string[], imagenes: string[] }`, o `{ token, partes: [], error: '…' }` si el turno no respondió.
- `GET /api/chat/[slug]?token=…` devuelve la charla guardada, para retomarla al recargar o cambiar de página.

### Herramientas en el canal web

Las mismas de `HERRAMIENTAS`, con estas diferencias, resueltas con el `DepsHerramientas` del canal y una variante de esquema para web:

- `enviar_imagenes` / `enviar_material`: las URLs se devuelven en la respuesta y se muestran en el chat (las rutas relativas del sitio se resuelven contra la URL pública).
- `avisar_vendedor`: en web suma el campo `telefono` (nullable). Hace falta teléfono o email; si no hay ninguno, la herramienta responde que falta el contacto y la IA lo pide. Con contacto, crea o actualiza el lead del proyecto (dedupe por teléfono como el bot, o por email), con `source 'chat_web'`, `visitor_id`, `ref`, calificación y `wa_conversacion_id`, y encola el aviso al `vendedor_whatsapp` (sale cuando el puente está conectado). Idempotente igual que en WhatsApp.
- `agendar_visita`: requiere que ya haya contacto (lead); si no, responde que falta el contacto.
- `anotar_pregunta`, `buscar_unidades`, `ver_unidad`, `ver_horarios_visita`, `cancelar_visita`: igual.

El system del canal web agrega: que habla en el chat del sitio del proyecto, que no conoce el teléfono del comprador, que antes de avisar o agendar pida nombre y teléfono (o email), y que no le pida que escriba por WhatsApp salvo que el comprador lo prefiera.

### Límites (costo)

- Por IP: 20 mensajes cada 10 minutos (`rateLimitOrRespond`).
- Por charla: 40 mensajes del comprador; después, el chat ofrece dejar el contacto o seguir por WhatsApp si hay número.
- Por proyecto: 300 turnos del chat web por día; al pasarlo, el chat dice que en este momento no puede responder y ofrece el formulario de contacto.
- Mensaje de hasta 1000 caracteres.
- El uso se registra con `registrarUsoIa` y `origen 'web'`.

### Sitio

- Burbuja abajo a la derecha en el layout del proyecto (`app/proyecto/[slug]/layout.tsx`), solo si `public_project_chat` devolvió algo. Se carga diferida (no suma al primer render).
- Al abrir: saludo con el nombre del bot y dos o tres sugerencias ("¿Qué unidades hay disponibles?", "¿Tienen planes de pago?", "Quiero agendar una visita").
- Escritorio: panel flotante de ~380×560. Celular: hoja a pantalla completa con botón de cerrar.
- El token de la charla se guarda en `localStorage` por proyecto; al volver se retoma con el GET.
- Mientras espera: indicador "escribiendo…"; si falla: mensaje de error y reintentar.
- Manda `visitorId` y `ref` de `readAttribution()` en cada mensaje.
- Evento de analítica `chat` (nuevo tipo en `TRACK_TYPES` y en el check de `site_events`) al mandar el primer mensaje de una charla. Un comprador que deja contacto por el chat cuenta como "consultó" vía el lead con `visitor_id`.
- No convive con la burbuja en las páginas de recorrido 360 a pantalla completa si tapa controles: el constructor revisa esas páginas.

### Panel

- Pestaña del bot (administrador o más): interruptor "Chat en el sitio" con una línea de explicación y el aviso de que usa la configuración del bot y gasta como el bot.
- Conversaciones: las charlas web aparecen en la lista con la marca "Web". No tienen caja de respuesta; en su lugar, "Esta charla fue en el sitio. Seguí por WhatsApp o teléfono con los datos del lead" y el link al lead si hay.
- Métricas del bot: el costo del chat web aparece separado (origen 'web').

### Relación con el lado de WhatsApp

- El chat web es independiente de WhatsApp: no hace falta tener el WhatsApp vinculado ni conectado, y pausar el bot de WhatsApp (`activo`) no apaga el chat web. Su único interruptor es `chat_web`. `public_project_chat` pide proyecto publicado, fila en `wa_bots` y `chat_web`; no mira `estado`.
- Aviso al vendedor desde el chat web:
  - si el bot está `conectado` y hay `vendedor_whatsapp`, se encola en `wa_salida` como hoy;
  - si no, no se encola (un aviso que sale días después confunde) y queda el email de "nuevo lead" (`emailNuevoLead`, si Resend está configurado) más el lead en el panel.
- El interruptor no bloquea: si no hay `vendedor_whatsapp` ni conexión, avisa al lado del interruptor que los avisos llegarán solo por email y al panel.

### Lead: crear o actualizar

- Se busca un lead del proyecto por teléfono (normalizado, como el bot) y, si no hay teléfono o no aparece, por email (sin mayúsculas ni espacios).
- Si no existe: se crea con `source 'chat_web'`, nombre, teléfono, email, `unit_name` de las unidades de interés, mensaje con el resumen, calificación, `visitor_id`, `ref` y `wa_conversacion_id` de la charla web.
- Si existe (puede venir de WhatsApp, del formulario o cargado a mano): solo se completan los campos vacíos. Nunca se pisan `source`, `ref` ni `visitor_id`, porque la atribución es del primer contacto, como en la analítica. `wa_conversacion_id` solo se completa si está vacío, así "Ver chat" de un lead de WhatsApp sigue abriendo WhatsApp. La calificación se actualiza como hoy (`actualizarCalificacion`). Al mensaje se le suma una nota "[Chat web DD/MM]" con el resumen.
- Es una función de mezcla propia del canal web, pura y testeada, al lado de `planearLead`.

### Métricas y no leídos

- Las métricas del bot (`app/api/admin/whatsapp-bot/metricas`) siguen siendo de WhatsApp: filtran `canal = 'whatsapp'`. Se suma un bloque "Chat en el sitio" con las charlas web, cuántas dejaron contacto (leads con `source 'chat_web'`) y el costo (`origen 'web'`), en el mismo período.
- Las charlas web no suman a `no_leidos` ni al contador de la pestaña Conversaciones: nadie puede contestarlas. Lo que importa de ellas, el contacto, llega como lead (con email al equipo). La API web actualiza `ultimo_mensaje` y `ultimo_mensaje_at` para que la lista las ordene bien.
- En Conversaciones hay un filtro "Web" además de los que ya existen; los filtros `sin_leer`, `bot` y `vendedor` no incluyen charlas web.

### Puente de WhatsApp

Todo lo que el puente hace sobre conversaciones (seguimiento automático, re-aviso, envíos, `no_leidos`, búsqueda por número) filtra `canal = 'whatsapp'`.

## Llamadas mías (corregibles)

- Los límites numéricos de arriba.
- Sin chat en borradores.
- Las sugerencias del saludo.
- La charla se retoma en el mismo navegador durante 30 días; después empieza una nueva.
- El chat no pide email obligatorio: alcanza con teléfono o email.
- Chat web independiente del WhatsApp: no requiere conexión, y pausar el bot de WhatsApp no lo apaga.
- Sin conexión de WhatsApp el aviso no se encola: va por email y queda en el panel.
- En un lead que ya existe, el chat solo completa vacíos y nunca pisa la atribución (origen, inmobiliaria, visitante).
- Métricas del bot solo de WhatsApp, más un bloque aparte del chat web; las charlas web no cuentan como no leídas.

## Lo que queda al constructor

- Diseño visual exacto de la burbuja y el panel (siguiendo el tema del proyecto, como el resto del sitio).
- Cómo reutilizar `simularTurno` / `turno-bot` sin duplicar: extraer lo común en una función de canal.
- Cuántos mensajes de historia se mandan a la IA.
- Dónde exactamente va el interruptor dentro de la pestaña del bot.
