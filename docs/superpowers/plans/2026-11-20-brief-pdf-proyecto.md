# Brief PDF por proyecto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada proyecto puede tener un PDF "brief" que se descarga desde la web pública y que el bot de WhatsApp manda cuando el cliente lo pide (al que se llega desde el formulario de contacto).

**Architecture:** Una columna `projects.brief_pdf_url` (URL pública en el bucket `project-media`), cargada desde Ficha › Esencial con un uploader de PDF. La web la lee vía `Project.briefPdfUrl`; el bot la recibe en `MaterialProyecto.brief` y la manda con `enviar_material { que: 'brief' }`.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + Storage), zod, Vitest, whatsapp-web.js.

**Spec:** `docs/superpowers/specs/2026-11-20-brief-pdf-proyecto-design.md`

## Global Constraints

- Trabajar en `main` de `my-app`, sin worktrees ni ramas. **No commitear**: el usuario commitea cuando lo pide (los pasos de commit de este plan quedan en "no commitear").
- Tope del PDF: **16 MB** (límite de adjuntos del bot, `ADJUNTO_TOPE_BYTES` en `lib/whatsapp-bot/puente/url-segura.ts`). Solo `application/pdf`.
- El bot NUNCA escribe primero: no tocar `wa_conversaciones_guard_panel` ni la lógica de salientes.
- Descarga web libre (sin pedir datos).
- Copy fijo: botón web "Descargar brief"; botón post-formulario "Recibir el brief por WhatsApp"; mensaje prellenado `Hola, soy {nombre}, quiero el brief de {proyecto}`.
- Hay cambios del bot sin commitear en `lib/whatsapp-bot/**` (incl. `material.ts` nuevo): construir encima, no revertir nada.
- No usar el navegador para subir/editar en el admin: los datos van a la Supabase compartida (prod). Verificación de UI = typecheck + lint + vista pública en local.

## Review Focus

1. **Proyecto sin brief** → ningún botón de brief en Contacto, menú ni pantalla de éxito; el bot no ofrece brief y `enviar_material {que:'brief'}` devuelve error claro. (Tests en Task 4 y 5.)
2. **Nombre con espacios/acentos/comillas en el mensaje prellenado** (`José "Pepe"`, `Torre Ñandú`) → el link `wa.me` queda bien codificado. (Test en Task 4.)
3. **PDF de más de 16 MB o un .docx** → el admin lo rechaza antes de subir con un mensaje en castellano. (Test en Task 3.)
4. **Nombre de archivo raro al subir** (`Brief Final (v2) ÑANDÚ.PDF`, nombre vacío) → el path termina en un nombre legible y seguro, con fallback `documento.pdf`. (Test en Task 2.)
5. **Quitar el brief** (PATCH con `briefPdfUrl: null`) → guarda `null` y no 400. (Test en Task 1.)

---

### Task 1: Columna, tipos, PATCH, duplicar y borrar

**Files:**
- Modify: `supabase/schema.sql` (después de la línea 422, `theme_config`)
- Modify: `types/database.ts` (`ProjectRow`, líneas ~9-41)
- Modify: `types/index.ts` (`Project`, líneas ~526-574)
- Modify: `data/project-repository.ts` (`mapProject`, return ~203-235)
- Modify: `app/api/admin/project/route.ts` (zod ~21-57, mapeo ~166-234)
- Modify: `app/api/admin/projects/[id]/duplicate/route.ts` (~47)
- Modify: `lib/supabase/delete-project-storage.ts` (~41-45)
- Test: `app/api/admin/project/route.test.ts`, `app/api/admin/projects/[id]/duplicate/route.test.ts`, `lib/supabase/delete-project-storage.test.ts`

**Interfaces:**
- Produces: columna `projects.brief_pdf_url text null`; `ProjectRow.brief_pdf_url: string | null`; `Project.briefPdfUrl?: string`; body del PATCH `briefPdfUrl?: string | null` (`z.string().max(1000).nullable().optional()`).

- [ ] **Step 1: Tests que fallan**
  - `route.test.ts` (describe PATCH): `it('briefPdfUrl: guarda la url y null para quitarla')` → PATCH `{ briefPdfUrl: 'https://x/brief.pdf' }` hace `update` con `{ brief_pdf_url: 'https://x/brief.pdf', ... }`; PATCH `{ briefPdfUrl: null }` → 200 y `update` con `brief_pdf_url: null`. Seguir el patrón de mocks de `'actualización simple (sin cambiar saleMode)…'`.
  - `duplicate/route.test.ts`: `it('copia el brief del proyecto de origen')` → el `insert` de `projects` incluye `brief_pdf_url: source.brief_pdf_url`.
  - `delete-project-storage.test.ts`: en `'junta URLs de todas las tablas…'` agregar `brief_pdf_url: \`${BASE_URL}/brief/1-a/brief.pdf\`` a la fila del proyecto y esperar la key `brief/1-a/brief.pdf` en `storage.remove`.
- [ ] **Step 2:** `pnpm exec vitest run app/api/admin/project app/api/admin/projects lib/supabase/delete-project-storage.test.ts` → FAIL en los 3 casos nuevos.
- [ ] **Step 3: Implementar**
  - schema: `alter table projects add column if not exists brief_pdf_url text;` con comentario de una línea.
  - Tipos y `mapProject`: `briefPdfUrl: project.brief_pdf_url ?? undefined`.
  - PATCH: campo zod + `if (body.briefPdfUrl !== undefined) updates.brief_pdf_url = body.briefPdfUrl;` con el mismo permiso que `masterplanImage`.
  - duplicate: `brief_pdf_url: source.brief_pdf_url,`.
  - delete-storage: sumar `brief_pdf_url` al select y `urls.push(project.brief_pdf_url)`.
- [ ] **Step 4:** mismo comando → PASS. `pnpm exec tsc --noEmit` → sin errores (si `data/mockData.ts` u otro literal de `ProjectRow` rompe, agregar `brief_pdf_url: null`).
- [ ] **Step 5:** No commitear. Avisar al usuario que debe correr en la Supabase de prod: `alter table projects add column if not exists brief_pdf_url text;`

### Task 2: Nombre legible para documentos subidos

Hoy el path es `{folder}/{timestamp}-{rand}.{ext}` y WhatsApp muestra ese nombre al cliente (`nombreDeArchivo` en `url-segura.ts` usa el último segmento de la URL).

**Files:**
- Modify: `app/api/admin/upload/route.ts` (~56-58)
- Test: `app/api/admin/upload/route.test.ts`

**Interfaces:**
- Produces: para `isDocument`, path `{safeFolder}/{timestamp}-{rand}/{base}.pdf`, donde `base` = nombre sin extensión → NFD sin diacríticos, minúsculas, todo lo que no sea `[a-z0-9]` → `-`, sin guiones repetidos ni en los bordes, máx. 60; vacío → `documento`. Imágenes/video/audio: sin cambios.

- [ ] **Step 1:** `it('documento: conserva un nombre legible en el path')` → `name: 'Brief Final (v2) ÑANDÚ.PDF', type: 'application/pdf', folder: 'brief'` → `path` matchea `/^brief\/\d+-[a-z0-9]+\/brief-final-v2-nandu\.pdf$/`; `name: '¿?.pdf'` → termina en `/documento.pdf`. Un caso de imagen existente debe seguir matcheando el formato viejo.
- [ ] **Step 2:** `pnpm exec vitest run app/api/admin/upload` → FAIL.
- [ ] **Step 3:** Implementar en la ruta (helper local `documentBaseName(name: string): string`).
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5:** No commitear.

### Task 3: Admin — subir el brief en Ficha › Esencial

**Files:**
- Create: `lib/brief.ts` (helpers puros compartidos por Task 3 y 4)
- Create: `lib/brief.test.ts`
- Create: `components/admin/PdfUploader.tsx`
- Modify: `components/admin/section-editors/ficha-data.tsx` (`FichaProject` ~15-19, `PATCH_KEY` ~39-55)
- Modify: `app/admin/(authenticated)/(project)/proyecto/page.tsx` (nueva `SectionRow` después de "Cifras clave", ~293)

**Interfaces:**
- Consumes: `brief_pdf_url` / `briefPdfUrl` de Task 1; path legible de Task 2.
- Produces:
  - `export const BRIEF_MAX_BYTES = 16 * 1024 * 1024;`
  - `export function pdfFileError(file: { type: string; size: number }): string | null` — `null` si es PDF ≤ 16 MB; si no, `'Tiene que ser un PDF.'` o `'El PDF pesa más de 16 MB y no se podría mandar por WhatsApp.'`
  - `export function fileNameFromUrl(url: string): string` — último segmento decodificado (para mostrar en el admin), `'brief.pdf'` si no hay.
  - `<PdfUploader value: string; onChange(url: string): void; folder: string; label?: string; onUploadingChange?(b: boolean): void />`

- [ ] **Step 1:** `lib/brief.test.ts`: `pdfFileError` → `{type:'application/pdf', size: 16*1024*1024}` → null; `size: 16*1024*1024+1` → mensaje de 16 MB; `{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}` → `'Tiene que ser un PDF.'`. `fileNameFromUrl('https://x/brief/1-a/brief-torre-sol.pdf')` → `'brief-torre-sol.pdf'`; `fileNameFromUrl('https://x/')` → `'brief.pdf'`.
- [ ] **Step 2:** `pnpm exec vitest run lib/brief.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `lib/brief.ts`.
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5:** `PdfUploader`: copia del patrón de `VideoUploader` (drag&drop, `uploadViaSignedUrl('/api/admin/upload', file, { folder })`), `accept="application/pdf"`, valida con `pdfFileError` antes de subir. Sin campo "pegá una URL". Con valor: ícono de documento + `fileNameFromUrl(value)` + link "Ver" (`target="_blank"`) + botón "Quitar" (`onChange('')`). Texto del drop: `Arrastrá un PDF o hacé click para elegirlo (hasta 16 MB)`.
- [ ] **Step 6:** `ficha-data.tsx`: sumar `'brief_pdf_url'` a `FichaProject` y `brief_pdf_url: 'briefPdfUrl'` a `PATCH_KEY`. En la página: `SectionRow title="Brief del proyecto" description="Un PDF con los datos del proyecto para el cliente. Se descarga desde el sitio y el bot de WhatsApp lo manda cuando se lo piden."` con `<PdfUploader folder="brief" value={project.brief_pdf_url ?? ''} onChange={url => setProject({ ...project, brief_pdf_url: url || null })} />`. Sumar `'Brief'` a la lista "Secciones que alimenta este capítulo".
- [ ] **Step 7:** `pnpm exec tsc --noEmit && pnpm lint` → sin errores.
- [ ] **Step 8:** No commitear.

### Task 4: Web pública — descarga y paso a WhatsApp

**Files:**
- Modify: `lib/brief.ts`, `lib/brief.test.ts`
- Modify: `components/project-landing/ContactSection.tsx`
- Modify: `components/HomeContactForm.tsx`
- Modify: `lib/project-nav.ts` (`ProjectNavInfo`)
- Modify: `app/proyecto/[slug]/layout.tsx` (props de `ProjectChrome`, ~79-108)
- Modify: `components/ui/ProjectMenu.tsx` (`ProjectMenuOverlay`, bloque de `info.showLeads` ~217)

**Interfaces:**
- Consumes: `Project.briefPdfUrl` (Task 1); `useProjectWhatsapp(): string | null` (`lib/project-whatsapp-context.tsx`, solo dígitos o null).
- Produces:
  - `export function briefWhatsappHref(numero: string, nombre: string, proyecto: string): string` → `https://wa.me/{solo dígitos}?text={encodeURIComponent(texto)}`; texto = `Hola, soy {nombre}, quiero el brief de {proyecto}` con `nombre.trim()`; si el nombre queda vacío, `Hola, quiero el brief de {proyecto}`.
  - `ProjectNavInfo.briefUrl?: string`
  - `HomeContactForm` props: `{ projectSlug: string; projectName: string; briefUrl?: string }`

- [ ] **Step 1:** Tests en `lib/brief.test.ts`: `briefWhatsappHref('+54 9 11 5555-0000', 'José "Pepe"', 'Torre Ñandú')` → empieza con `https://wa.me/5491155550000?text=` y `decodeURIComponent` del query = `Hola, soy José "Pepe", quiero el brief de Torre Ñandú`; con nombre `'  '` → `Hola, quiero el brief de Torre Ñandú`.
- [ ] **Step 2:** `pnpm exec vitest run lib/brief.test.ts` → FAIL; implementar; → PASS.
- [ ] **Step 3:** `ContactSection`: si `project.briefPdfUrl`, debajo del párrafo un link `Descargar brief` (`href={project.briefPdfUrl} target="_blank" rel="noopener noreferrer"`, estilo outline sobre oscuro con las variables `--theme-text-on-dark*`, ícono de descarga). Pasar `projectName={project.name} briefUrl={project.briefPdfUrl}` a `HomeContactForm`.
- [ ] **Step 4:** `HomeContactForm`: guardar el `name` enviado antes de limpiar el estado. En la pantalla de éxito, si `briefUrl`: con `numero = useProjectWhatsapp()` → botón link `Recibir el brief por WhatsApp` a `briefWhatsappHref(numero, nombreEnviado, projectName)` (`target="_blank"`); sin número → link `Descargar brief` a `briefUrl`. Sin `briefUrl`, la pantalla queda igual que hoy.
- [ ] **Step 5:** Menú: `briefUrl: project.briefPdfUrl` en las props de `ProjectChrome` del layout; en `ProjectMenuOverlay`, si `info.briefUrl`, un link `Descargar brief` (`target="_blank"`) arriba del bloque de Contactar, visible aunque `showLeads` sea false.
- [ ] **Step 6:** `pnpm exec tsc --noEmit && pnpm lint` → sin errores. Con el dev server (puerto 3000, ya corriendo desde `my-app`), abrir un proyecto público en modo lectura: sin brief no aparece ningún botón nuevo. (No subir archivos desde el admin en esta verificación.)
- [ ] **Step 7:** No commitear.

### Task 5: Bot — mandar y ofrecer el brief

**Files:**
- Modify: `lib/whatsapp-bot/material.ts`
- Modify: `lib/whatsapp-bot/ia/herramientas.ts` (definición ~89-110, `MaterialInput` ~148, `enviarMaterial` ~230)
- Modify: `lib/whatsapp-bot/ficha.ts` (~252-255)
- Modify: `lib/whatsapp-bot/ia/prompt.ts` (línea 41)
- Test: `lib/whatsapp-bot/material.test.ts`, `lib/whatsapp-bot/ia/herramientas.test.ts`, `lib/whatsapp-bot/ficha.test.ts`

**Interfaces:**
- Consumes: `ProjectRow.brief_pdf_url` (Task 1). `datos.proyecto` ya llega con `select('*')`.
- Produces: `MaterialProyecto.brief: string | null`; `TipoMaterial` incluye `'brief'`; `armarMaterial` recibe `proyecto: Pick<ProjectRow, 'masterplan_image' | 'brief_pdf_url'>`; `resumenMaterial` agrega `- brief: PDF con los datos del proyecto`; `elegirMaterial(m, 'brief', …)` → `{ urls: [m.brief], descripcion: 'el brief del proyecto (PDF)' }` o `{ error: 'No hay brief cargado en este proyecto.' }`.

- [ ] **Step 1: Tests que fallan**
  - `material.test.ts`: `armarMaterial` con `brief_pdf_url: ' https://x/b.pdf '` → `brief === 'https://x/b.pdf'`; con `'  '` o no-http → `null`.
  - `herramientas.test.ts` (describe `enviar_material…`): `enviar_material { que: 'brief', nombre: null }` con `material.brief` cargado → encola `['https://x/b.pdf']` y el texto contiene `brief`; con `brief: null` → `esError === true`. Actualizar el `deps()` base (línea ~37) con `brief: null`.
  - `ficha.test.ts`: con brief, el texto contiene `- brief:`; sin material sigue sin contener `enviar_material`.
- [ ] **Step 2:** `pnpm exec vitest run lib/whatsapp-bot` → FAIL en los nuevos.
- [ ] **Step 3: Implementar**
  - `material.ts` según Interfaces (mismo `esUrl` que masterplan).
  - Herramienta: agregar `'brief'` al `enum` del schema y a `MaterialInput`; descripción: `…fotos del avance de obra, o el brief del proyecto en PDF. …` (mantener "le llegan solas, no pegues links"). En `enviarMaterial`, si `que === 'brief'` el mensaje de ok dice `Listo: el brief del proyecto (PDF) ya va en camino al cliente por WhatsApp.`
  - `ficha.ts`: el título de la sección pasa a `## Material del proyecto para mandar con enviar_material`.
  - `prompt.ts` (después de la línea de Imágenes): `- Brief: si el cliente pide el brief, el PDF, un folleto o "más información" del proyecto y la ficha lista un brief, mandalo con enviar_material (que: brief) y seguí la charla. Si no lo pidió, ofrecelo una vez cuando ayude. No pegues el link.`
- [ ] **Step 4:** `pnpm exec vitest run lib/whatsapp-bot` → PASS. `pnpm exec tsc --noEmit` → sin errores (el script `scripts/whatsapp-bot.ts` también compila).
- [ ] **Step 5:** No commitear.

### Cierre

- [ ] `pnpm exec vitest run` completo → todo verde (reportar cualquier fallo con su salida).
- [ ] Recordarle al usuario: correr el `alter table` en prod; la prueba punta a punta del envío por WhatsApp queda para cuando el bot tenga chip (checklist de `ops/bot/README.md`).
