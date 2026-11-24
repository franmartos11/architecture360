# Puntos de interés desde Google + mapas solo Google — diseño corto

## Por qué
Cargar el entorno de un proyecto es incómodo: cada punto se crea por nombre y
después hay que encontrarlo a mano en un mapa de OpenStreetMap. El buscador
de direcciones (Nominatim) casi no encuentra comercios ni direcciones en
Argentina. Se quiere buscar el lugar en Google, elegirlo y que el punto
quede creado solo. De paso, el admin pasa a usar únicamente Google Maps.

## Qué cambia
1. **Buscador de lugares en Ubicación/entorno** (reemplaza el campo
   "Nombre del punto…" de [LocationEditor](../../../components/admin/section-editors/LocationEditor.tsx)):
   - El texto que escribís ("colegio", "Farmacia Del Pueblo") se manda a la
     ruta nueva `GET /api/admin/places-search?q=&lat=&lng=`.
   - Esa ruta es un proxy server-side a **Places API (New) Text Search**
     con `GOOGLE_MAPS_API_KEY`, con sesgo de ubicación hacia el proyecto
     (radio de 5 km) y `pageSize` 10. Devuelve nombre, dirección,
     coordenadas, `placeId` y la categoría sugerida.
   - Se muestra una lista de resultados con la distancia al proyecto y un
     botón **+ Agregar** en cada uno. Al agregar, se hace un POST al endpoint
     actual de POIs con el nombre, la categoría sugerida y las coordenadas.
     El punto ya queda en el mapa.
   - Los resultados que coinciden con un punto ya cargado (mismo nombre y a
     menos de 50 m) se muestran como "Ya agregado", sin botón.
   - Se puede seguir creando un punto a mano: el enlace "crear sin buscar"
     mantiene el flujo actual de nombre + click en el mapa.
2. **Categoría sugerida** según los `types` de Google: escuela/universidad →
   colegio; hospital/farmacia/médico/dentista → salud;
   supermercado/tienda/shopping → comercio; estaciones/paradas → transporte;
   parque/gimnasio/club/estadio → entretenimiento; el resto → otro. Se puede
   cambiar en la ficha como siempre.
3. **Tiempos automáticos** del punto recién agregado:
   `calculate-travel-times` acepta `poiIds` opcional y, si viene, calcula
   solo esos puntos y solo los que no tienen tiempos. Nunca pisa tiempos
   cargados a mano. El botón actual sigue igual.
4. **Mapas del admin solo con Google**:
   - El mapa de entorno (`LocationOverviewMap`) se reescribe con la Maps
     JavaScript API (pines de color numerados, marcador "AQUÍ", ajuste para
     ver todos, click en el mapa para ubicar). Se suma pin arrastrable para
     corregir el punto seleccionado.
   - El picker de la ubicación del proyecto usa siempre
     `GoogleLocationPickerMap`, y su buscador pasa a usar la misma ruta de
     Places en lugar de Nominatim.
   - Se borran `LocationPickerMap` (leaflet), `/api/admin/geocode`, las
     dependencias `leaflet`/`react-leaflet`/`@types/leaflet` y
     `public/leaflet`.
   - Sin `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, el mapa muestra un aviso
     ("falta configurar la clave de Google Maps") en lugar de caer a OSM.
     El buscador y el alta de puntos siguen funcionando, porque usan la
     clave del servidor.

## Fuera de alcance
- Sugerir lugares cercanos por categoría de forma automática (opción C;
  queda para después si hace falta).
- Fotos de Google Places en los puntos.
- Cambios en el sitio público, que ya usa Google.

## Límites y costo
- Text Search (New) con esos campos se factura en el SKU Pro, con cuota
  gratuita mensual. La ruta tiene rate limit por usuario (30 búsquedas/min)
  y el cliente espera 400 ms entre teclas antes de buscar.
- Requiere tener habilitada **Places API (New)** en el proyecto de Google de
  `GOOGLE_MAPS_API_KEY`, y la clave pública con **Maps JavaScript API** para
  los mapas.

## Enfoques considerados
- A. Autocompletado en el navegador: descartado porque agrega de a uno y
  depende de la clave pública con Places.
- **B. Lista de resultados vía servidor: elegido.**
- C. B + "sugerir cercanos": se deja para más adelante.
