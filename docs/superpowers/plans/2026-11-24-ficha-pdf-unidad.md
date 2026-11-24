# Ficha PDF por unidad con QR — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón "Descargar ficha" en cada unidad que baja un PDF A4 armado en el servidor, con datos, precio con fecha, planes de pago y un QR a la unidad online que conserva el `?ref=` de la inmobiliaria.

**Architecture:** Una ruta `GET /api/ficha/[slug]/[unitId]` (uuid) carga el proyecto con el mismo loader del sitio, arma un modelo puro de contenido (`buildFichaContent`, que decide qué se muestra) y lo dibuja con `@react-pdf/renderer`. Las imágenes se descargan de hosts permitidos y se convierten a JPEG con `sharp`. La descarga se registra como evento de analítica `ficha` desde el botón.

**Tech Stack:** Next.js 16 App Router (route handler, runtime Node), React 19, `@react-pdf/renderer` ^4.9, `qrcode` ^1.5, `sharp` (nueva), zod 4, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md`

## Global Constraints

- Trabajar directo en `main` de my-app (sin worktrees ni ramas). **No commitear ni pushear**: el usuario lo pide al final. Los pasos "Checkpoint" solo corren tests.
- Textos visibles en español rioplatense, exactos donde el spec los fija:
  - "Descargar ficha"
  - "Precio al DD/MM/AAAA"
  - "Consultá el precio actual"
  - "Escaneá para ver la unidad en 3D, el recorrido 360° y el precio actualizado"
  - "Montos calculados al DD/MM/AAAA. Las cuotas se ajustan según el índice indicado."
  - "Precios, disponibilidad y planes sujetos a cambios sin previo aviso. Imágenes ilustrativas."
  - "Ficha generada el DD/MM/AAAA"
  - "Vista previa · proyecto sin publicar"
  - "Fichas descargadas desde el sitio"
- Fechas en zona `America/Argentina/Buenos_Aires`, formato `DD/MM/AAAA`.
- Imágenes: solo `https` y hosts `*.supabase.co` o `images.unsplash.com`; timeout 8 s; máximo 15 MB; JPEG calidad 80, lado mayor ≤ 1600 px sin agrandar, fondo blanco, rotación EXIF.
- La ficha nunca muestra lo que el sitio oculta: precio solo con `typeConfig.showPrice` y precio > 0; estado solo con `showStatus`; planes solo si se muestra el precio y `showUnitCalculator(...)`.
- SQL: se agrega a `supabase/schema.sql` y se le pasa al usuario como sentencias sueltas (copiar de una vista previa de Markdown le agregó `\` y falló).
- Tests de componentes: `// @vitest-environment jsdom` en el archivo; sin matchers de jest-dom (usar `getAttribute`/`textContent`).
- Next no permite exports que no sean handlers en `route.tsx`: los helpers van en `lib/ficha/`.

## Review Focus

1. **Imagen rota, lenta, gigante o de host ajeno.** La ficha tiene que salir igual, sin esa imagen. Tests: Task 1, `loadPdfImage` devuelve null; Task 4, la ruta responde 200 aunque todas las imágenes fallen.
2. **Proyecto "solo para mostrar" o unidad sin precio.** No aparecen precio, planes ni montos. Tests: Task 3.
3. **Ref con caracteres raros o muy largo, y código de unidad con caracteres especiales en la URL del QR.** Se normaliza y codifica. Tests: Task 3, `qrUrl`.
4. **Borrador pedido sin sesión, uuid inexistente o unidad de otro proyecto.** Responde 404 y nunca muestra datos ajenos. Tests: Task 4.
5. **Muchos planes (6) o nombres largos.** No se rompe el render; puede pasar a una segunda hoja. Test: Task 4 renderiza con 6 planes y responde `%PDF`.

---

### Task 1: `sharp` + carga de imágenes para el PDF

**Files:**
- Modify: `package.json` (`npm install sharp`)
- Create: `lib/ficha/images.ts`
- Test: `lib/ficha/images.test.ts`

**Interfaces:**
- Produces: `loadPdfImage(url: string | undefined | null, fetchImpl?: typeof fetch): Promise<Buffer | null>` (JPEG o null) y `isAllowedImageUrl(url: string): boolean`.

- [ ] **Step 1: Instalar sharp.** Run: `npm install sharp`. Expected: `sharp` en `dependencies`.
- [ ] **Step 2: Tests que fallan** (`lib/ficha/images.test.ts`, entorno node; los buffers de prueba se generan con `sharp({ create: { width: 40, height: 20, channels: 4, background: '#f00' } }).webp().toBuffer()`):
  - `isAllowedImageUrl`: true para `https://abc.supabase.co/storage/v1/object/public/x.webp` y `https://images.unsplash.com/p.jpg`; false para `http://abc.supabase.co/x.png`, `https://evil.com/x.png`, `https://supabase.co.evil.com/x.png`, `https://169.254.169.254/`, `not a url`.
  - Host no permitido → `null` y el `fetchImpl` mock no se llama.
  - `undefined` / `''` → `null`.
  - WebP válido → buffer que empieza con `0xFF 0xD8` (JPEG).
  - SVG (`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>`, content-type `image/svg+xml`) → JPEG.
  - Imagen de 3000×1000 → `sharp(result).metadata()` da `width` 1600; imagen de 40×20 queda 40×20.
  - Respuesta 404 → `null`.
  - `content-length` de 16 MB → `null` sin leer el cuerpo.
  - Cuerpo sin `content-length` que supera 15 MB → `null`.
  - `fetchImpl` que rechaza (AbortError) → `null`.
  - Bytes que no son imagen → `null`.
  - En todos los casos de `null` por error se llama `console.error` con un mensaje que empieza con `[ficha]` (mockear `console.error`). El de host no permitido no loguea.
- [ ] **Step 3: Run** `npx vitest run lib/ficha/images.test.ts`. Expected: FAIL (módulo inexistente).
- [ ] **Step 4: Implementar `lib/ficha/images.ts`.**
  - `AbortSignal.timeout(8000)` en el fetch.
  - Leer el cuerpo con `arrayBuffer()` después de chequear `content-length`, y volver a chequear el largo.
  - `sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer()`.
  - Todo envuelto en try/catch.
- [ ] **Step 5: Run** el mismo comando. Expected: PASS.

### Task 2: Lectura de planes de pago en el servidor

**Files:**
- Create: `lib/financing-server.ts`
- Modify: `app/api/settings/route.ts` (GET usa el helper; misma respuesta que hoy)
- Test: `lib/financing-server.test.ts`

**Interfaces:**
- Produces: `readFinancingPlans(supabase: SupabaseClient, projectId: string): Promise<FinancingPlan[]>`. Lee `calculator_settings.financing_plans` del proyecto, aplica `parseStoredPlans`, devuelve `[]` si no hay fila o hay error, y en ese caso loguea `[settings] no se pudo leer la calculadora`.

- [ ] **Step 1: Tests que fallan** con `mockSupabase` (`lib/test-helpers/supabase-mock.ts`):
  - Fila con 2 planes válidos y 1 inválido → devuelve los 2.
  - Sin fila → `[]`.
  - Error de la base → `[]` y `console.error` llamado.
- [ ] **Step 2: Run** `npx vitest run lib/financing-server.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Si el GET de `/api/settings` puede reutilizarlo sin cambiar su respuesta (sigue leyendo las otras columnas), dejar que lea `financing_plans` con el mismo `parseStoredPlans`. No duplicar el parseo. Si reutilizarlo obliga a hacer dos consultas, el GET queda como está: Ruling.
- [ ] **Step 4: Run** `npx vitest run lib/financing-server.test.ts app/api/settings`. Expected: PASS (los tests existentes de settings siguen verdes).

### Task 3: Modelo de contenido de la ficha (puro)

**Files:**
- Create: `lib/ficha/content.ts`
- Modify: `lib/resolve-theme.ts` (exportar `contrastRatio`)
- Test: `lib/ficha/content.test.ts`

**Interfaces:**
- Consumes: `computePlan`, `describePlan`, `boostsLabel`, `INDEX_LABEL`, `showUnitCalculator` (`lib/financing`); `formatPrice`, `getStatusLabel`, `unitIsDwelling`, `unitCategory`, `UNIT_CATEGORY_LABEL`, `cocheraLabel`, `unitConditionLabel` (`lib/units`); `normalizeRef` (`lib/analytics/ref`); `getPreset` (`lib/theme-presets`); `contrastRatio` (`lib/resolve-theme`).
- Produces:

```ts
export interface FichaInput {
  project: Project;            // del loader del sitio
  unit: Unit;
  buildingName: string;
  typeConfig: ProjectTypeConfig;
  plans: FinancingPlan[];
  unitUrl: string;             // projectCanonical(slug, '/edificio/<b>/unidad/<código codificado>')
  ref: string | null;          // crudo de la query
  isDraft: boolean;
  now: Date;
}
export interface FichaPlanRow { name: string; planPrice: string | null; lines: string[]; indexNote: string | null; note: string | null }
export interface FichaContent {
  projectName: string; location: string;
  unitName: string; status: { label: string; color: string } | null;
  subtitle: string | null;
  specs: string[];
  price: { label: string; amount: string } | null;   // label "Precio al 24/11/2026"
  askPrice: boolean;                                   // "Consultá el precio actual"
  plans: FichaPlanRow[]; plansNote: string | null;
  qrUrl: string;
  whatsapp: { label: string; href: string } | null;
  accent: string;
  draft: boolean;
  generatedOn: string;                                 // "24/11/2026"
  imageUrls: { hero: string | null; plan: string | null };
}
export function buildFichaContent(input: FichaInput): FichaContent;
export function fichaDate(now: Date): string;          // DD/MM/AAAA en hora AR
export function fichaFileName(projectName: string, unitName: string): string; // "ficha-<slug>-<slug>.pdf"
export function unitSpecLines(unit: Unit, o: { unitIsLand: boolean; hasUnitStep: boolean; hasFloorStep: boolean; buildingName: string }): string[];
```

- [ ] **Step 1: Tests que fallan** (`lib/ficha/content.test.ts`), con un `Project`/`Unit` de fixture mínimo y `typeConfig = getProjectTypeConfig(...)` real:
  - `fichaDate(new Date('2026-11-25T02:30:00Z'))` → `'24/11/2026'` (todavía es 24 en Argentina).
  - Con `showPrice` y precio 145000 USD → `price` = `{ label: 'Precio al 24/11/2026', amount: formatPrice(145000,'USD') }` y `askPrice` false.
  - Con `showPrice` false (tipo/propósito "solo para mostrar") → `price` null, `plans` vacío, aunque haya planes.
  - Sin precio y `showLeads` → `price` null, `askPrice` true, `plans` vacío.
  - Con un plan 30% + 36 cuotas (40%) + 3 refuerzos semestrales (15%) + CAC sobre 100000:
    - `lines` incluye `'Anticipo ' + formatPrice(30000,'USD')`, `'36 cuotas de ' + formatPrice(1111,'USD')`, `'3 refuerzos semestrales de ' + formatPrice(5000,'USD')` y `'Saldo a la posesión ' + formatPrice(15000,'USD')`;
    - `indexNote` = `'Cuotas ajustables por CAC'`;
    - `plansNote` = `'Montos calculados al 24/11/2026. Las cuotas se ajustan según el índice indicado.'`.
  - Plan con −10%: `planPrice` = `formatPrice(90000,'USD')`. Sin ajuste: `planPrice` null.
  - Lote con planes: `showUnitCalculator` con `unitIsLand` true y `plansCount` > 0 → muestra planes. Lote sin planes → no.
  - `showStatus` false → `status` null. Si es true y la unidad está vendida → `status.label === getStatusLabel('sold')`.
  - Subtítulo: vivienda → `modelName`; local → `UNIT_CATEGORY_LABEL.local`; lote → null.
  - `unitSpecLines`:
    - lote → empieza con `'Superficie 300 m²'` y no incluye "Área interna";
    - departamento → incluye `'Área total 106 m²'` y `'2 Dormitorios'`;
    - con `hasFloorStep` incluye `'Piso 3 · Torre A'`;
    - con balcón 0 no incluye "balcones";
    - `orientation: 'NE'` → `'Orientación NE'`.
  - `qrUrl`:
    - ref `'Inmo Sur!'` → `unitUrl + '?ref=inmo-sur'`;
    - ref `''` o null → `unitUrl` sin query;
    - ref de 200 caracteres → recortado por `normalizeRef` (≤ 60).
  - `whatsapp`: `project.whatsappNumber = '5491122334455'` → `{ label: '+5491122334455', href: 'https://wa.me/5491122334455' }`; sin número → null.
  - `accent`: preset con acento oscuro → ese color. `customColors.accent = '#f5f5f5'` (contraste < 3 contra blanco) → `'#1c1a17'`.
  - `imageUrls`:
    - hero = `interiorImageUrl`, si no `galleryImages[0]`, si no `floorPlan3dUrl`;
    - plan = `technicalPlanUrl`, si no `plan3dUrl`, si no `roomPlanImage`;
    - null si no hay ninguna.
  - `fichaFileName('Torre Sol', 'N01-07')` → `'ficha-torre-sol-n01-07.pdf'` (usar `slugify` de `lib/slug`).
  - `isDraft` true → `draft` true.
- [ ] **Step 2: Run** `npx vitest run lib/ficha/content.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** `lib/ficha/content.ts`.
  - `unitSpecLines` sigue las filas de `components/unit/UnitViewer.tsx:760-778` (mismas etiquetas y condiciones), con dos diferencias:
    - dormitorios y baños se muestran siempre en viviendas, aunque haya programa de ambientes;
    - se antepone la línea de piso/edificio cuando `hasFloorStep`.
  - `UnitViewer` no se toca. Ruling si hace falta.
  - Fecha: `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' })`.
  - Acento: `({ ...getPreset(themeConfig?.presetKey).tokens, ...themeConfig?.customColors }).accent`. Si `contrastRatio(accent, '#ffffff') < 3`, va `'#1c1a17'`.
- [ ] **Step 4: Run** el mismo comando. Expected: PASS.

### Task 4: Documento PDF y ruta `/api/ficha/[slug]/[unitId]`

**Files:**
- Create: `lib/ficha/FichaDocument.tsx`, `lib/ficha/qr.ts`, `app/api/ficha/[slug]/[unitId]/route.tsx`
- Test: `app/api/ficha/[slug]/[unitId]/route.test.ts`, `lib/ficha/qr.test.ts`

**Interfaces:**
- Consumes: Task 1 `loadPdfImage`; Task 2 `readFinancingPlans`; Task 3 `buildFichaContent`, `fichaFileName`; `getSiteProject` (`data/project-repository`); `getProjectTypeConfig`; `projectCanonical`; `isUuid`; `createClient` (o el cliente público, el que use el GET de settings para lectura anónima).
- Produces:
  - `qrPng(url: string): Promise<Buffer>` (`QRCode.toBuffer(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' })`);
  - `FichaDocument(props: { content: FichaContent; images: { hero: Buffer | null; plan: Buffer | null }; qr: Buffer })`;
  - `GET(req, { params: Promise<{ slug: string; unitId: string }> })`.

- [ ] **Step 1: Tests que fallan.**
  - `qr.test.ts`: `qrPng('https://x.com/a')` empieza con la firma PNG `89 50 4E 47`.
  - `route.test.ts` mockea `@/data/project-repository` (`getSiteProject`), `@/lib/ficha/images` (`loadPdfImage`), `@/lib/financing-server` (`readFinancingPlans`) y `@/lib/project-canonical` (`projectCanonical` → `'https://torre.atrium.app/edificio/b1/unidad/N01-07'`):
    - `unitId` `'N01-07'` (no uuid) → 404 sin llamar a `getSiteProject`;
    - `getSiteProject` → undefined → 404;
    - uuid que no es de ninguna unidad del proyecto → 404;
    - caso feliz:
      - 200;
      - `content-type` `application/pdf`;
      - `content-disposition` = `inline; filename="ficha-torre-sol-n01-07.pdf"`;
      - `cache-control` = `private, no-store`;
      - los primeros 4 bytes del cuerpo son `%PDF`;
    - `loadPdfImage` devuelve null para todo → igual 200 y `%PDF`;
    - 6 planes con nombres de 60 caracteres → 200 y `%PDF`;
    - `projectCanonical` llamado con `('torre-sol', '/edificio/b1/unidad/N01-07')`, con el código pasado por `encodeURIComponent`;
    - `readFinancingPlans` que lanza → 500 y `console.error` con `[ficha]`.
- [ ] **Step 2: Run** `npx vitest run "app/api/ficha" lib/ficha/qr.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `qr.ts` y `FichaDocument.tsx`** según la diagramación del spec.
  - Helvetica y Helvetica-Bold, A4 vertical, padding 36.
  - Franja de borrador arriba si `content.draft`.
  - Encabezado: proyecto y ubicación a la izquierda; unidad y estado a la derecha.
  - Imagen principal ancho completo (alto máx. ~260, `objectFit: 'cover'`).
  - Fila datos | plano: el plano con `objectFit: 'contain'`; sin plano, los datos ocupan todo.
  - Precio y planes (tabla compacta, `wrap` permitido).
  - Bloque QR (~90 pt) con texto, URL como `<Link>` y WhatsApp como `<Link>`.
  - Pie fijo (`fixed`) con el aviso legal y "Ficha generada el …".
  - Acento en el título, el precio y los nombres de plan.
  - Las imágenes van como `{ data: buffer, format: 'jpg' }` (el QR como `'png'`).
- [ ] **Step 4: Implementar la ruta.**
  - `export const runtime = 'nodejs'`.
  - Orden:
    1. `isUuid`;
    2. `getSiteProject(slug)`;
    3. unidad por `dbId`;
    4. edificio de la unidad;
    5. `typeConfig`;
    6. `readFinancingPlans` con el id del proyecto (usar el cliente con el que hoy se lee `calculator_settings` en el GET público de settings);
    7. `projectCanonical(slug, '/edificio/' + building.id + '/unidad/' + encodeURIComponent(unit.id))`;
    8. `buildFichaContent` con `ref = searchParams.get('ref')`, `isDraft = view.isDraftPreview` y `now = new Date()`;
    9. en paralelo, `loadPdfImage` de hero y plan más `qrPng(content.qrUrl)`;
    10. `renderToBuffer`.
  - Envolver los pasos 6 a 10 en try/catch → 500 `{ error: 'No se pudo generar la ficha' }` con `console.error('[ficha] …', err)`.
  - Respuesta: `new NextResponse(new Uint8Array(buf), { headers })`.
- [ ] **Step 5: Run** el mismo comando. Expected: PASS.
- [ ] **Step 6: Prueba real.**
  - Run: `npm run dev`.
  - Run: `curl -s -o /tmp/ficha.pdf -w '%{http_code} %{content_type}\n' "http://localhost:3000/api/ficha/<slug publicado>/<uuid de una unidad>?ref=prueba"`.
  - El slug y el uuid se sacan con una consulta de solo lectura a Supabase o desde el HTML de la página de una unidad.
  - Expected: `200 application/pdf`.
  - Abrir el PDF con el Read tool (o convertir la página 1 a PNG) y mirar la diagramación. Corregir lo visual antes de seguir.

### Task 5: Evento `ficha` y "Fichas descargadas desde el sitio"

**Files:**
- Modify: `lib/analytics/track-schema.ts`, `supabase/schema.sql` (bloque nuevo al final de la sección de analítica), `lib/analytics/metrics.ts`, `components/admin/metrics/MetricsSummary.tsx`, `app/api/admin/metrics/route.test.ts`
- Test: `lib/analytics/track-schema.test.ts` (crear si no existe) y un test de `MetricsSummary` (jsdom; crear `components/admin/metrics/MetricsSummary.test.tsx` si no existe)

**Interfaces:**
- Produces: `TRACK_TYPES` incluye `'ficha'`; `MetricsSummary.ficha_downloads: number`.

- [ ] **Step 1: Tests que fallan.**
  - `trackSchema.safeParse({ ...válido, type: 'ficha', unitId: <uuid> }).success === true`.
  - `MetricsSummary` con `ficha_downloads: 7` renderiza el texto `Fichas descargadas desde el sitio` y `7`.
  - Con `ficha_downloads` ausente (base sin el SQL nuevo) renderiza `0`, no `NaN` ni `undefined`.
- [ ] **Step 2: Run** `npx vitest run lib/analytics components/admin/metrics app/api/admin/metrics`. Expected: FAIL en los nuevos.
- [ ] **Step 3: Implementar.**
  - Sumar `'ficha'` a `TRACK_TYPES`.
  - `ficha_downloads` en el tipo, con `?? 0` donde se lee en la ruta de métricas.
  - En `MetricsSummary`, sumar el dato como hint de la tarjeta "Visitantes únicos" o como quinta tarjeta, la que no rompa la grilla de 4: Ruling. Etiqueta exacta `Fichas descargadas desde el sitio`.
  - SQL en `schema.sql`, bloque `-- Ficha PDF por unidad (2026-11-24)`:
    - `alter table site_events drop constraint if exists site_events_type_check;` (confirmar el nombre real del check en `schema.sql`; si es anónimo, Postgres lo nombra `site_events_type_check`);
    - `alter table site_events add constraint site_events_type_check check (type in ('page','unit','tour','brief','whatsapp','ficha'));`;
    - `create or replace function site_metrics_summary(...)`, igual a la actual más `'ficha_downloads', (select count(*) from ev where ev.type = 'ficha')`;
    - actualizar también la definición original de la tabla para que una base nueva nazca con `'ficha'`.
- [ ] **Step 4: Run** el mismo comando. Expected: PASS.

### Task 6: Botón "Descargar ficha" en la unidad

**Files:**
- Create: `lib/ficha/href.ts`, `components/unit/DownloadFichaButton.tsx`
- Modify: `components/unit/UnitViewer.tsx` (tarjeta, junto a "Consultar precio"/calculadora; también cuando esa fila no se muestra), `components/unit/UnitMobileView.tsx` (sección estado/tipología/precio)
- Test: `lib/ficha/href.test.ts`, `components/unit/DownloadFichaButton.test.tsx` (jsdom)

**Interfaces:**
- Consumes: `useTrack` (`components/analytics/SiteTracker`); `readAttribution` (`lib/analytics/client-state`).
- Produces:
  - `fichaHref(slug: string, unitDbId: string, ref: string | null): string` → `/api/ficha/<slug>/<uuid>` más `?ref=<encodeURIComponent(ref)>` si hay ref;
  - `<DownloadFichaButton projectSlug unitDbId unitName variant="desktop" | "mobile" />`.

- [ ] **Step 1: Tests que fallan.**
  - `fichaHref('torre-sol', U, null)` → `'/api/ficha/torre-sol/' + U`.
  - `fichaHref('torre-sol', U, 'inmo-sur')` → `'…?ref=inmo-sur'`.
  - Botón (jsdom):
    - sin ref guardado, `href` = `fichaHref(slug, U, null)`;
    - con `localStorage['atrium_ref'] = JSON.stringify({ ref: 'inmo-sur', at: Date.now() })`, después de montar `href` termina en `?ref=inmo-sur`;
    - tiene atributo `download`;
    - el texto es `Descargar ficha`;
    - al hacer click se llama a `track('ficha', { unitId: U })`: renderizar dentro del provider de `SiteTracker` o mockear `useTrack` con `vi.mock`.
- [ ] **Step 2: Run** `npx vitest run lib/ficha/href.test.ts components/unit/DownloadFichaButton.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - El `href` arranca sin ref (render del servidor) y se completa en un `useEffect` con `readAttribution().ref`.
  - Ícono de descarga inline SVG; alto mínimo 44 px en celular.
  - Estilo de botón secundario igual a "Consultar precio" en escritorio.
  - Insertarlo en `UnitViewer` y `UnitMobileView` con `unit.dbId`. Se muestra siempre.
- [ ] **Step 4: Run** el mismo comando y `npx vitest run components/unit`. Expected: PASS.
- [ ] **Step 5: Prueba en navegador** (si Chrome DevTools está libre; si no, curl del HTML).
  - Abrir una unidad en escritorio y en celular (375 px).
  - Ver el botón y que el link incluya `?ref=` después de entrar con `?ref=prueba`.
  - No tocar inputs del admin.

### Task 7: Verificación final

- [ ] **Step 1:** `npm test > <workspace>/suite.log 2>&1; tail -20 <workspace>/suite.log`. Expected: todos los tests pasan.
- [ ] **Step 2:** `npm run lint`. Expected: 0 errores (los 31 warnings previos pueden seguir).
- [ ] **Step 3:** `npm run build`. Expected: build OK, con la ruta `/api/ficha/[slug]/[unitId]` listada.
- [ ] **Step 4:** Actualizar la memoria (`ficha-pdf-unidad.md` más el puntero en `MEMORY.md`) con el estado y el SQL pendiente.
