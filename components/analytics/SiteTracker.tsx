'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { sendEvent } from '@/lib/analytics/send';
import type { TrackType } from '@/lib/analytics/track-schema';
import {
  safeStorage, newId, getVisitorId, touchSession, captureRef, currentRef, referrerHost, shouldTrack,
} from '@/lib/analytics/client-state';

// Analítica del sitio público de un proyecto: visitas, unidades vistas,
// recorridos 360, brief y WhatsApp. Montado en app/proyecto/[slug]/layout.tsx.
// Spec: docs/superpowers/specs/2026-11-24-analitica-y-links-de-broker-design.md

export interface EmitExtra {
  id?: string;
  unitId?: string;
  durationSeconds?: number;
  referrerHost?: string;
}
type Emit = (type: TrackType, extra?: EmitExtra) => void;

const TrackContext = createContext<Emit | null>(null);

// Solo links a un número (wa.me/549…, api.whatsapp.com/send?phone=…): el
// "compartir por WhatsApp" (wa.me/?text=) no es una consulta.
const WHATSAPP_RE = /^https?:\/\/(www\.)?(wa\.me\/\d|api\.whatsapp\.com\/send\/?\?(.*&)?phone=\d)/i;

/** Adentro de un iframe del propio sitio (amenities embebe /recorrido): lo cuenta la página de afuera. */
function inSameOriginFrame(): boolean {
  try {
    return window.top !== window && window.top?.location.origin === window.location.origin;
  } catch {
    return false; // iframe de otro origen (la web de la desarrolladora): se cuenta
  }
}

interface Props {
  projectSlug: string;
  isDraftPreview: boolean;
  briefUrl?: string;
  children: React.ReactNode;
}

export default function SiteTracker({ projectSlug, isDraftPreview, briefUrl, children }: Props) {
  const pathname = usePathname();
  const enabled = useRef<boolean | null>(null);
  const firstPage = useRef(true);

  const emit = useCallback<Emit>((type, extra = {}) => {
    if (enabled.current === null) enabled.current = shouldTrack({ isDraftPreview, inSameOriginFrame: inSameOriginFrame() });
    if (!enabled.current) return;
    const s = safeStorage();
    const now = Date.now();
    sendEvent({
      id: extra.id ?? newId(),
      projectSlug,
      visitorId: getVisitorId(s),
      sessionId: touchSession(s, now),
      type,
      path: window.location.pathname.slice(0, 300),
      unitId: extra.unitId || undefined,
      ref: currentRef(s, now) ?? undefined,
      referrerHost: extra.referrerHost,
      durationSeconds: extra.durationSeconds,
    });
  }, [projectSlug, isDraftPreview]);

  useEffect(() => {
    captureRef(safeStorage(), window.location.search, Date.now());
    if (firstPage.current) {
      firstPage.current = false;
      emit('page', { referrerHost: referrerHost(document.referrer, window.location.hostname) ?? undefined });
    } else {
      emit('page');
    }
  }, [pathname, emit]);

  // Un solo listener para los ~5 botones de WhatsApp y los ~5 links al brief.
  useEffect(() => {
    const briefHref = briefUrl ? new URL(briefUrl, window.location.href).href : null;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (WHATSAPP_RE.test(a.href)) emit('whatsapp');
      else if (briefHref && a.href === briefHref) emit('brief');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [briefUrl, emit]);

  return <TrackContext.Provider value={emit}>{children}</TrackContext.Provider>;
}

/** Para registrar 'tour' (u otro evento puntual) desde un componente del sitio. Fuera del tracker no hace nada. */
export function useTrack(): Emit {
  const emit = useContext(TrackContext);
  return useCallback<Emit>((type, extra) => emit?.(type, extra), [emit]);
}
