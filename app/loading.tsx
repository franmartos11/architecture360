// Carga de una ruta (Suspense del root). Antes era un cartel blanco a
// pantalla completa con spinner y "CARGANDO" pulsando: tapaba la barra del
// proyecto en una carga fría y se veía genérico. Ahora es lo mínimo que
// dice "está viniendo" sin asumir nada del proyecto (en el root no hay
// tema): una línea fina arriba de todo — la misma idea que la de
// html[data-nav-pending] — sobre el fondo neutro del sitio, y un
// "Cargando" chico que aparece recién a los 300 ms, para que en las cargas
// rápidas no parpadee nada. Estilos en app/globals.css (.route-loading).
export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <div className="route-loading__bar" aria-hidden="true" />
      <p className="route-loading__label">Cargando</p>
    </div>
  );
}
