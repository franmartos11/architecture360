'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ShareMenu from '@/components/ui/ShareMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { usePublishState } from '@/lib/publish-state-context';

// Estado del sitio en el sidebar del panel: si está en línea o en borrador,
// el link para verlo, publicar, y qué falta. Es lo primero que se ve en
// cualquier pantalla del proyecto, así nunca queda la duda de por qué el
// link "no anda".
export default function SitePublishStatus({ shareUrl, shareText }: { shareUrl: string; shareText: string }) {
  const { published, canPublish, missingRequired, missingSections, loading, siteHref, setPublished } = usePublishState();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    setPublishing(true);
    const r = await setPublished(true);
    setPublishing(false);
    if (r.ok) toast('¡Sitio publicado! Ya está en línea.');
    else toast(r.error ?? 'No se pudo publicar.', 'error');
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`h-5 px-2 shrink-0 flex items-center rounded-md text-[11px] font-semibold ${
            published ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'
          }`}
        >
          {published ? 'Publicado' : 'Borrador'}
        </span>
        <a
          href={siteHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-200 hover:text-white transition-colors truncate"
          title={published ? `Ver el sitio público: ${siteHref}` : 'Vista previa: solo vos podés verlo mientras sea borrador'}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                className="shrink-0 p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-200 hover:text-white transition-colors"
                title="Compartir el proyecto"
                aria-label="Compartir el proyecto"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            )}
          </ShareMenu>
        )}
      </div>

      {!published && (
        <div className="px-2.5 py-2 bg-amber-950/40 border border-amber-800/40 rounded-lg text-xs text-amber-200 space-y-2">
          <p>
            {loading
              ? 'El sitio todavía no es público.'
              : canPublish
                ? 'Ya tiene lo mínimo. Publicalo para que el link funcione para todos.'
                : `El sitio todavía no es público. Para publicar falta: ${missingRequired.join(', ')}.`}
          </p>
          <button
            onClick={publish}
            disabled={publishing || loading || !canPublish}
            className="w-full h-8 rounded-md bg-white text-gray-900 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? 'Publicando…' : 'Publicar sitio'}
          </button>
        </div>
      )}

      {missingSections.length > 0 && (
        <Link
          href="/admin/sitio"
          title={`Secciones habilitadas sin contenido: ${missingSections.map(s => s.label).join(', ')}`}
          className="flex items-start gap-1.5 px-2.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 rounded-lg text-xs text-gray-300 transition-colors"
        >
          <span className="min-w-0">
            Recomendado: {missingSections.length === 1 ? '1 sección vacía' : `${missingSections.length} secciones vacías`} ({missingSections.map(s => s.label).join(', ')})
          </span>
        </Link>
      )}
    </div>
  );
}
