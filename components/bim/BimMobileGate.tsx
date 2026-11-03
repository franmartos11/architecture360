'use client';

import { useSyncExternalStore } from 'react';
import Image from 'next/image';
import { WIDE_QUERY } from '@/components/floorplan/UnitSheet';

// El visor BIM no se monta en mobile: en un celular la geometría tarda
// mucho o directamente no carga, y la experiencia termina en una pantalla
// trabada. En su lugar, la portada del modelo y un aviso.
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};

export default function BimMobileGate({ coverImage, title, children }: {
  coverImage?: string | null;
  title: string;
  children: React.ReactNode;
}) {
  // null en el servidor: no se decide (ni se monta el visor) hasta saber el ancho.
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_QUERY).matches, () => null);
  if (wide === null) return null;
  if (wide) return <>{children}</>;
  return (
    <div className="flex flex-col gap-4">
      {coverImage && (
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100">
          <Image src={coverImage} alt={title} fill sizes="100vw" className="object-cover" />
        </div>
      )}
      <p className="text-[15px] leading-relaxed text-gray-600">
        El modelo 3D está pensado para verse desde una computadora o una tablet. Abrí este link desde ahí para recorrerlo.
      </p>
    </div>
  );
}
