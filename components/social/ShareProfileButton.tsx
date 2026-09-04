'use client';

import { Share2 } from 'lucide-react';
import ShareMenu from '@/components/ui/ShareMenu';

// ShareMenu recibe su trigger como render-prop (una función) — pasarle ese
// children directo desde un Server Component (como el page.tsx del
// perfil público) rompe la serialización RSC ("Functions are not valid
// as a child of Client Components"), porque una función no se puede
// mandar del server al cliente. Este wrapper es 'use client' de punta a
// punta: el page.tsx de arriba solo le pasa strings (url/text), y la
// función-render-prop nunca cruza ese límite.
export default function ShareProfileButton({ url, text }: { url: string; text: string }) {
  return (
    <ShareMenu url={url} text={text}>
      {(trigger) => (
        <button
          {...trigger}
          aria-label="Compartir perfil"
          className="w-[38px] h-[38px] rounded-[10px] border border-trevo-dark/[0.16] bg-white flex items-center justify-center text-trevo-dark/60 hover:border-trevo-dark/40 hover:text-trevo-dark transition-colors"
        >
          <Share2 className="w-4 h-4" />
        </button>
      )}
    </ShareMenu>
  );
}
