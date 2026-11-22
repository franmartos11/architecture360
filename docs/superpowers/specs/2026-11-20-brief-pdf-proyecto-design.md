# Brief PDF por proyecto — diseño

Fecha: 2026-11-20 · Estado: aprobado

## Para qué

Cada proyecto puede tener un PDF "brief" con sus datos, pensado para el cliente. Es material de captación y le llega por dos vías:

1. **Formulario de contacto → WhatsApp → bot de IA.** El cliente deja sus datos y después recibe el brief por WhatsApp; a partir de ahí lo atiende el bot del proyecto.
2. **Descarga en la web**, libre.

## Objetivos

- Cargar/reemplazar/quitar el PDF desde el admin del proyecto.
- Botón de descarga en la página pública cuando hay brief.
- Después de enviar el formulario de contacto, llevar al cliente a WhatsApp con un mensaje prellenado para pedir el brief; el bot lo manda y sigue la charla.
- El bot sabe que el brief existe, lo manda cuando se lo piden y puede ofrecerlo.

## No-objetivos

- Que el bot le escriba primero a un número cargado en el formulario (el número está vinculado por QR, no por la API oficial: riesgo de bloqueo y de abuso con números ajenos; la spec del bot y el trigger `wa_conversaciones_guard_panel` lo excluyen a propósito).
- Pedir datos antes de permitir la descarga.
- Generar el PDF automáticamente desde los datos del proyecto.
- Agregar el brief a `LeadCaptureModal` (modal de contacto de unidades).

## Enfoques considerados

- **A — El cliente escribe primero (elegido).** Tras enviar el formulario se muestra un botón `wa.me` con "Hola, soy {nombre}, quiero el brief de {proyecto}". El cliente toca enviar y el bot responde con el PDF. Un toque más, sin riesgo de bloqueo; el lead del formulario se vincula a la conversación por teléfono con la lógica existente de `avisar_vendedor`.
- **B — El bot escribe primero.** Cero toques, pero exige abrir la protección anti-saliente, normalizar el teléfono (hoy texto libre) y asumir riesgo de bloqueo del número. Descartado.

## Diseño

**Datos.** `alter table projects add column if not exists brief_pdf_url text;` en `supabase/schema.sql` (hay que correrlo a mano en la Supabase de producción). Se agrega a `ProjectRow` (`types/database.ts`), `Project.briefPdfUrl?` (`types/index.ts`) y `mapProject` (`data/project-repository.ts`).

**API.** `PATCH /api/admin/project` acepta `briefPdfUrl: string | null` (misma regla de permisos que `masterplanImage`). La subida usa la ruta existente `/api/admin/upload` (ya admite `application/pdf`), bucket `project-media`.

**Admin.** En Ficha › Esencial (`/admin/proyecto`) una sección "Brief del proyecto" con un `PdfUploader` nuevo (patrón de `VideoUploader`): `accept="application/pdf"`, tope **16 MB** en el cliente (límite de adjuntos del bot), muestra nombre del archivo, "Ver" y "Quitar". Se guarda con `useFichaProject` / `UnsavedBar` (agregar a `FichaProject` y `PATCH_KEY`).

**Ciclo de vida.** Duplicar proyecto copia `brief_pdf_url`; borrar proyecto incluye el PDF en `delete-project-storage.ts`.

**Web pública.**
- Botón "Descargar brief" en `ContactSection` y en el menú del proyecto (`ProjectMenu`), solo si hay brief. Abre el PDF en pestaña nueva.
- `HomeContactForm`: el POST a `/api/leads` no cambia. En la pantalla de éxito, si hay brief y el bot está conectado (`useProjectWhatsapp()`), botón "Recibir el brief por WhatsApp" → `wa.me/{numero}?text=Hola, soy {nombre}, quiero el brief de {proyecto}`. Si hay brief pero no bot, "Descargar brief". Sin brief, la pantalla queda como hoy.

**Bot.** `enviar_material` suma `que: 'brief'` (manda el PDF del proyecto como documento). La ficha que arma `armarFicha` lista el brief en el material disponible; el prompt indica mandarlo cuando lo pidan y que puede ofrecerlo. El envío de PDFs ya está soportado por el puente (`url-segura.ts`, `MessageMedia`).

## Llamadas mías (corregibles)

- Descarga libre, sin pedir datos.
- Ubicación: Contacto + menú del proyecto (no en el hero).
- Tope de 16 MB para que el bot siempre pueda mandarlo.
- El bot decide con IA cuándo mandarlo (no hay detección fija del texto prellenado).

## Para quien lo construya

Textos exactos de botones, ícono, y si el bot acompaña el PDF con una frase.
