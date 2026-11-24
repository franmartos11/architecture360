# Analítica de visitas y links de broker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar visitas del sitio público de cada proyecto, atribuirlas (y a los leads del formulario) a inmobiliarias/campañas vía `?ref=`, y mostrar métricas y canales en el panel.

**Architecture:** Un componente cliente `SiteTracker` en el layout público manda eventos con `sendBeacon` a `POST /api/track`, que los guarda con service-role en `site_events`. Visitante, sesión y canal (first-touch 90 días) viven en `localStorage`. Los canales son filas de `project_channels`; el cruce con eventos/leads es por texto (`ref` = `slug`). El panel lee agregados de funciones SQL `security invoker` vía `GET /api/admin/metrics`.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + RLS), zod 4, Vitest (+ RTL/jsdom por archivo).

**Spec:** `docs/superpowers/specs/2026-11-24-analitica-y-links-de-broker-design.md`

## Global Constraints

- Trabajar directo en `main` de my-app, sin worktrees ni ramas. **No commitear**: el usuario commitea cuando lo pide. Donde la skill pondría "Commit", acá es "Verificar".
- Todo el SQL va al final de `supabase/schema.sql`, idempotente (`if not exists`, `drop policy if exists`, `create or replace`). No se corre contra la base: la Supabase es compartida con producción, lo corre el usuario a mano.
- No tocar el bot de WhatsApp (`lib/whatsapp-bot/**`, `ops/bot/**`).
- First-touch: gana el primer `ref` por **90 días**. `ref` y `slug` siempre en minúsculas.
- Fuente del canal: `ref` de la URL; si no hay, `utm_source`.
- Sesión: corte a los **30 min** sin actividad. Duración de unidad: tope **1800 s**.
- No guardar IP ni usar cookies. No registrar en vista previa del borrador ni user agents de bots.
- Rate limit de `/api/track`: **300 eventos / 10 min por IP**.
- El tracker es "disparar y olvidar": nunca bloquea el render ni muestra errores; todo acceso a `localStorage` con try/catch.
- Métricas y canales: rol **gestor** en adelante (`project_role_rank >= 2`) y solo proyectos con `typeConfig.showLeads`.
- Textos de UI en español rioplatense, con los componentes de `components/admin/panel-ui.tsx`.

## Review Focus

1. **Cliente viejo cacheado manda el código de unidad ("N01-07") en `unitId` a `/api/leads`** → el lead se guarda igual con `unit_id` null; nunca 400/500. (Test en Task 2.)
2. **`localStorage` bloqueado (Safari privado, iframe de terceros)** → el tracker sigue mandando eventos con ids en memoria y el sitio no rompe. (Test en Task 3.)
3. **El sitio dentro de un iframe del mismo origen** (amenities embebe `/recorrido?embed=true`) → no se cuentan visitas dobles; en un iframe de otro origen (web de la desarrolladora) sí se cuenta. (Test en Task 3.)
4. **`/api/track` con `unitId` de otro proyecto o `durationSeconds` sobre un evento ajeno/no-`unit`** → no se guarda la unidad ajena; la duración solo actualiza un evento `unit` del mismo proyecto con duración vacía, con tope 1800. (Test en Task 4.)
5. **Editar el slug de un canal con tráfico** → 409 con mensaje claro, el slug no cambia. (Test en Task 6.)

---

### Task 1: SQL — tablas, columnas, RLS, funciones de agregación y backfill

**Files:**
- Modify: `supabase/schema.sql` (agregar bloque al final, con encabezado `-- ═══ Analítica de visitas y canales (2026-11-24) ═══`)

**Interfaces:**
- Produces (tablas): `project_channels(id, project_id, name, slug, kind, archived_at, created_at)`, `site_events(id, project_id, visitor_id, session_id, type, path, unit_id, ref, referrer_host, device, duration_seconds, created_at)`, `leads.ref text`, `leads.visitor_id uuid`. Columnas exactamente como en la spec, sección "Datos".
- Produces (funciones, todas `language sql stable security invoker`, `p_since timestamptz` = desde cuándo; `'-infinity'` para "todo"):
  - `site_metrics_summary(p_project_id uuid, p_since timestamptz) returns jsonb` → `{ visitors, sessions, unit_viewers, tour_viewers, web_converters, web_leads, whatsapp_clickers, other_leads, mobile_events, desktop_events }`. `web_converters` = visitantes distintos con lead (`leads.visitor_id`) o evento `whatsapp`. `other_leads` = leads del período con `visitor_id is null`.
  - `site_unit_ranking(p_project_id uuid, p_since timestamptz) returns table(unit_id uuid, code text, status text, views bigint, viewers bigint, avg_seconds numeric, tours bigint, leads bigint)` → una fila por unidad con al menos una vista o un lead.
  - `site_traffic_sources(p_project_id uuid, p_since timestamptz) returns table(ref text, referrer_host text, visitors bigint, converters bigint)` → agrupado por `(ref, referrer_host)` del primer evento de cada visitante en el período.
- Backfill (una sola vez, idempotente): `update leads set unit_id = …` donde `unit_id is null` y `unit_name` coincide con el `code` de **exactamente una** unidad del proyecto (`units → floors → buildings.project_id`).

- [ ] **Step 1:** Escribir `project_channels` con `unique (project_id, slug)`, `check (kind in ('inmobiliaria','campaña'))`, `check (slug = lower(slug))`, RLS select/insert/update `project_role_rank(project_id) >= 2` (patrón de las policies de `leads`, ~línea 2387). Sin policy de delete.
- [ ] **Step 2:** Escribir `site_events` con los checks de la spec (`type`, `device`), índices `(project_id, created_at)`, `(project_id, unit_id)`, `(project_id, ref)`, RLS habilitada con solo select para rank ≥ 2.
- [ ] **Step 3:** `alter table leads add column if not exists ref text; … visitor_id uuid;` + índice `(project_id, ref)`.
- [ ] **Step 4:** Las tres funciones y el backfill. `revoke execute … from public, anon; grant execute … to authenticated;` (mismo patrón que `project_role_rank`).
- [ ] **Step 5: Verificar** — releer el bloque buscando: nombres de columna iguales a los de la spec, cada `create policy` precedido de `drop policy if exists`, funciones `security invoker`. Correr `pnpm test` (no debe romper nada: hay tests que leen `schema.sql`).

---

### Task 2: Unidad con uuid real + `/api/leads` guarda unidad, ref y visitante

**Files:**
- Modify: `types/index.ts` (`Unit`, `Lead`), `data/project-repository.ts:67`, `lib/lead-columns.ts`, `app/api/leads/route.ts`, `components/ui/LeadCaptureModal.tsx:112`, `components/HomeContactForm.tsx:48`
- Test: `app/api/leads/route.test.ts`

**Interfaces:**
- Produces: `Unit.dbId: string` (uuid de la fila; `Unit.id` sigue siendo el código). `Lead.ref: string | null`. `LEAD_COLUMNS` incluye `ref`.
- Produces: body de `POST /api/leads` acepta `unitId?: string` (uuid; cualquier otra cosa se ignora), `ref?: string`, `visitorId?: string`.
- Consumes (Task 3): `readAttribution(): { visitorId: string; ref: string | null }` de `lib/analytics/client-state.ts` — los formularios lo llaman al enviar.

- [ ] **Step 1: Tests que fallan** en `route.test.ts`:
  - `'guarda unit_id cuando es un uuid de una unidad del proyecto'` → el insert recibe `unit_id: '<uuid>'`.
  - `'unitId que no es uuid (cliente viejo manda el código): guarda el lead con unit_id null'` → status 200, insert con `unit_id: null`.
  - `'uuid de unidad de otro proyecto: unit_id null'`.
  - `'guarda ref en minúsculas y visitor_id'` → body `{ ref: 'Perez', visitorId: '<uuid>' }` ⇒ insert `{ ref: 'perez', visitor_id: '<uuid>' }`.
- [ ] **Step 2:** `pnpm vitest run app/api/leads/route.test.ts` → FAIL.
- [ ] **Step 3:** Esquema zod: `unitId: z.string().max(100).optional()`, `ref: z.string().max(60).optional()`, `visitorId: z.string().max(40).optional()`. Si `unitId` es uuid, confirmar con una consulta (service-role) que la unidad pertenece al proyecto; si no, `null`. `visitorId` solo si es uuid. Mapear `dbId: u.id` en el repositorio; `LeadCaptureModal` manda `unitId: unit?.dbId ?? null` y ambos formularios suman `...readAttribution()`.
- [ ] **Step 4:** `pnpm vitest run app/api/leads/route.test.ts` → PASS; `pnpm test` completo sin regresiones (hay tests que arman `Unit` a mano: agregar `dbId` donde el tipo lo exija).

---

### Task 3: Estado del visitante en el navegador (lógica pura)

**Files:**
- Create: `lib/analytics/client-state.ts`, `lib/analytics/client-state.test.ts`

**Interfaces:**
- Produces:
  - `type KV = Pick<Storage, 'getItem' | 'setItem'>`
  - `safeStorage(): KV` — `localStorage` envuelto en try/catch; si falla, un `Map` en memoria (mismo objeto durante la vida de la pestaña).
  - `getVisitorId(s: KV): string`
  - `touchSession(s: KV, now: number): string` — devuelve el `session_id` vigente o uno nuevo si pasaron > 30 min desde el último evento; actualiza la hora.
  - `captureRef(s: KV, search: string, now: number): void` — lee `ref` o `utm_source`, minúsculas, recortado a 60; guarda solo si no hay uno vigente (< 90 días).
  - `currentRef(s: KV, now: number): string | null`
  - `referrerHost(referrer: string, currentHost: string): string | null` — host sin `www.`; `null` si vacío o mismo host.
  - `shouldTrack(o: { isDraftPreview: boolean; inSameOriginFrame: boolean }): boolean`
  - `readAttribution(): { visitorId: string; ref: string | null }` — atajo para formularios con `safeStorage()` y `Date.now()`.
  - Claves de storage: `atrium_vid`, `atrium_sess` (`{id, at}`), `atrium_ref` (`{ref, at}`).

- [ ] **Step 1: Tests que fallan** (entorno node, con un `KV` falso sobre `Map`):
  - visitor id estable entre llamadas; uuid válido.
  - sesión: misma a los 29 min, nueva a los 31 min.
  - `captureRef('?ref=Perez')` ⇒ `currentRef` = `'perez'`; luego `'?ref=instagram'` a los 7 días ⇒ sigue `'perez'`; a los 91 días ⇒ `'instagram'`.
  - `'?utm_source=facebook'` sin `ref` ⇒ `'facebook'`; con ambos gana `ref`.
  - `referrerHost('https://www.google.com/search?q=x', 'torre.com')` ⇒ `'google.com'`; mismo host ⇒ `null`; `''` ⇒ `null`.
  - `shouldTrack`: borrador ⇒ false; iframe mismo origen ⇒ false; resto ⇒ true.
  - **Review Focus 2:** un `KV` cuyo `getItem`/`setItem` tiran excepción, pasado por el envoltorio de `safeStorage`, no tira y devuelve ids consistentes en la misma pestaña.
- [ ] **Step 2:** `pnpm vitest run lib/analytics/client-state.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. `safeStorage` acepta opcionalmente el storage a envolver (para el test).
- [ ] **Step 4:** Mismo comando → PASS.

---

### Task 4: `POST /api/track`

**Files:**
- Create: `lib/analytics/track-schema.ts`, `lib/analytics/user-agent.ts`, `lib/analytics/user-agent.test.ts`, `app/api/track/route.ts`, `app/api/track/route.test.ts`

**Interfaces:**
- Produces: `trackSchema` (zod) con `{ id: uuid, projectSlug: string ≤100, visitorId: uuid, sessionId: uuid, type: 'page'|'unit'|'tour'|'brief'|'whatsapp', path: string ≤300, unitId?: uuid, ref?: string ≤60, referrerHost?: string ≤120, durationSeconds?: int ≥0 }`; `type TrackPayload = z.infer<typeof trackSchema>`.
- Produces: `isBotUserAgent(ua: string | null): boolean`, `deviceFromUserAgent(ua: string | null): 'mobile' | 'desktop'`.
- Comportamiento de la ruta: payload inválido ⇒ 400. Válido ⇒ siempre 204 (aunque el proyecto no exista o sea bot). Con `durationSeconds` ⇒ solo `update site_events set duration_seconds = least(x,1800) where id = $id and project_id = $p and type = 'unit' and duration_seconds is null`; sin ⇒ insert. Rate limit con `rateLimitOrRespond({ key: 'track:ip:<ip>', windowSeconds: 600, max: 300 })`.

- [ ] **Step 1: Tests que fallan**:
  - `user-agent.test.ts`: Googlebot / `bingbot` / `HeadlessChrome` ⇒ bot; Chrome de escritorio ⇒ no; iPhone Safari ⇒ `'mobile'`; Mac Chrome ⇒ `'desktop'`; `null` ⇒ no bot, `'desktop'`.
  - `route.test.ts` (patrón de `app/api/leads/route.test.ts`): payload inválido ⇒ 400 sin tocar la base; evento `page` válido ⇒ 204 e insert con `device`, `ref` en minúsculas y **sin** campo de IP; user agent bot ⇒ 204 sin insert; proyecto inexistente ⇒ 204 sin insert; **Review Focus 4:** `unitId` que no es del proyecto ⇒ insert con `unit_id: null`; `durationSeconds: 5000` ⇒ update con `1800` filtrado por `id`, `project_id`, `type='unit'` y `duration_seconds is null`, sin insert.
- [ ] **Step 2:** `pnpm vitest run lib/analytics/user-agent.test.ts app/api/track` → FAIL.
- [ ] **Step 3:** Implementar. Proyecto por slug con el cliente anon (como `/api/leads`); unidad y escritura con `createAdminClient()`.
- [ ] **Step 4:** Mismo comando → PASS.

---

### Task 5: `SiteTracker` y puntos de disparo en el sitio público

**Files:**
- Create: `lib/analytics/send.ts`, `components/analytics/SiteTracker.tsx`, `hooks/useUnitViewTracking.ts`, `components/analytics/SiteTracker.test.tsx`
- Modify: `app/proyecto/[slug]/layout.tsx` (envolver `children` dentro de `ProjectWhatsappProvider`), `components/unit/UnitViewer.tsx` (y `UnitMobileView.tsx` si renderiza la unidad sin pasar por `UnitViewer`), `components/floorplan/FloorPlanViewer.tsx` (unidad seleccionada), `components/unit/tabs/Tour360Tab.tsx`, `components/tour/CommonAreasTour.tsx`

**Interfaces:**
- Consumes: Task 3 (`safeStorage`, `getVisitorId`, `touchSession`, `captureRef`, `currentRef`, `referrerHost`, `shouldTrack`), Task 4 (`TrackPayload`).
- Produces:
  - `sendEvent(p: TrackPayload): void` — `navigator.sendBeacon('/api/track', Blob json)`; si no existe o devuelve false, `fetch(..., { keepalive: true })` sin await, `.catch(() => {})`.
  - `<SiteTracker projectSlug={string} isDraftPreview={boolean} briefUrl={string | undefined}>{children}</SiteTracker>`
  - `useTrack(): (type: 'tour' | 'brief' | 'whatsapp', extra?: { unitId?: string }) => void` — no-op fuera del provider o si `shouldTrack` es false.
  - `useUnitViewTracking(unitDbId: string | null | undefined): void` — al recibir un id manda `unit` con un `id` nuevo; al cambiar de unidad, desmontar o `visibilitychange → hidden`, manda el mismo `id` con `durationSeconds` (segundos visibles).
- Comportamiento del provider:
  - Al montar: `captureRef(location.search)`. En cada cambio de `usePathname()`: evento `page` (con `referrerHost` solo en el primero).
  - Listener delegado de `click` en `document`: `a[href*="wa.me"]` o `a[href*="api.whatsapp.com"]` ⇒ `whatsapp`; `a[href="<briefUrl>"]` ⇒ `brief`. Así no se tocan los 5 botones de WhatsApp ni los 5 links del brief.
  - `inSameOriginFrame` = `window.top !== window` y acceder a `window.top.location.origin` no tira y es igual a `location.origin`.

- [ ] **Step 1: Tests que fallan** (`// @vitest-environment jsdom`, `sendEvent` mockeado):
  - monta con `?ref=Perez` ⇒ un `page` con `ref: 'perez'`.
  - `isDraftPreview` ⇒ ningún evento.
  - clic en `<a href="https://wa.me/549...">` ⇒ `whatsapp`; clic en el link del brief ⇒ `brief`; clic en otro link ⇒ nada.
  - `useUnitViewTracking('u1')` y luego `'u2'` ⇒ `unit` u1, duración de u1 (mismo `id`), `unit` u2.
- [ ] **Step 2:** `pnpm vitest run components/analytics` → FAIL.
- [ ] **Step 3:** Implementar y cablear: layout (`briefUrl={project.briefPdfUrl}`), `useUnitViewTracking(unit.dbId)` en la ficha, `useUnitViewTracking(selectedUnit?.dbId)` en el plano, `useTrack()('tour', { unitId })` al montar `Tour360Tab` y `('tour')` al montar `CommonAreasTour`.
- [ ] **Step 4:** `pnpm vitest run components/analytics` → PASS; `pnpm test` y `pnpm lint` sin errores nuevos.

---

### Task 6: Canales — lógica y API

**Files:**
- Create: `lib/analytics/channels.ts`, `lib/analytics/channels.test.ts`, `app/api/admin/channels/route.ts`, `app/api/admin/channels/[id]/route.ts`, `app/api/admin/channels/route.test.ts`

**Interfaces:**
- Produces:
  - `type Channel = { id: string; name: string; slug: string; kind: 'inmobiliaria' | 'campaña'; archived_at: string | null; created_at: string; has_traffic: boolean }`
  - `channelSlug(name: string): string` — `slugify(name)` recortado a 60.
  - `channelLink(slug: string, projectSlug: string, origin: string, customDomain?: string | null): string` — `getProjectDisplayUrl(...)` + `?ref=<slug>` (o `&ref=` si ya tiene query).
  - `GET /api/admin/channels` ⇒ `Channel[]` (incluye archivados; `has_traffic` = existe evento o lead del proyecto con ese `ref`).
  - `POST /api/admin/channels` body `{ name, kind, slug? }` ⇒ 201 `Channel`; 409 si el slug ya existe en el proyecto.
  - `PATCH /api/admin/channels/[id]` body `{ name?, slug?, archived? }` ⇒ 200 `Channel`; **409 `'Este link ya tiene visitas: no se puede cambiar.'`** si cambia `slug` y `has_traffic`.
  - Auth: `resolveRequestedProjectId` + `requireProjectAccess(projectId, { minRole: 'gestor' })`, como `app/api/admin/leads/route.ts`.

- [ ] **Step 1: Tests que fallan**: `channelSlug('Inmobiliaria Pérez & Asoc.')` ⇒ `'inmobiliaria-perez-asoc'` (o lo que devuelva `slugify`, fijado en el test); `channelLink('perez','torre','https://app.x','torre.com')` ⇒ `'https://torre.com/?ref=perez'` (ajustar a la forma real de `getProjectDisplayUrl`); API: sin rol ⇒ 401; POST duplicado ⇒ 409; **Review Focus 5:** PATCH de slug con tráfico ⇒ 409 y sin update; PATCH de nombre con tráfico ⇒ 200.
- [ ] **Step 2:** `pnpm vitest run lib/analytics/channels.test.ts app/api/admin/channels` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mismo comando → PASS.

---

### Task 7: API de métricas

**Files:**
- Create: `lib/analytics/metrics.ts`, `lib/analytics/metrics.test.ts`, `app/api/admin/metrics/route.ts`

**Interfaces:**
- Consumes: funciones SQL de Task 1; `Channel` de Task 6.
- Produces:
  - `type MetricsRange = '7' | '30' | 'all'`; `rangeSince(range: MetricsRange, now: number): string` (ISO; `'all'` ⇒ `'-infinity'`).
  - `conversionRate(converters: number, visitors: number): number | null` (0–1; `null` si no hay visitantes).
  - `groupSources(rows, channels: Channel[]): { channels: ChannelStat[]; unregistered: { ref: string; visitors: number; converters: number }[]; direct: { host: string | null; visitors: number; converters: number }[] }` — `ChannelStat = Channel & { visitors: number; converters: number; rate: number | null }`; canales sin tráfico aparecen con 0.
  - `GET /api/admin/metrics?range=30` ⇒ `{ summary, units, sources }` (summary = jsonb de `site_metrics_summary` + `rate`). Gestor en adelante.

- [ ] **Step 1: Tests que fallan**: `rangeSince('7', now)` = now − 7 días; `conversionRate(0, 0)` ⇒ `null`; `groupSources` con `ref` registrado, `ref` desconocido y sin `ref` (dos hosts) ⇒ cae cada uno en su grupo; canal archivado sin tráfico no aparece, con tráfico sí.
- [ ] **Step 2:** `pnpm vitest run lib/analytics/metrics.test.ts` → FAIL.
- [ ] **Step 3:** Implementar la lógica y la ruta (tres `supabase.rpc(...)` en paralelo con el cliente de sesión, para que apliquen las RLS).
- [ ] **Step 4:** Mismo comando → PASS.

---

### Task 8: Pantalla "Métricas" en el panel

**Files:**
- Create: `app/admin/(authenticated)/(project)/metricas/page.tsx`, `components/admin/metrics/MetricsSummary.tsx`, `components/admin/metrics/UnitRanking.tsx`, `components/admin/metrics/ChannelsPanel.tsx`
- Modify: `app/admin/(authenticated)/(project)/ProjectAdminShell.tsx` (ítem "Métricas" junto a Leads, gateado igual que `canSeeLeads`), `ProjectAdminShell.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/metrics`, `GET/POST/PATCH /api/admin/channels`, `channelLink`, `useCustomDomain()`, `withActiveProject` (como el dashboard).
- Produces: ruta `/admin/metricas?tab=resumen|canales`.
- Contenido exacto según la spec, sección "Panel": Resumen (período 7/30/todo con `SegmentedTabs`, cifras, embudo, ranking ordenable por columna con default "más vistas", origen del tráfico, dispositivo, "otros leads del período") y Canales (lista con link + "Copiar", alta, edición, archivo, slug bloqueado con explicación si `has_traffic`, "Links sin registrar" con "Registrar").
- Estados vacíos: sin eventos todavía ⇒ mensaje "Todavía no hay visitas registradas. Compartí el link del proyecto para empezar a medir."

- [ ] **Step 1: Test que falla** en `ProjectAdminShell.test.tsx`: gestor en proyecto para vender ve "Métricas"; editor no; proyecto "solo para mostrar" no.
- [ ] **Step 2:** `pnpm vitest run "app/admin/(authenticated)/(project)/ProjectAdminShell.test.tsx"` → FAIL.
- [ ] **Step 3:** Implementar nav y pantallas.
- [ ] **Step 4:** Test → PASS; `pnpm lint`.

---

### Task 9: Tarjeta en el dashboard y canal en Leads

**Files:**
- Modify: `app/admin/(authenticated)/(project)/page.tsx` (tarjeta con visitantes y consultas web del `range` ya existente + link a `/admin/metricas`, solo si `canSeeLeads`), `app/admin/(authenticated)/(project)/leads/TableroLeads.tsx` (columna "Canal" con el nombre del canal o el `ref` crudo, y filtro por canal; datos de `GET /api/admin/channels`)
- Test: el test existente de leads más cercano a `TableroLeads` (o `lib/` si la lógica de filtro se extrae a una función pura `filterLeadsByChannel(leads, ref | '__none__' | null)`)

- [ ] **Step 1: Test que falla** de `filterLeadsByChannel`: `null` ⇒ todos; `'perez'` ⇒ solo `ref === 'perez'`; `'__none__'` ⇒ solo `ref` null.
- [ ] **Step 2:** Correr → FAIL. **Step 3:** Implementar y cablear. **Step 4:** Correr → PASS.

---

### Task 10: Verificación final

- [ ] `pnpm test` → todo PASS.
- [ ] `pnpm lint` → sin errores nuevos.
- [ ] `pnpm build` → compila.
- [ ] Navegador (dev): abrir el sitio público de un proyecto con `?ref=prueba`, navegar a una unidad, abrir el 360 y tocar WhatsApp; en DevTools › Network ver los `POST /api/track` con 204. **No editar inputs del admin** (autosave sobre la base compartida). Hasta que el usuario corra el SQL, `/api/track` y `/admin/metricas` van a fallar contra la base: anotarlo en el resumen, no "arreglarlo".
- [ ] Resumen al usuario: qué SQL correr (bloque nuevo de `schema.sql`), qué quedó probado y qué no.
