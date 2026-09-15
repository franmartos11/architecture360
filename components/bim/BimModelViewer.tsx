'use client';

import { useEffect } from 'react';

// El visor 3D de Google para archivos GLB/glTF — un web component que se
// registra con un import side-effect. Se carga lazy (solo en el browser)
// para no romper SSR, donde `customElements` no existe.
//
// Props mínimas: `src` (URL del .glb) y `alt` (accesibilidad). `poster`
// es la imagen que se muestra mientras el modelo carga (la coverImage de
// la pieza BIM), así el usuario no ve un canvas negro.

interface BimModelViewerProps {
  src: string;
  alt: string;
  poster?: string | null;
}

export default function BimModelViewer({ src, alt, poster }: BimModelViewerProps) {
  useEffect(() => {
    // Importar el web component solo en el cliente. El import registra
    // <model-viewer> como custom element — una vez registrado, cualquier
    // instancia nueva del tag se activa sola sin volver a importar.
    import('@google/model-viewer');
  }, []);

  return (
    <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-gray-900">
      {/* @ts-expect-error — model-viewer es un web component, los tipos vienen de types/model-viewer.d.ts */}
      <model-viewer
        src={src}
        alt={alt}
        poster={poster ?? undefined}
        camera-controls
        touch-action="pan-y"
        auto-rotate
        shadow-intensity="0.8"
        environment-image="neutral"
        interaction-prompt="auto"
        loading="lazy"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
