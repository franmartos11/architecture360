'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useToast } from '@/components/ui/ToastProvider';
import { usePublishState } from '@/lib/publish-state-context';

// Versión "en página" (fondo claro) del estado de publicación: en borrador
// lista lo obligatorio con ✓/✗ y deja publicar; publicado, solo avisa de
// secciones vacías si las hay. Mismo estado que el sidebar
// (lib/publish-state-context), así nunca se contradicen.
export default function PublishCallout({ className = '' }: { className?: string }) {
  const { published, requiredItems, canPublish, missingSections, loading, siteHref, setPublished } = usePublishState();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  if (loading && !published) return null;

  const publish = async () => {
    setPublishing(true);
    const r = await setPublished(true);
    setPublishing(false);
    if (r.ok) toast('¡Sitio publicado! Ya está en línea.');
    else toast(r.error ?? 'No se pudo publicar.', 'error');
  };

  if (published) {
    if (missingSections.length === 0) return null;
    return (
      <div className={`px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2 justify-between ${className}`}>
        <p className="text-sm text-amber-800">
          <span className="font-medium">Tu sitio está en línea</span>, pero {missingSections.length === 1 ? 'esta sección está vacía' : 'estas secciones están vacías'}:{' '}
          {missingSections.map(s => s.label).join(', ')}.
        </p>
        <Link href="/admin/sitio" className="text-sm font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap">
          Completar →
        </Link>
      </div>
    );
  }

  return (
    <div id="publicar" className={`scroll-mt-24 p-4 bg-white border border-amber-200 rounded-xl ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {canPublish ? 'Tu sitio está listo para publicar' : 'Tu sitio todavía no es público'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Mientras sea borrador, el link da &quot;no disponible&quot; a los demás.{' '}
            <a href={siteHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-gray-900">
              Ver vista previa ↗
            </a>
          </p>
        </div>
        <button
          onClick={publish}
          disabled={publishing || !canPublish}
          title={canPublish ? undefined : 'Completá lo obligatorio para poder publicar'}
          className="h-9 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {publishing ? 'Publicando…' : 'Publicar sitio'}
        </button>
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {requiredItems.map(item => (
          <li key={item.key} className={`flex items-center gap-2 text-sm ${item.ok ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
            <span
              aria-hidden
              className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[10px] ${item.ok ? 'bg-brand-500 text-white' : 'border border-amber-400 text-amber-600'}`}
            >
              {item.ok ? '✓' : '!'}
            </span>
            <span className={item.ok ? 'line-through decoration-gray-300' : ''}>{item.label}</span>
            <span className="sr-only">{item.ok ? '(listo)' : '(falta)'}</span>
          </li>
        ))}
      </ul>
      {missingSections.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Recomendado, no obligatorio: {missingSections.map(s => s.label).join(', ')}.{' '}
          <Link href="/admin/sitio" className="underline underline-offset-2 hover:text-gray-900">Completar →</Link>
        </p>
      )}
    </div>
  );
}
