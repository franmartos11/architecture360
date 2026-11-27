import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import HomeContactForm from '@/components/HomeContactForm';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { crearT } from '@/lib/i18n/t';
import { intlLocale, type Locale } from '@/lib/i18n/locales';

// ['planos', 'precios', 'financiación'] → "planos, precios y financiación"
// (en inglés, "floor plans, prices, and financing").
function joinList(items: (string | false)[], locale: Locale): string {
  const list = items.filter(Boolean) as string[];
  return new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' }).format(list);
}

export default function ContactSection({ project, typeConfig, locale = 'es' }: SectionProps) {
  if (!typeConfig.showLeads) return null;
  const t = crearT(locale);

  // De fondo, la última vista aérea (distinta de la del hero cuando hay varias).
  const bg = project.aerialSlides.at(-1)?.imageUrl || project.masterplanImage;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'comercial') {
    return (
      <section id="contacto" className="px-4 sm:px-6 py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <div className="max-w-[1360px] mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center p-6 sm:p-10 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-sm">
          <Reveal className="flex flex-col gap-4">
            <span className="self-start text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
              {t('sitio.contacto.asesoramiento')}
            </span>
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(30px,4vw,52px)] leading-[1.05] font-bold tracking-[-0.03em] text-[var(--theme-text)]">
              {t('sitio.contacto.tituloComercial')}
            </h2>
            <p className="m-0 text-sm sm:text-base text-[var(--theme-text-muted)] leading-relaxed">
              {t('sitio.contacto.bajadaComercial', { lista: joinList([t('sitio.contacto.planos'), typeConfig.showPrice && t('sitio.contacto.preciosActualizados'), typeConfig.showCalculator && t('sitio.contacto.opcionesFinanciacion')], locale) })}
            </p>
            {project.briefPdfUrl && (
              <a
                href={project.briefPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-2 h-11 px-5 rounded-full border border-[var(--theme-border)] text-sm font-semibold text-[var(--theme-text)] no-underline hover:bg-[var(--theme-text)]/5 transition-colors"
              >
                {t('sitio.contacto.descargarBriefPdf')}
              </a>
            )}
          </Reveal>
          <Reveal delay={0.1}>
            <HomeContactForm projectSlug={project.slug} projectName={project.name} briefUrl={project.briefPdfUrl} />
          </Reveal>
        </div>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="contacto" className="px-4 sm:px-6 py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <div className="max-w-[1360px] mx-auto grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <Reveal className="flex flex-col gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">{t('sitio.contacto.contacto')}</span>
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(34px,4.5vw,60px)] leading-[1.02] font-medium tracking-[-0.03em] text-[var(--theme-text)]">
              {t('sitio.contacto.tituloEditorial')}
            </h2>
            <p className="m-0 text-base text-[var(--theme-text-muted)] max-w-md">
              {t('sitio.contacto.bajadaEditorial', { lista: joinList([t('sitio.contacto.planos'), typeConfig.showPrice && t('sitio.contacto.precios'), typeConfig.showCalculator && t('sitio.contacto.financiacion')], locale) })}
            </p>
          </Reveal>
          <Reveal delay={0.1} className="lg:pl-8 lg:border-l lg:border-[var(--theme-border)]">
            <HomeContactForm projectSlug={project.slug} projectName={project.name} briefUrl={project.briefPdfUrl} />
          </Reveal>
        </div>
      </section>
    );
  }

  return (
    <section id="contacto" className="px-4 sm:px-6 py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <div className="max-w-[1360px] mx-auto rounded-[calc(var(--theme-radius)*1.6)] overflow-hidden relative bg-[var(--theme-bg-alt)]">
        {bg && <Image src={bg} alt="" aria-hidden="true" fill sizes="(min-width: 1360px) 1360px, 100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-[var(--theme-bg-alt)]/75" aria-hidden="true" />
        <div className="relative p-5 sm:p-10 lg:p-14 flex flex-wrap gap-10 lg:gap-12 items-end text-[var(--theme-text-on-dark)]">
          <Reveal className="flex-[1_1_380px] flex flex-col gap-5">
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(36px,5.2vw,76px)] leading-none font-medium tracking-[-0.04em] text-balance">
              {t('sitio.contacto.titulo')} <span className="text-[var(--theme-text-on-dark-muted)]">{t('sitio.contacto.tituloAtenuado')}</span>
            </h2>
            <p className="m-0 text-base text-[var(--theme-text-on-dark-muted)]">
              {t('sitio.contacto.bajada', { lista: joinList([t('sitio.contacto.planos'), typeConfig.showPrice && t('sitio.contacto.precios'), typeConfig.showCalculator && t('sitio.contacto.financiacion')], locale) })}
            </p>
            {project.briefPdfUrl && (
              <a
                href={project.briefPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-2 h-12 px-[22px] rounded-full border border-[var(--theme-text-on-dark)]/30 text-sm sm:text-[15px] font-semibold text-[var(--theme-text-on-dark)] no-underline transition-colors hover:bg-[var(--theme-text-on-dark)]/10 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--theme-accent)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
                </svg>
                {t('sitio.menu.descargarBrief')}
              </a>
            )}
          </Reveal>
          <Reveal delay={0.12} className="flex-[1_1_380px] min-w-0 bg-[var(--theme-surface)] text-[var(--theme-text)] rounded-[calc(var(--theme-radius)*1.2)] p-5 sm:p-7">
            <HomeContactForm projectSlug={project.slug} projectName={project.name} briefUrl={project.briefPdfUrl} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
