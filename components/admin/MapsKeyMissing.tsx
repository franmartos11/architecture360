// Aviso cuando falta la clave pública de Google Maps — los mapas del admin
// son solo Google (sin fallback a OpenStreetMap). El buscador de lugares
// sigue andando porque usa la clave del servidor.
export default function MapsKeyMissing() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-sm text-gray-500 px-4 text-center">
      Falta configurar la clave de Google Maps (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
    </div>
  );
}
