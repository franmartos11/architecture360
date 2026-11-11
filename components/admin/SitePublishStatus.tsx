'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ShareMenu from '@/components/ui/ShareMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { usePublishState } from '@/lib/publish-state-context';
import Collapse from '@/components/ui/Collapse';

// Estado del sitio en el sidebar del panel, en dos piezas:
//  - SitePublishStatus (arriba, bajo el nombre): si está en línea o en
//    borrador, el link para verlo y compartir.
//  - PublishReadinessCard (abajo del menú): "Listo para publicar N/M", qué
//    falta y el botón de publicar.
// Así nunca queda la duda de por qué el link "no anda".
export default function SitePublishStatus({ shareUrl, shareText }: { shareUrl: string; shareText: string }) {
  const { published, siteHref } = usePublishState();

  return (
    <div className="mt-3 flex items-center gap-2">
      <span
        className={`h-6 px-2 shrink-0 flex items-center rounded-full text-[11px] font-semibold transition-colors ${
          published ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {published ? 'Publicado' : 'Borrador'}
      </span>
      <a
        href={siteHref}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 flex items-center gap-1.5 min-h-[32px] px-2.5 bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-xs text-gray-700 hover:text-gray-900 transition-colors truncate"
        title={published ? `Ver el sitio público: ${siteHref}` : 'Vista previa: solo vos podés verlo mientras sea borrador'}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        <span className="truncate">{published ? 'Ver sitio' : 'Vista previa'}</span>
      </a>
      {/* Compartir un borrador manda a los demás a "no disponible": solo publicado. */}
      {published && (
        <ShareMenu url={shareUrl} text={shareText} align="left">
          {(trigger) => (
            <button
              {...trigger}
              className="shrink-0 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-gray-700 hover:text-gray-900 transition-colors"
              title="Compartir el proyecto"
              aria-label="Compartir el proyecto"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
        </ShareMenu>
      )}
    </div>
  );
}

// Dónde se completa cada requisito de publicación.
const READINESS_HREF: Record<string, string> = {
  name: '/admin/proyecto',
  main_image: '/admin/proyecto',
  units: '/admin/carga',
  house: '/admin/carga',
};

/** Bloque "Listo para publicar" del sidebar (diseño): progreso, qué falta y publicar. */
export function PublishReadinessCard() {
  const { published, requiredItems, canPublish, missingSections, loading, setPublished } = usePublishState();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    setPublishing(true);
    const r = await setPublished(true);
    setPublishing(false);
    if (r.ok) toast('¡Sitio publicado! Ya está en línea.');
    else toast(r.error ?? 'No se pudo publicar.', 'error');
  };

  // El progreso cuenta solo lo obligatorio; las secciones vacías van
  // aparte como recomendación — no bloquean, mismo criterio que el panel.
  const done = requiredItems.filter(i => i.ok).length;
  const total = Math.max(1, requiredItems.length);
  const pct = Math.round((done / total) * 100);

  // Sin los requisitos todavía (cargando, o el pedido falló) no hay nada honesto que mostrar.
  if (requiredItems.length === 0) return null;

  return (
    <div className="p-4 rounded-[14px] border border-gray-200 bg-white flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-gray-900">{published ? 'Sitio publicado' : 'Listo para publicar'}</span>
        {!published && <span className="font-display text-[13px] font-semibold text-gray-900">{done}/{total}</span>}
      </div>
      {/* Al publicar, el progreso y el botón se pliegan (no desaparecen de
          golpe). Los espacios van como padding adentro de cada Collapse —
          con `gap` en el padre quedaría un salto al desmontarse. */}
      <Collapse open={!published}>
        <div className="pt-2.5 flex flex-col gap-2.5">
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full bg-brand-700 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <p className="m-0 text-xs leading-snug text-gray-600">
          {canPublish ? 'Ya tiene lo mínimo. Publicalo para que el link funcione para todos.' : (
            <>
              Falta:{' '}
              {requiredItems.filter(i => !i.ok).map((i, n, arr) => (
                <span key={i.key}>
                  <Link href={READINESS_HREF[i.key]} className="underline underline-offset-2 text-gray-900 hover:text-brand-700">{i.label.charAt(0).toLowerCase() + i.label.slice(1)}</Link>
                  {n < arr.length - 2 ? ', ' : n === arr.length - 2 ? ' y ' : ''}
                </span>
              ))}.
            </>
          )}
        </p>
        <button
          onClick={publish}
          disabled={publishing || loading || !canPublish}
          className="min-h-[36px] rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {publishing ? 'Publicando…' : 'Publicar sitio'}
        </button>
        </div>
      </Collapse>
      <Collapse open={missingSections.length > 0}>
        <div className="pt-2.5">
        <Link
          href="/admin/sitio"
          title={`Secciones habilitadas sin contenido: ${missingSections.map(s => s.label).join(', ')}`}
          className="text-xs leading-snug text-gray-600 hover:text-gray-900"
        >
          Recomendado: <span className="underline underline-offset-2">{missingSections.length === 1 ? '1 sección vacía' : `${missingSections.length} secciones vacías`}</span>
        </Link>
        </div>
      </Collapse>
    </div>
  );
}
