'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PortadaEditor from '@/components/admin/section-editors/PortadaEditor';
import { usePublishState } from '@/lib/publish-state-context';
import { useToast } from '@/components/ui/ToastProvider';
import { StepIntro, useGuidedApi, type GuidedProject } from './shared';

export interface ListoRequired {
  key: string;
  title: string;
  text: string;
  href?: string;
  done?: boolean;
  icon?: ReactNode;
}

export interface ListoOptional {
  label: string;
  text: string;
  href: string;
  tag?: string;
}

// Último paso de todos los flujos: qué se armó (cifras), lo que falta
// para publicar (con la portada editable ahí mismo, sin salir) y lo que
// suma pero no bloquea. En "solo para mostrar" agrega qué NO se muestra
// en ese modo y el atajo para pasar a "para vender".
export default function ListoScreen({
  project, eyebrow, title, text, stats, required, optionalTitle, optional, hiddenInShowcase, aside, onBackToStart,
}: {
  project: GuidedProject;
  eyebrow: string;
  title: string;
  text: string;
  stats?: { value: string; label: string }[];
  /** Además de la portada (que va siempre primera). */
  required?: ListoRequired[];
  optionalTitle?: string;
  optional: ListoOptional[];
  /** Solo showcase: lo que este modo esconde, para el aviso de "Cambiar a Para vender". */
  hiddenInShowcase?: string;
  aside?: ReactNode;
  onBackToStart?: () => void;
}) {
  const { requiredItems, refresh } = usePublishState();
  const router = useRouter();
  const toast = useToast();
  const { patchProject } = useGuidedApi();
  const [portadaOpen, setPortadaOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const showcase = project.saleMode === 'showcase';

  const coverOk = requiredItems.find(i => i.key === 'main_image')?.ok ?? !!project.masterplanImage;
  const requiredList: ListoRequired[] = [
    {
      key: 'portada',
      title: 'Portada y bajada',
      text: coverOk ? 'Lista' : showcase ? 'Lo único que falta para publicar · 2 min' : 'Requerido para publicar · 2 min',
      done: coverOk,
    },
    ...(required ?? []),
  ];

  const switchToVenta = async () => {
    setSwitching(true);
    const res = await patchProject({ saleMode: 'venta' });
    setSwitching(false);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Ahora el proyecto es para vender.');
    // El tipo de proyecto lo resuelve el layout del servidor: recarga completa.
    window.location.href = '/admin/carga';
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex gap-8 flex-wrap items-start">
      <div className="flex-[3_1_560px] min-w-0 flex flex-col gap-8">
        <div className="flex flex-col gap-5">
          {showcase && (
            <span className="self-start text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-900 text-white">Solo para mostrar</span>
          )}
          <StepIntro eyebrow={eyebrow} title={title}>{text}</StepIntro>
          {stats && stats.length > 0 && (
            <div className="flex gap-x-8 gap-y-4 flex-wrap pt-1">
              {stats.map(s => (
                <div key={s.label} className="flex flex-col">
                  <span className="text-[28px] sm:text-[32px] leading-none font-semibold tracking-tight text-gray-900">{s.value}</span>
                  <span className="text-xs text-gray-500 mt-1.5">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Para publicar</h2>
          <div className="flex flex-col gap-2">
            {requiredList.map(item => (
              <div key={item.key} className={`rounded-xl border bg-white ${item.done ? 'border-gray-200' : 'border-[1.5px] border-amber-300'}`}>
                {item.key === 'portada' ? (
                  <button
                    type="button"
                    onClick={() => setPortadaOpen(o => !o)}
                    aria-expanded={portadaOpen}
                    className="w-full flex items-center gap-4 min-h-[64px] px-4 text-left"
                  >
                    <RequiredMark done={item.done} />
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                      <span className="text-xs text-gray-500">{item.text}</span>
                    </span>
                    <span aria-hidden className="text-gray-500">{portadaOpen ? '−' : '→'}</span>
                  </button>
                ) : (
                  <Link href={item.href ?? '/admin'} className="w-full flex items-center gap-4 min-h-[64px] px-4">
                    <RequiredMark done={item.done} />
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                      <span className="text-xs text-gray-500">{item.text}</span>
                    </span>
                    <span aria-hidden className="text-gray-500">→</span>
                  </Link>
                )}
                {item.key === 'portada' && portadaOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                    <PortadaEditor onSaved={() => { refresh(); router.refresh(); setPortadaOpen(false); }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">
            {optionalTitle ?? 'Para una ficha completa'} <span className="font-normal text-gray-500">— cuando quieras, en cualquier orden</span>
          </h2>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
            {optional.map(o => (
              <Link key={o.label} href={o.href} className="flex flex-col gap-1 min-h-[64px] sm:min-h-[88px] p-3.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 flex-1">{o.label}</span>
                  {o.tag && <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{o.tag}</span>}
                </span>
                <span className="text-xs text-gray-500 leading-snug">{o.text}</span>
              </Link>
            ))}
          </div>
        </section>

        {showcase && hiddenInShowcase && (
          <div className="flex items-center gap-4 flex-wrap p-4 rounded-xl bg-gray-100 border border-gray-200">
            <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-gray-900">No se muestra en este modo</span>
              <span className="text-xs text-gray-600">{hiddenInShowcase}</span>
            </div>
            {project.projectType !== 'unico' && (
              <button type="button" onClick={switchToVenta} disabled={switching}
                className="min-h-[40px] px-4 rounded-lg border border-gray-300 bg-white text-[13px] font-medium text-gray-900 hover:border-gray-400 disabled:opacity-60">
                {switching ? 'Cambiando...' : 'Cambiar a Para vender'}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pt-6 border-t border-gray-200">
          {onBackToStart ? (
            <button type="button" onClick={onBackToStart} className="min-h-[44px] text-sm font-medium text-gray-700 hover:text-gray-900">← Volver a la carga guiada</button>
          ) : <span />}
          <Link href="/admin/proyecto" className="min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 flex items-center justify-center">
            Ir a la Ficha del proyecto →
          </Link>
        </div>
      </div>

      {aside && <aside className="flex-[2_1_340px] min-w-0 max-w-[480px] lg:sticky lg:top-6">{aside}</aside>}
    </div>
  );
}

function RequiredMark({ done }: { done?: boolean }) {
  return (
    <span aria-label={done ? 'Listo' : 'Pendiente'} className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ${
      done ? 'bg-brand-700 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
    }`}>
      {done ? '✓' : '!'}
    </span>
  );
}

/** Tarjeta de vista previa "Así aparece en tu portfolio" / ficha — compartida por los Listo. */
export function PreviewCard({ project, title, meta, footer, badge }: { project: GuidedProject; title?: string; meta: string; footer?: ReactNode; badge?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold text-gray-900">{project.saleMode === 'showcase' ? 'Así aparece en tu portfolio' : 'Así se ve la ficha'}</span>
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-[0_12px_32px_-12px_rgba(16,24,40,.18)]">
        <div className="relative aspect-[16/10] bg-gray-100 flex items-center justify-center">
          {project.masterplanImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.masterplanImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-gray-500">Falta la portada</span>
          )}
          {badge && <span className="absolute left-3 top-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/95 text-gray-900">{badge}</span>}
        </div>
        <div className="p-4 flex flex-col gap-1.5">
          <span className="text-lg font-semibold text-gray-900">{title ?? project.name}</span>
          <span className="text-xs text-gray-500">{meta}</span>
          {footer}
        </div>
      </div>
    </div>
  );
}
