# Puntos de interés desde Google + mapas solo Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En Ubicación/entorno se busca un lugar en Google, se elige de una lista y el punto de interés queda creado con coordenadas, categoría sugerida y tiempos de viaje. Todos los mapas del admin pasan a Google.

**Architecture:** Una ruta server-side `GET /api/admin/places-search` hace de proxy a Places API (New) Text Search con `GOOGLE_MAPS_API_KEY`. Las funciones puras de mapeo, distancia y duplicados viven en `lib/google-places.ts`. El mapa de entorno se reescribe sobre el loader propio (`lib/google-maps-loader.ts`), que ya usa el picker de Google. Leaflet, Nominatim y `/api/admin/geocode` se eliminan.

**Tech Stack:** Next.js (App Router), React, Vitest (+ RTL/jsdom por archivo), Supabase, Google Places API (New), Google Maps JS API.

**Spec:** `docs/superpowers/specs/2026-11-24-poi-busqueda-google-design.md`

## Global Constraints

- No hacer commits ni push sin pedido explícito del usuario (preferencia guardada). Los pasos "Commit" de este plan quedan como **"dejar listo para commit"**: correr los tests y no commitear.
- Trabajar directo en `main` de my-app; no usar worktrees ni ramas.
- Clave del servidor: `GOOGLE_MAPS_API_KEY` (Places + Distance Matrix). Clave pública: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (solo Maps JS).
- Sesgo de búsqueda: círculo de **5000 m** alrededor del proyecto. `pageSize` **10**, `languageCode` `es`, `regionCode` `AR`.
- Rate limit de la búsqueda: **30 por minuto por usuario**, clave `places-search:user:<id>`.
- Debounce del cliente: **400 ms**, y un mínimo de 3 caracteres para buscar.
- "Ya agregado" = mismo nombre normalizado (minúsculas, sin tildes, espacios colapsados) **y** a menos de **50 m**.
- Los tiempos automáticos nunca pisan tiempos cargados: solo se calculan para POIs con `drive_minutes`, `walk_minutes` y `bike_minutes` los tres en null.
- Sin `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, el mapa muestra "Falta configurar la clave de Google Maps (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)." y nunca cae a OSM.
- Copy en español rioplatense, igual que el resto del admin.
- Pruebas en navegador: la Supabase es compartida. Buscar está bien; **agregar o borrar puntos solo con el OK del usuario** y borrando lo creado al terminar.

## Review Focus

1. **Proyecto sin coordenadas:** la búsqueda funciona sin sesgo, no muestra distancia y no intenta calcular tiempos. → Task 2 (test "sin lat/lng: sin locationBias"), Task 5 (sin `projectCenter` no se llama a calculate).
2. **Google responde error (API no habilitada, cuota):** la UI muestra el error y no "Sin resultados". → Task 2 (test "Google 403: 502 con mensaje").
3. **Doble click en "+ Agregar":** no crea el punto dos veces. → Task 5 (test "botón deshabilitado mientras agrega").
4. **Lugar con nombre igual pero lejos (cadena de farmacias):** no se marca como ya agregado. → Task 1 (test de los 50 m).
5. **lat/lng inválidos en la query (`lat=abc`):** se ignora el sesgo y no se manda NaN a Google. → Task 2.

---

### Task 1: Funciones puras de Places

**Files:**
- Create: `lib/google-places.ts`
- Test: `lib/google-places.test.ts`

**Interfaces:**
- Produces:
  - `type PlaceResult = { placeId: string; name: string; address: string; lat: number; lng: number; category: PoiCategory }`
  - `categoryFromGoogleTypes(types: string[] | undefined): PoiCategory`
  - `distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number` (haversine)
  - `formatDistance(m: number): string` → `"350 m"` o `"1,2 km"` (≥ 1000 m, un decimal y coma)
  - `isAlreadyAdded(place: { name: string; lat: number; lng: number }, pois: { name: string; latitude: number | null; longitude: number | null }[]): boolean`

Mapeo (el primer match gana, en este orden):
- colegio: `school, primary_school, secondary_school, preschool, university, educational_institution`
- salud: `hospital, doctor, pharmacy, drugstore, dentist, dental_clinic, medical_lab, physiotherapist`
- transporte: `bus_station, bus_stop, train_station, subway_station, transit_station, light_rail_station, airport, taxi_stand`
- comercio: `supermarket, grocery_store, shopping_mall, store, convenience_store, department_store, bakery, market`
- entretenimiento: `park, gym, sports_club, stadium, sports_complex, movie_theater, amusement_park, night_club, tourist_attraction`
- en cualquier otro caso: `otro`

- [ ] **Step 1: Write the failing tests**

```ts
describe('categoryFromGoogleTypes', () => {
  it('colegio', () => expect(categoryFromGoogleTypes(['primary_school','school','point_of_interest'])).toBe('colegio'));
  it('farmacia → salud', () => expect(categoryFromGoogleTypes(['pharmacy','store'])).toBe('salud')); // salud antes que comercio
  it('supermercado → comercio', () => expect(categoryFromGoogleTypes(['supermarket'])).toBe('comercio'));
  it('parada → transporte', () => expect(categoryFromGoogleTypes(['bus_stop'])).toBe('transporte'));
  it('parque → entretenimiento', () => expect(categoryFromGoogleTypes(['park'])).toBe('entretenimiento'));
  it('desconocido / undefined → otro', () => {
    expect(categoryFromGoogleTypes(['establishment'])).toBe('otro');
    expect(categoryFromGoogleTypes(undefined)).toBe('otro');
  });
});
describe('distanceMeters / formatDistance', () => {
  it('~1 km entre dos puntos de Córdoba', () => {
    const d = distanceMeters({ lat: -31.4201, lng: -64.1888 }, { lat: -31.4111, lng: -64.1888 });
    expect(d).toBeGreaterThan(990); expect(d).toBeLessThan(1010);
  });
  it('formatea', () => { expect(formatDistance(349.6)).toBe('350 m'); expect(formatDistance(1234)).toBe('1,2 km'); });
});
describe('isAlreadyAdded', () => {
  const pois = [{ name: 'Colegio Nuestra Señora del Huerto', latitude: -31.41785, longitude: -64.18935 }];
  it('mismo nombre sin tildes/mayúsculas y a <50 m → true', () =>
    expect(isAlreadyAdded({ name: 'colegio nuestra senora del  huerto', lat: -31.4179, lng: -64.1894 }, pois)).toBe(true));
  it('mismo nombre pero a 2 km → false', () =>
    expect(isAlreadyAdded({ name: 'Colegio Nuestra Señora del Huerto', lat: -31.4358, lng: -64.1894 }, pois)).toBe(false));
  it('POI sin coordenadas nunca matchea', () =>
    expect(isAlreadyAdded({ name: 'X', lat: 0, lng: 0 }, [{ name: 'X', latitude: null, longitude: null }])).toBe(false));
});
```

- [ ] **Step 2:** Run `npx vitest run lib/google-places.test.ts`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar las 4 funciones y el tipo en `lib/google-places.ts`. Para normalizar: `normalize('NFD')`, quitar `\p{Diacritic}`, pasar a minúsculas, `trim` y colapsar espacios.
- [ ] **Step 4:** Run `npx vitest run lib/google-places.test.ts`. Expected: PASS.
- [ ] **Step 5:** Dejar listo para commit (no commitear).

---

### Task 2: Ruta `GET /api/admin/places-search`

**Files:**
- Create: `app/api/admin/places-search/route.ts`
- Test: `app/api/admin/places-search/route.test.ts` (copiar el patrón de mocks de `app/api/admin/geocode/route.test.ts`)

**Interfaces:**
- Consumes: `PlaceResult`, `categoryFromGoogleTypes` (Task 1); `requireAdminUser`; `rateLimitOrRespond`.
- Produces: `GET ?q=<texto>&lat=<num>&lng=<num>` →
  - `200 { results: PlaceResult[] }`
  - `401` sin sesión
  - `500 { error: 'GOOGLE_MAPS_API_KEY no configurada.' }`
  - `502 { results: [], error: 'Google Places respondió un error (<status>). Revisá que Places API (New) esté habilitada.' }`
  - el 429 de `rateLimitOrRespond`, sin cambios

Request a Google: `POST https://places.googleapis.com/v1/places:searchText` con los headers `X-Goog-Api-Key` y `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.types`. Body: `{ textQuery, pageSize: 10, languageCode: 'es', regionCode: 'AR', locationBias?: { circle: { center: { latitude, longitude }, radius: 5000 } } }`. La clave se lee **dentro del handler** (no a nivel de módulo) para evitar el `resetModules` de los tests de travel-times. `q` se recorta a 200 caracteres. Las places sin `location` se descartan.

- [ ] **Step 1: Write the failing tests:** `sin sesión: 401`; `q vacío: [] sin rate-limit ni fetch`; `rate-limit: devuelve su 429 sin fetch` (y verificar que se llamó con `{ key: 'places-search:user:user-1', windowSeconds: 60, max: 30 }`); `sin GOOGLE_MAPS_API_KEY: 500`; `mapea la respuesta` (un fixture con 2 places, uno sin location → `results` tiene 1 elemento `{ placeId, name, address, lat, lng, category: 'colegio' }`); `con lat/lng manda locationBias radius 5000` (parsear `JSON.parse(fetch.mock.calls[0][1].body)`); `sin lat/lng o lat=abc: sin locationBias`; `Google 403: 502 con mensaje y results []`.
- [ ] **Step 2:** Run `npx vitest run app/api/admin/places-search`. Expected: FAIL.
- [ ] **Step 3:** Implementar `GET(request: Request): Promise<Response>`.
- [ ] **Step 4:** Run `npx vitest run app/api/admin/places-search`. Expected: PASS.
- [ ] **Step 5:** Dejar listo para commit.

---

### Task 3: `calculate-travel-times` por POI

**Files:**
- Modify: `app/api/admin/calculate-travel-times/route.ts`
- Test: `app/api/admin/calculate-travel-times/route.test.ts` (agregar casos y mantener los existentes en verde)

**Interfaces:**
- Produces: body `{ projectId: string; poiIds?: string[] }`. La respuesta suma `times: { id: string; drive_minutes: number | null; walk_minutes: number | null; bike_minutes: number | null }[]`, además de `updated`.
  - Sin `poiIds`: el comportamiento actual no cambia (todos los POIs con coordenadas, rate limit `calculate-travel-times:user:<id>` 5/300 s).
  - Con `poiIds` (array no vacío de strings): filtra a esos ids, que además tengan coordenadas y los tres tiempos en null. Usa el rate limit `calculate-travel-times-poi:user:<id>` con `windowSeconds: 300, max: 60`. `poiIds` que no es array de strings → 400.

- [ ] **Step 1: Write the failing tests:** `poiIds: solo calcula esos y no los que ya tienen tiempos` (dos POIs en la lista, uno con `drive_minutes: 7` → la Distance Matrix recibe 1 destino y `updated: 1`); `poiIds usa el rate limit por POI` (asertar la key y `max: 60`); `poiIds inválido → 400`; `devuelve times`.
- [ ] **Step 2:** Run `npx vitest run app/api/admin/calculate-travel-times`. Expected: los nuevos FAIL y los viejos PASS.
- [ ] **Step 3:** Implementar. El select de POIs pasa a `id, latitude, longitude, drive_minutes, walk_minutes, bike_minutes`.
- [ ] **Step 4:** Run `npx vitest run app/api/admin/calculate-travel-times`. Expected: todo PASS.
- [ ] **Step 5:** Dejar listo para commit.

---

### Task 4: Mapa de entorno en Google

**Files:**
- Modify: `lib/google-maps-loader.ts` (ampliar los tipos mínimos)
- Create: `components/admin/MapsKeyMissing.tsx`
- Rewrite: `components/admin/LocationOverviewMap.tsx` (sin leaflet, con la misma ruta de import)
- Modify: `components/admin/GoogleLocationPickerMap.tsx` (sin key → `<MapsKeyMissing />`)

**Interfaces:**
- Produces:
  - `MapsKeyMissing(): JSX.Element`, que muestra el copy fijado en Global Constraints, centrado sobre `bg-gray-100`.
  - `LocationOverviewMap` mantiene sus props actuales (`center, pois, selectedId, onSelectMarker, onMapClick, fitToken`) y suma `onMoveMarker?: (id: string, lat: number, lng: number) => void`. Solo el pin seleccionado es `draggable` y, en `dragend`, llama a `onMoveMarker`. `OverviewPoi` sigue exportado igual.
- Loader: agregar a los tipos `Map.fitBounds(bounds, padding?)`, `Map.getZoom()`, `LatLngBounds` (constructor + `extend`), `Marker` con `icon`, `label`, `title`, `zIndex`, `setIcon`, `setLabel`, `setDraggable`, `setZIndex`, el evento `'click'`, y `Point` y `SymbolPath`. Solo lo que se use.
- Pines: `Marker` con un `icon` SVG tipo gota (`path`, `fillColor` = `POI_CATEGORY_COLORS[cat]`, `fillOpacity: 1`, `strokeColor: '#fff'`, `strokeWeight: 2`, `scale` mayor si está seleccionado, `anchor` en la punta, `labelOrigin` en el centro) y `label: { text: String(i+1), color: '#fff', fontSize: '11px', fontWeight: '600' }`. `title` = nombre del POI (tooltip). Proyecto: `SymbolPath.CIRCLE` negro `#101828` con borde blanco, label `AQUÍ` 9px y `zIndex` más alto.
- Fit: en el montaje y con cada cambio de `fitToken`, si hay un solo punto se hace `setCenter` + zoom 15; si hay más, `fitBounds` con padding 48. Hay que limitar el zoom a 15 (con un listener `idle` una sola vez, si `getZoom() > 15`).
- Markers sincronizados por id en un `Map<string, GMarker>`: crear, actualizar y quitar sin reconstruir el mapa en cada render.
- Opciones del mapa: `disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: 'greedy'`.

- [ ] **Step 1:** Implementar el loader, `MapsKeyMissing` y `LocationOverviewMap`.
- [ ] **Step 2:** Run `npx tsc --noEmit`. Expected: sin errores nuevos.
- [ ] **Step 3:** Verificación manual en `npm run dev` → `/admin/proyecto/entorno` (después del Task 5 se prueba junto): pines de color numerados, "AQUÍ", "Ver todos en el mapa" ajusta, click en un pin abre su ficha.
- [ ] **Step 4:** Dejar listo para commit.

---

### Task 5: Buscador de lugares en LocationEditor

**Files:**
- Create: `components/admin/PlaceSearchPanel.tsx`
- Test: `components/admin/PlaceSearchPanel.test.tsx` (`// @vitest-environment jsdom`)
- Modify: `components/admin/section-editors/LocationEditor.tsx`

**Interfaces:**
- Consumes: `PlaceResult`, `distanceMeters`, `formatDistance`, `isAlreadyAdded` (Task 1); la ruta del Task 2; `times` del Task 3; `onMoveMarker` del Task 4.
- Produces: `PlaceSearchPanel(props: { center: { lat: number; lng: number } | null; pois: { name: string; latitude: number | null; longitude: number | null }[]; onAdd: (p: PlaceResult) => Promise<void> })`
  - Input con placeholder `Buscar en Google: "colegio", "Farmacia Del Pueblo"…`, debounce de 400 ms y mínimo 3 caracteres. Hace fetch a `/api/admin/places-search?q=…&lat=…&lng=…` (lat/lng solo si hay `center`).
  - Cada resultado muestra nombre, dirección (truncada), distancia (si hay `center`), un chip de categoría con su color y el botón **+ Agregar**. Si `isAlreadyAdded`, muestra un chip "Ya agregado" en lugar del botón. Mientras `onAdd` está en curso, el botón de ese resultado queda deshabilitado con el texto "Agregando…".
  - Estados: "Buscando…", "Sin resultados en Google para «q».", y el `error` de la ruta si viene.
- LocationEditor:
  - La cabecera del panel derecho pasa a ser `PlaceSearchPanel`. Debajo va el enlace "Crear un punto sin buscar", que muestra la fila actual de nombre + categoría + "+" (el flujo de click en el mapa se mantiene).
  - `handleAddPlace(p: PlaceResult)`: hace POST a `/api/admin/points-of-interest` con `{ name: p.name, category: p.category, latitude: p.lat, longitude: p.lng, sortOrder: pois.length }`. Lo agrega a `pois` y lo selecciona sin `awaitingPlacement`. Si hay `projectCenter && projectId`, hace POST a calculate-travel-times con `{ projectId, poiIds: [id] }` y aplica `times` al estado. Si eso falla, no muestra un toast de error: el punto ya quedó creado y el botón "Calcular tiempos" sigue disponible. Al final muestra el toast `«<nombre>» agregado.` y llama a `onSaved?.()`.
  - `onMoveMarker`: PATCH de lat/lng igual que en `handleMapClick`. Si el POI tenía tiempos, se avisa con un toast que conviene recalcular (no se recalcula solo, para no pisar tiempos cargados).
  - Copy del badge del mapa: "Buscá un lugar a la derecha, o seleccioná un punto y hacé click en el mapa para ubicarlo".

- [ ] **Step 1: Write the failing tests** (fetch stubbeado y fake timers): `no busca con menos de 3 caracteres`; `busca con debounce y manda lat/lng del center`; `muestra "Ya agregado" para un POI existente cercano`; `botón deshabilitado mientras agrega` (un `onAdd` que no resuelve → un segundo click no lo vuelve a llamar); `muestra el error de la ruta`.
- [ ] **Step 2:** Run `npx vitest run components/admin/PlaceSearchPanel.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implementar `PlaceSearchPanel` y los cambios en `LocationEditor`.
- [ ] **Step 4:** Run `npx vitest run components/admin/PlaceSearchPanel.test.tsx`. Expected: PASS.
- [ ] **Step 5:** Dejar listo para commit.

---

### Task 6: Ubicación del proyecto con Google y limpieza de leaflet

**Files:**
- Modify: `components/admin/LocationPicker.tsx` (siempre `GoogleLocationPickerMap`; el buscador usa `/api/admin/places-search` con el sesgo de `fallbackCenter`, mostrando `name — address` como label)
- Delete: `components/admin/LocationPickerMap.tsx`, `app/api/admin/geocode/route.ts`, `app/api/admin/geocode/route.test.ts`, `public/leaflet/`
- Modify: `package.json` / lockfile (`npm uninstall leaflet react-leaflet @types/leaflet`)
- Modify: `.env.local.example` (actualizar el comentario de Google: la clave del servidor necesita Places API (New) + Distance Matrix; la pública, Maps JS restringida por dominio)

- [ ] **Step 1:** Aplicar los cambios.
- [ ] **Step 2:** Run `grep -rniE "leaflet|nominatim|/api/admin/geocode" app components lib package.json`. Expected: sin resultados.
- [ ] **Step 3:** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: todo en verde.
- [ ] **Step 4:** Run `npm run build`. Expected: build OK.
- [ ] **Step 5:** Dejar listo para commit.

---

### Task 7: Verificación en el navegador

- [ ] **Step 1:** Con `npm run dev`, abrir `/admin/proyecto/entorno` en un proyecto con coordenadas. Buscar "colegio" y verificar que hay resultados cercanos con distancia y categoría Colegio, y que los ya cargados aparecen como "Ya agregado".
- [ ] **Step 2:** **Pedirle OK al usuario** antes de agregar un punto (la Supabase es compartida). Con el OK, agregar uno y verificar el pin numerado, la ficha abierta y los tiempos auto/caminando/bici cargados. Después, borrarlo.
- [ ] **Step 3:** En la ubicación del proyecto (picker de arriba), buscar una dirección y verificar que el mapa de Google se mueve al resultado. **No guardar.**
- [ ] **Step 4:** Revisar la consola: sin errores de Google Maps (`RefererNotAllowedMapError`, `ApiNotActivatedMapError`).
