# Multi-idioma, Etapa 1 (Base) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El sitio público de un proyecto con inglés activado se ve completo en inglés en `/en` (texto fijo, etiquetas y formatos), con selector, `hreflang` y sitemap; el contenido de la desarrolladora sigue en castellano hasta la Etapa 2.

**Architecture:** `proxy.ts` detecta el segmento `/en`, reescribe a la ruta de siempre y pasa el idioma en el header `x-atrium-lang`. El servidor lo lee con `getLocale()`, y el layout del proyecto lo reparte por contexto. El base path incluye `/en`, así los links internos heredan el idioma sin tocarlos. Los textos salen de un diccionario propio tipado (`es` fuente, `en`). Un test guardián falla si queda texto fijo en los componentes ya migrados.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Vitest (+ RTL/jsdom por archivo).

**Spec:** `docs/superpowers/specs/2026-11-25-multi-idioma-design.md` (secciones "Idioma en la dirección", "Texto fijo", "Panel" → interruptor, "Sitio" → selector y metadata, "Entrega por etapas" → 1).

## Global Constraints

- Directo en `main` de my-app, **sin commits** hasta que el usuario lo pida. Usar **pnpm**.
- Sin dependencias nuevas.
- Castellano es el default: ninguna dirección, link o comportamiento en castellano cambia. Las claves de filtro de la URL (`tipo=`, `feats=`) quedan en castellano.
- `LOCALES = ['es', 'en']`, `DEFAULT_LOCALE = 'es'`. El header interno es `x-atrium-lang`.
- Formatos: `es` → `es-AR`, `en` → `en-US`. Precios: la moneda sigue eligiendo el formato (`formatPrice`), solo cambian los separadores cuando el idioma es `en`.
- `/en` en un proyecto sin `en` en `projects.locales` → 404. `/es/...` → 308 a la dirección sin prefijo.
- Activar el inglés: administrador en adelante, con ruta propia.
- SQL en `supabase/schema.sql`, al usuario como sentencias sueltas, sin comentarios, en un bloque de código.
- No se traduce el panel. La vista previa del panel (`SECTION_COMPONENTS` sin proveedor) sigue en castellano.
- Copy en inglés: claro, natural para un comprador de inmuebles en EE. UU. ("Available", "Reserved", "Sold", "Floor plan", "Book a visit"), sin traducir nombres propios.

## Review Focus

1. **Links viejos en castellano** (con `?ref=` o filtros) siguen abriendo igual y en castellano. Test: Task 2.
2. **`/en` en un proyecto sin inglés:** da 404 y no muestra el selector. Tests: Task 2 y Task 4.
3. **Subdominio o dominio propio con `/en`:** reescribe bien. La redirección al dominio propio conserva `/en` y la query. Test: Task 2.
4. **Vista previa del panel** (sin `LocaleProvider`): sigue en castellano y no rompe. Test: Task 1.
5. **Filtros de unidades en inglés:** `?tipo=2 dormitorios` sigue filtrando en `/en/unidades` y muestra la etiqueta en inglés. Test: Task 7.

---

### Task 1: Núcleo de idioma (diccionario, `t`, contexto, formatos)

**Files:**
- Create: `lib/i18n/locales.ts`, `lib/i18n/t.ts`, `lib/i18n/server.ts`, `lib/i18n/client.tsx`, `lib/i18n/messages/es.ts`, `lib/i18n/messages/en.ts`
- Test: `lib/i18n/t.test.ts`, `lib/i18n/client.test.tsx`

**Interfaces:**
- Produces:

```ts
// locales.ts (sin imports de next/react)
export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_HEADER = 'x-atrium-lang';
export function isLocale(v: unknown): v is Locale;
export function intlLocale(l: Locale): 'es-AR' | 'en-US';
// messages/es.ts: export const es = { … } as const;  export type Mensajes = DeepString<typeof es>
// messages/en.ts: export const en: Mensajes = { … }   (TS falla si falta o sobra una clave)
// t.ts
export type ClaveMensaje = /* unión de rutas con punto: 'nav.unidades' | 'unidad.estado.disponible' … */;
export function crearT(locale: Locale): (clave: ClaveMensaje, vars?: Record<string, string | number>) => string;
// server.ts ('server-only')
export async function getLocale(): Promise<Locale>;      // header x-atrium-lang, default 'es'
export async function getT(): Promise<ReturnType<typeof crearT>>;
// client.tsx ('use client')
export function LocaleProvider(p: { locale: Locale; disponibles: Locale[]; children: React.ReactNode }): JSX.Element;
export function useLocale(): { locale: Locale; disponibles: Locale[] };   // sin proveedor: { 'es', ['es'] }
export function useT(): ReturnType<typeof crearT>;
```

- [ ] **Step 1: Tests que fallan.**
  - `crearT('en')('nav.unidades')` devuelve el texto inglés; `crearT('es')` devuelve el castellano.
  - **Interpolación:** `{nombre}` se reemplaza; una variable que falta queda como `{nombre}`.
  - **Plural:** con `vars.count`, usa `<clave>_one` si `count === 1` y `<clave>_other` si no. En `es` y `en`, `t('unidades.disponibles', { count: 1 })` → "1 disponible" / "1 available"; con 3 → "3 disponibles" / "3 available".
  - **Clave inexistente en runtime** (cast): devuelve la clave, sin tirar.
  - `intlLocale('en') === 'en-US'`; `isLocale('fr') === false`.
  - **`client.test.tsx` (jsdom):** un componente con `useT()` sin proveedor muestra castellano (vista previa del panel); con `LocaleProvider locale="en"` muestra inglés.
- [ ] **Step 2: Run** `pnpm vitest run lib/i18n`. Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar.** Arrancar el diccionario con las claves de los tests y de la barra (`nav.*`). Las tareas siguientes lo van completando.
- [ ] **Step 4: Run** `pnpm vitest run lib/i18n` y `pnpm tsc --noEmit -p .`. Expected: PASS y sin errores.

### Task 2: Idioma en la dirección (proxy, base path, layout)

**Files:**
- Create: `lib/i18n/path.ts`; `components/i18n/HtmlLang.tsx`
- Modify:
  - `proxy.ts`;
  - `lib/project-base-path.ts`;
  - `app/proyecto/[slug]/layout.tsx`: `LocaleProvider`, 404 si el idioma no está activo, `<HtmlLang>`.
- Test: `lib/i18n/path.test.ts`, `proxy.test.ts`, `lib/project-base-path.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: Task 1 `Locale`, `isLocale`, `LOCALE_HEADER`, `getLocale`, `LocaleProvider`. Task 3 `Project.locales`; hasta Task 3, el layout trata `project.locales ?? ['es']`.
- Produces:

```ts
// path.ts (puro)
export function separarIdioma(pathname: string): { locale: Locale; resto: string; prefijoEs: boolean };
//  '/en' → { locale:'en', resto:'/' }   '/en/unidades' → { 'en', '/unidades' }   '/unidades' → { 'es', '/unidades' }
//  '/es/unidades' → { 'es', '/unidades', prefijoEs:true }   '/enlace' → { 'es', '/enlace' } (no es un segmento)
export function conIdioma(base: string, locale: Locale): string;   // conIdioma('/proyecto/x','en') → '/proyecto/x/en'; conIdioma('','en') → '/en'; 'es' → base
```

- [ ] **Step 1: Tests que fallan.**
  - **`path.test.ts`:** los casos de arriba, más `/EN` (no es segmento válido: castellano) y querys ajenas al pathname.
  - **`proxy.test.ts`:**
    - subdominio `torre.<root>/en/unidades?ref=perez` → rewrite a `/proyecto/torre/unidades?ref=perez` con header `x-atrium-lang: en`;
    - dominio raíz `/proyecto/torre/en/unidades` → rewrite a `/proyecto/torre/unidades` con `en`;
    - `/proyecto/torre/unidades?ref=perez` sin `/en` → sigue igual que hoy, con `x-atrium-lang: es` (un header `en` que llegue de afuera se pisa);
    - `/proyecto/torre/es/unidades` → 308 a `/proyecto/torre/unidades`;
    - proyecto con dominio propio: `/proyecto/torre/en/unidades?ref=x` → 308 a `https://<dominio>/en/unidades?ref=x`;
    - en el dominio propio, `/en` → rewrite con `en`.
  - **`project-base-path.test.ts`:** con `x-atrium-lang: en`, `getProjectBasePath` devuelve `/proyecto/torre/en` (dominio raíz) y `/en` (subdominio); sin header, lo de hoy.
- [ ] **Step 2: Run** `pnpm vitest run lib/i18n/path.test.ts proxy.test.ts lib/project-base-path.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - El proxy usa `NextResponse.rewrite(url, { request: { headers } })` con el header siempre puesto.
  - Layout:
    - `const locale = await getLocale()`; si `locale !== 'es'` y no está en `project.locales`, llama a `notFound()`;
    - `<LocaleProvider locale disponibles={project.locales}>` envolviendo lo de hoy;
    - `<HtmlLang locale>` es un cliente que ajusta `document.documentElement.lang`.
  - Ruling ya tomado: `<html lang>` se ajusta en el cliente para no volver dinámico el layout raíz. Las páginas en inglés además llevan `hreflang` (Task 4).
- [ ] **Step 4: Run** el mismo comando, la suite `pnpm vitest run app/proyecto components/ui` y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 3: Interruptor "Sitio en inglés"

**Files:**
- Modify:
  - `supabase/schema.sql`;
  - `types/database.ts`, `types/index.ts` (`Project.locales: Locale[]`);
  - `data/project-repository.ts` (`mapProject`);
  - `app/admin/(authenticated)/(project)/settings/page.tsx` (sección "Visibilidad del sitio").
- Create: `app/api/admin/project/idiomas/route.ts`, `lib/i18n/project-locales.ts`
- Test: `app/api/admin/project/idiomas/route.test.ts`, `lib/i18n/project-locales.test.ts`

**Interfaces:**
- Produces:
  - `parseLocales(raw: unknown): Locale[]`: siempre incluye `'es'` primero, ignora valores desconocidos y repetidos;
  - `PATCH /api/admin/project/idiomas` con `{ ingles: boolean }`, que responde `{ locales }`.
- [ ] **Step 1: Tests que fallan.**
  - **`parseLocales`:**
    - `null` → `['es']`;
    - `['en','es','fr','en']` → `['es','en']`;
    - `'en'` (no array) → `['es']`.
  - **Ruta:**
    - sin proyecto → 404;
    - editor o gestor → 401 (pide `minRole: 'administrador'`);
    - `{ ingles: true }` guarda `locales: ['es','en']` y revalida el sitio (`revalidateProjectById`);
    - `{ ingles: false }` guarda `['es']`;
    - cuerpo inválido → 400.
- [ ] **Step 2: Run** `pnpm vitest run lib/i18n/project-locales.test.ts app/api/admin/project/idiomas`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - **SQL:**
    - `alter table projects add column if not exists locales text[] not null default '{es}';`
    - `alter table projects drop constraint if exists projects_locales_check;`
    - `alter table projects add constraint projects_locales_check check (locales <@ array['es','en']::text[] and 'es' = any(locales));`
  - `mapProject`: `locales: parseLocales(row.locales)`.
  - **Panel:**
    - en "Visibilidad del sitio", interruptor "Sitio en inglés" con la línea "Tu sitio también en inglés, en /en. Los textos que cargaste se traducen solos más adelante.";
    - solo lo ve administrador+, como el resto de esa sección (verificar cómo la página decide el rol);
    - guarda con PATCH a la ruta nueva y vuelve atrás si falla.
- [ ] **Step 4: Run** el mismo comando y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 4: Selector, metadata con hreflang y sitemap

**Files:**
- Create: `lib/i18n/alternates.ts`, `components/i18n/LanguageSwitcher.tsx`
- Modify:
  - `components/ui/Navbar.tsx`, `components/ui/ProjectMenu.tsx`: el selector;
  - `generateMetadata` de las 11 rutas de `app/proyecto/[slug]/**` (lista en el spec y en la exploración: `page`, `unidades`, `amenities`, `masterplan`, `recorrido`, `ubicacion`, `edificio/[buildingId]`, `edificio/[buildingId]/recorrido`, `edificio/[buildingId]/unidad/[unitId]`, `layout`): textos con `getT()`, más `alternates`;
  - `app/sitemap.ts`.
- Test: `lib/i18n/alternates.test.ts`, `components/i18n/LanguageSwitcher.test.tsx`, `app/sitemap.test.ts` (crear si no existe)

**Interfaces:**
- Produces:

```ts
// alternates.ts
export async function alternatesFor(slug: string, subpath: string, locales: Locale[], actual: Locale):
  Promise<{ canonical: string; languages?: Record<string, string> }>;
// con ['es','en']: canonical = versión de `actual`; languages = { es, en, 'x-default': es }; con ['es']: sin languages.
export function hrefOtroIdioma(pathname: string, search: string, basePathSinIdioma: string, a: Locale): string;
// LanguageSwitcher: muestra "ES / EN" solo si useLocale().disponibles.length > 1
```

- [ ] **Step 1: Tests que fallan.**
  - **`alternatesFor`:**
    - con dominio raíz (`projectCanonical` mockeado), `('torre','/unidades',['es','en'],'en')` → canonical `…/proyecto/torre/en/unidades`, languages `es` → `…/proyecto/torre/unidades`, `en` → `…/en/unidades`, `x-default` = es;
    - con `['es']` no hay `languages`.
  - **`hrefOtroIdioma`:**
    - `('/proyecto/torre/en/unidades', '?ref=perez&tipo=2%20dormitorios', '/proyecto/torre', 'es')` → `/proyecto/torre/unidades?ref=perez&tipo=2%20dormitorios`;
    - al revés, agrega `/en`;
    - en subdominio con `basePathSinIdioma ''` → `/en/unidades`.
  - **`LanguageSwitcher` (jsdom):**
    - con `disponibles ['es']` no renderiza nada;
    - con `['es','en']` muestra dos links, con `aria-current` en el actual y `hreflang` en cada uno.
  - **`sitemap`:** un proyecto con `locales ['es','en']` suma las mismas rutas con `/en`; con `['es']` no.
- [ ] **Step 2: Run** `pnpm vitest run lib/i18n/alternates.test.ts components/i18n app/sitemap.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - En las `generateMetadata`:
    - títulos y descripciones por defecto pasan por `getT()`;
    - `alternates: await alternatesFor(...)`;
    - `openGraph.locale` es `es_AR` o `en_US`.
  - El selector va en la barra (escritorio) y en el menú (celular).
- [ ] **Step 4: Run** el mismo comando y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 5: Listas y formatos de `lib/` con idioma

**Files:**
- Modify:
  - `lib/project-types.ts`: unitLabel, buildingLabel, aerialLabel y concordancias. Agregar `getProjectTypeConfig(type, saleMode, locale = 'es')` o un `labels(locale)` y mantener los llamados de hoy;
  - `lib/units.ts`: `getStatusLabel`, `UNIT_CATEGORY_LABEL`, `CATEGORY_SHORT`, `unitTypeLabel`, `pluralize`, `ROOM_KIND_LABEL`, etiquetas de `ROOM_FEATURES_BY_KIND`, `UNIT_FEATURE_GROUPS`, `UNIT_CONDITION_OPTIONS`, `cocheraLabel`;
  - `lib/floor-views.ts` (`DIRECTION_LABEL` y códigos cortos: en inglés N/NE/E/SE/S/SW/W/NW), `lib/floorKinds.ts`, `lib/poiCategories.tsx`, `lib/amenities.ts`;
  - `lib/financing.ts` (`INDEX_LABEL`, formatos);
  - `lib/construction-progress.ts` (`MONTHS`, `formatUpdateDate`) y `lib/construction-progress-view.ts` (`progressHeadline`: parsea el castellano y arma el texto en el idioma);
  - `lib/relativeTime.ts`, `lib/project-nav.ts`.
- Create: `lib/i18n/catalogo.ts`. Muestra un valor de catálogo guardado en castellano (`units.type`, `features`, características de ambientes) en el idioma pedido; un valor desconocido sale tal cual.
- Test: los `.test.ts` existentes de cada módulo, más `lib/i18n/catalogo.test.ts`

**Interfaces:**
- Produces:
  - cada función de etiqueta acepta un último parámetro `locale: Locale = 'es'`. Los llamados de hoy no cambian.
  - `etiquetaCatalogo(valor: string, locale: Locale): string`.
- [ ] **Step 1: Tests que fallan.**
  - **Estados:** `getStatusLabel('available','en') === 'Available'` (y reserved/sold).
  - **Plural:** `pluralize('unidad', 'en')` da el plural inglés del label del tipo. Cubrir los tipos de `project-types` (Unit/Units, Lot/Lots, House/Houses, Stage/Stages, Space/Spaces).
  - **Orientación:** `DIRECTION_LABEL` en inglés: `'NO'` → "Northwest".
  - **Catálogo:**
    - `etiquetaCatalogo('2 dormitorios','en') === '2 bedrooms'`;
    - una característica conocida del catálogo da su versión en inglés;
    - `'Algo inventado'` queda igual.
  - **Avance de obra:** `formatUpdateDate('2026-11-05','en')` en inglés (por ejemplo "Nov 5, 2026"); `progressHeadline` con `deliveryEstimate 'Diciembre 2027'` en `en` dice "December 2027".
  - **Tiempo relativo:** en inglés.
  - **Castellano sin cambios:** todos los tests existentes siguen pasando sin tocarlos.
- [ ] **Step 2: Run** `pnpm vitest run lib`. Expected: FAIL en los nuevos.
- [ ] **Step 3: Implementar.** Las etiquetas viven en el diccionario de Task 1, y las funciones las leen con `crearT(locale)`.
- [ ] **Step 4: Run** `pnpm vitest run lib` y `pnpm tsc --noEmit -p .`. Expected: PASS y los existentes verdes.

### Task 6: Guardián de texto fijo + barra, menú, portada y páginas

**Files:**
- Create: `lib/i18n/sin-texto-fijo.test.ts`
- Modify:
  - `components/ui/Navbar.tsx`, `ProjectMenu.tsx`, `ProjectChrome.tsx`, `ExploreSwitcher.tsx`, `LeadCaptureModal.tsx`, `MortgageCalculatorModal.tsx`, `ShareMenu.tsx`;
  - `components/project-landing/**`, `components/HomeContactForm.tsx`, `app/proyecto/**` (textos de las páginas y `not-found`).

**Interfaces:**
- Consumes: Task 1 (`useT`, `getT`, `intlLocale`), Task 5.
- Produces: `ARCHIVOS_MIGRADOS: string[]` (globs) en el test guardián. Cada tarea siguiente le agrega sus carpetas.
- [ ] **Step 1: Test guardián que falla.**
  - Lee los `.tsx` (sin tests) de `ARCHIVOS_MIGRADOS` y falla, indicando archivo y línea, si encuentra:
    - texto JSX con letras (`>…letras…<`, fuera de `{}`);
    - atributos literales `aria-label`, `placeholder`, `alt`, `title` o `label` con letras.
  - Lista corta de permitidos para lo que es igual en los dos idiomas (`WhatsApp`, `360°`, `m²`, `3D`, `BIM`, `ES`, `EN`, símbolos).
  - Agregar las carpetas de esta tarea.
- [ ] **Step 2: Run** `pnpm vitest run lib/i18n/sin-texto-fijo.test.ts`. Expected: FAIL con la lista de textos fijos.
- [ ] **Step 3: Implementar.**
  - Pasar cada texto al diccionario (`es` igual a hoy, `en` traducido): componentes cliente con `useT()`, servidor con `getT()`.
  - Números y fechas con `intlLocale(locale)`.
  - Mensajes por defecto de los formularios en el idioma de la página. El texto al equipo (emails, avisos) no cambia.
- [ ] **Step 4: Run** el guardián, `pnpm vitest run components app/proyecto` (los tests existentes siguen verdes, en castellano) y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 7: Lista de unidades y plano de piso

**Files:**
- Modify: `components/units/**`, `components/floorplan/**`, `lib/floor-explorer.ts` (`localeCompare` con el locale)
- Test: el guardián (agregar las carpetas) y `components/units/UnitsListView` (test nuevo o existente)

- [ ] **Step 1: Tests que fallan.**
  - El guardián con las carpetas de esta tarea.
  - **Filtro en inglés:** en `/en/unidades?tipo=2 dormitorios`:
    - la lista de unidades (render con `LocaleProvider 'en'`) filtra igual que en castellano;
    - el chip o selector muestra "2 bedrooms";
    - al cambiar el filtro, la URL sigue usando el valor en castellano.
- [ ] **Step 2: Run** `pnpm vitest run lib/i18n/sin-texto-fijo.test.ts components/units components/floorplan`. Expected: FAIL.
- [ ] **Step 3: Implementar** como en Task 6. Las etiquetas de tipo y características salen de `etiquetaCatalogo`.
- [ ] **Step 4: Run** el mismo comando y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 8: Ficha de la unidad en el sitio

**Files:**
- Modify: `components/unit/**`, incluidas las pestañas.
- Test: el guardián (agregar `components/unit`).

- [ ] **Step 1:** Agregar `components/unit` al guardián. **Run** el guardián. Expected: FAIL con la lista.
- [ ] **Step 2: Implementar** como en Task 6:
  - incluye "Descargar ficha", la comparación, el visor de planos y la vista por piso ("Vista al Norte desde Piso 3" → "North view from Floor 3");
  - el link de la ficha PDF todavía no lleva el idioma (es Etapa 3).
- [ ] **Step 3: Run** el guardián, `pnpm vitest run components/unit` y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 9: El resto del sitio

**Files:**
- Modify:
  - `components/amenities/**`, `components/aerial/**`, `components/location/**`, `components/masterplan/**`;
  - `components/tour/**`, `components/financing/**`, `components/bim/**`, `components/Calculator.tsx`;
  - `components/project-landing/calculator-models.ts` (formatos), `components/chat/ChatWidget.tsx`.
- Test: el guardián (agregar las carpetas).

- [ ] **Step 1:** Agregar las carpetas al guardián. **Run.** Expected: FAIL.
- [ ] **Step 2: Implementar** como en Task 6.
  - En el chat, solo los textos de la burbuja: saludo, sugerencias, avisos, etiquetas. Que el bot responda en inglés es de la Etapa 3.
  - Los textos del chat ya tienen tests con texto en castellano; esos tests no cambian.
- [ ] **Step 3: Run** el guardián, `pnpm vitest run components` y `pnpm tsc --noEmit -p .`. Expected: PASS.

### Task 10: Verificación

- [ ] **Step 1:** Run `pnpm vitest run > <workspace>/suite.log 2>&1; tail -5 <workspace>/suite.log`. Expected: todo verde.
- [ ] **Step 2:** Run `pnpm tsc --noEmit -p .` y `pnpm lint`. Expected: 0 errores; los 31 avisos de antes.
- [ ] **Step 3:** Run `pnpm build`. Expected: OK.
- [ ] **Step 4: Servidor local, sin escribir en la base.**
  - `/proyecto/demo` igual que antes.
  - `/proyecto/demo/en` → 404 mientras el demo no tenga el inglés activado; activarlo escribe en producción, así que lo hace el usuario.
  - Si el navegador de DevTools está libre, revisar con un proyecto de prueba: la portada, las unidades y una unidad en inglés, con el selector, en escritorio y celular. Bloquear antes los envíos a `/api/track`.
- [ ] **Step 5:** Memoria `multi-idioma.md` y su puntero en `MEMORY.md`.
