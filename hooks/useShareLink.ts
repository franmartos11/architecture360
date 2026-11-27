'use client';

import { useToast } from '@/components/ui/ToastProvider';
import { useT } from '@/lib/i18n/client';

// Comparte un link nativo (navigator.share) con fallback a copiar al
// portapapeles — usado tanto en el visor de unidad como en el plano de piso.
export function useShareLink() {
  const toast = useToast();
  const t = useT();

  return async (url: string, title: string, text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        console.log('Error sharing', err);
      }
    } else {
      navigator.clipboard.writeText(url);
      toast(t('comun.linkCopiado'));
    }
  };
}
