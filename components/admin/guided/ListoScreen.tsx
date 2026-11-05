'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PortadaEditor from '@/components/admin/section-editors/PortadaEditor';
import { usePublishState } from '@/lib/publish-state-context';
import { useToast } from '@/components/ui/ToastProvider';
import { ArrowIcon, useGuidedApi, type GuidedProject } from './shared';

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
  /** "Recomendado" (borde oscuro), "Suma", "Opcional"… — va abajo de la tarjeta. */
  tag?: string;
  /** "5 min" — alternativa a tag, como en el diseño de "para vender". */
  time?: string;
}

// Último paso de todos los flujos (diseño "Listo"): qué se armó (cifras),
// lo que falta para publicar —con la portada editable ahí mismo— y lo que
// suma pero no bloquea. En "solo para mostrar" suma la vista del portfolio
// y qué NO se muestra en ese modo, con el atajo a "para vender".
export default function ListoScreen({
  project, eyebrow, title, text, stats, required, optionalTitle, optional, optionalLayout = 'tiles', hiddenInShowcase, aside, onBackToStart,
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
  /** 'tiles' (default): grilla de tarjetas. 'rows': lista de filas con flecha (Casa). */
  optionalLayout?: 'tiles' | 'rows';
  /** Solo showcase: lo que este modo esconde, para el aviso de "Cambiar a Para vender". */
  hiddenInShowcase?: string;
  /** Columna derecha (vista del portfolio / ficha). */
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
      text: coverOk ? 'Lista · podés cambiarla cuando quieras' : showcase ? 'Lo único que falta para publicar · 2 min' : 'Requerido para publicar · 2 min',
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

  const statsBox = stats && stats.length > 0 && (
    <div className="flex rounded-[14px] border border-gray-200 bg-white overflow-hidden self-start sm:self-end shrink-0">
      {stats.map((s, i) => (
        <div key={s.label} className={`flex flex-col px-4 py-3 min-w-[96px] sm:min-w-[112px] ${i > 0 ? 'border-l border-gray-200' : ''}`}>
          <span className="font-display text-[24px] sm:text-[26px] leading-none font-semibold text-gray-900">{s.value}</span>
          <span className="text-[11px] text-gray-500 mt-1.5">{s.label}</span>
        </div>
      ))}
    </div>
  );

  const main = (
    <div className="flex flex-col gap-8 min-w-0">
      <div className={`flex gap-x-10 gap-y-6 flex-wrap items-end justify-between`}>
        <div className="flex flex-col gap-3 flex-[1_1_420px] min-w-0">
          {showcase && project.projectType !== 'unico'
            ? <span className="self-start text-[11px] font-semibold uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-full bg-[#EAE7E0] text-gray-700">Solo para mostrar</span>
            : <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">{eyebrow}</p>}
          <h1 className="m-0 text-[34px] sm:text-[52px] leading-[1.02] font-semibold text-gray-900 max-w-[640px]">{title}</h1>
          <p className="m-0 text-[15px] sm:text-base leading-relaxed text-gray-600 max-w-[600px]">{text}</p>
        </div>
        {!aside && statsBox}
      </div>
      {aside && statsBox}

      <section className="flex flex-col gap-3">
        {!showcase && <h2 className="m-0 text-[15px] font-semibold text-gray-900">Para publicar</h2>}
        <div className="grid gap-3" style={{ gridTemplateColumns: requiredList.length > 1 ? 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' : '1fr' }}>
          {requiredList.map((item, i) => {
            const dark = i === 0 && !item.done;
            const cls = `w-full flex items-center gap-4 min-h-[76px] sm:min-h-[90px] px-4 sm:px-5 rounded-2xl text-left transition-colors ${
              dark ? 'bg-gray-900 text-white hover:bg-black' : 'bg-white border border-gray-200 hover:border-gray-300 text-gray-900'
            }`;
            const inner = (
              <>
                <span aria-hidden className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${
                  item.done ? 'bg-brand-100 text-brand-800' : dark ? 'bg-[#3A3B38] text-white' : 'bg-[#EAE7E0] text-gray-900'
                }`}>
                  {item.done ? <CheckIcon /> : item.icon ?? (item.key === 'portada' ? <ImageIcon /> : <span className="text-sm font-semibold">$</span>)}
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{item.title}</span>
                  <span className={`text-xs ${dark ? 'text-[#C9C6BE]' : 'text-gray-500'}`}>{item.text}</span>
                </span>
                <ArrowIcon className={item.key === 'portada' && portadaOpen ? 'rotate-90 transition-transform' : 'transition-transform'} />
              </>
            );
            return item.key === 'portada'
              ? <button key={item.key} type="button" onClick={() => setPortadaOpen(o => !o)} aria-expanded={portadaOpen} className={cls}>{inner}</button>
              : <Link key={item.key} href={item.href ?? '/admin'} className={cls}>{inner}</Link>;
          })}
        </div>
        {portadaOpen && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-gray-200">
            <PortadaEditor onSaved={() => { refresh(); router.refresh(); setPortadaOpen(false); }} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">
          {optionalTitle ?? 'Para una ficha completa'}
          {!optionalTitle && <span className="font-normal text-gray-500"> — cuando quieras, en cualquier orden</span>}
        </h2>
        {optionalLayout === 'rows' ? (
          <div className="flex flex-col rounded-[14px] border border-gray-200 bg-white overflow-hidden">
            {optional.map((o, i) => (
              <Link key={o.label} href={o.href} className={`flex items-center gap-4 min-h-[64px] px-4 hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-gray-900">{o.label}</span>
                  <span className="text-xs text-gray-600">{o.text}</span>
                </span>
                {(o.tag || o.time) && <span className="text-[11px] font-semibold text-gray-700">{o.tag ?? o.time}</span>}
                <ArrowIcon className="text-gray-500" />
              </Link>
            ))}
          </div>
        ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${aside ? 220 : 230}px, 100%), 1fr))` }}>
          {optional.map(o => {
            const strong = o.tag === 'Recomendado';
            return (
              <Link key={o.label} href={o.href}
                className={`flex flex-col gap-1 min-h-[96px] sm:min-h-[136px] p-4 rounded-[14px] bg-white transition-colors ${strong ? 'border border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
                <span className="text-sm font-semibold text-gray-900">{o.label}</span>
                <span className="text-xs leading-relaxed text-gray-600">{o.text}</span>
                {(o.tag || o.time) && <span className={`mt-auto pt-3 text-[11px] ${o.tag ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{o.tag ?? o.time}</span>}
              </Link>
            );
          })}
        </div>
        )}
      </section>

      {/* Sin columna lateral, el aviso de "solo para mostrar" va como una línea antes del pie. */}
      {!aside && showcase && hiddenInShowcase && (
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-4 py-3 rounded-[14px] bg-gray-50 border border-gray-200">
          <span className="flex-1 min-w-[220px] text-xs text-gray-600"><b className="text-gray-900 font-semibold">No se muestran en este modo:</b> {hiddenInShowcase}</span>
          {project.projectType !== 'unico' && (
            <button type="button" onClick={switchToVenta} disabled={switching}
              className="min-h-[36px] text-[13px] font-semibold text-gray-900 underline underline-offset-2 disabled:opacity-60">
              {switching ? 'Cambiando...' : 'Cambiar a Para vender'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-6 border-t border-gray-200">
        {onBackToStart
          ? <button type="button" onClick={onBackToStart} className="self-start min-h-[44px] text-[13px] text-gray-700 underline underline-offset-2 hover:text-gray-900">Volver a la carga guiada</button>
          : <span />}
        <Link href="/admin/proyecto" className="min-h-[52px] px-6 rounded-xl bg-brand-700 text-white text-[15px] font-semibold hover:bg-brand-800 inline-flex items-center justify-center gap-2.5">
          Ir a la Ficha del proyecto <ArrowIcon />
        </Link>
      </div>
    </div>
  );

  return (
    <div className={`w-full mx-auto px-4 sm:px-10 py-10 sm:py-14 ${aside ? 'max-w-[1160px]' : 'max-w-[1120px]'}`}>
      {aside ? (
        <div className="flex gap-10 flex-wrap items-start">
          <div className="flex-[999_1_560px] min-w-0">{main}</div>
          <aside className="flex-[1_1_300px] lg:max-w-[320px] min-w-0 flex flex-col gap-4 lg:sticky lg:top-6 lg:pt-1">
            {aside}
            {showcase && hiddenInShowcase && (
              <div className="p-4 rounded-[14px] bg-gray-50 border border-gray-200 flex flex-col gap-2">
                <span className="text-sm font-semibold text-gray-900">No se muestra en este modo</span>
                <span className="text-xs leading-relaxed text-gray-600">{hiddenInShowcase}</span>
                {project.projectType !== 'unico' && (
                  <button type="button" onClick={switchToVenta} disabled={switching}
                    className="self-start min-h-[36px] text-[13px] font-semibold text-gray-900 underline underline-offset-2 disabled:opacity-60">
                    {switching ? 'Cambiando...' : 'Cambiar a Para vender'}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      ) : main}
    </div>
  );
}

function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m5 12 5 5 9-11" /></svg>;
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-9 8" />
    </svg>
  );
}

/** Tarjeta "Así aparece en tu portfolio" / "Así se ve la ficha" — compartida por los Listo y las vistas previas. */
export function PreviewCard({ project, title, meta, footer, badge }: { project: GuidedProject; title?: string; meta: string; footer?: ReactNode; badge?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold text-gray-900">{project.saleMode === 'showcase' ? 'Así aparece en tu portfolio' : 'Así se ve la ficha'}</span>
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-[0_1px_2px_rgba(23,25,26,0.06),0_12px_32px_-12px_rgba(23,25,26,0.18)]">
        <div className="relative aspect-[4/3] flex items-center justify-center"
          style={project.masterplanImage ? undefined : { background: 'repeating-linear-gradient(135deg, #EFECE6 0 12px, #F5F3EE 12px 24px)' }}>
          {project.masterplanImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.masterplanImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-gray-700 bg-white px-2.5 py-1.5 rounded-lg">Falta la portada</span>
          )}
          {badge && <span className="absolute left-3 top-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white text-gray-900">{badge}</span>}
        </div>
        <div className="p-4 sm:p-5 flex flex-col gap-1.5">
          <span className="font-display text-xl font-semibold tracking-[-0.02em] text-gray-900">{title ?? project.name}</span>
          <span className="text-xs text-gray-600">{meta}</span>
          {footer}
        </div>
      </div>
    </div>
  );
}
