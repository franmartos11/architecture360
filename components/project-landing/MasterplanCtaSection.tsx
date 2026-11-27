import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { bimModelHref } from '@/lib/bim';
import { pluralize } from '@/lib/units';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { projectHasContent } from '@/lib/project-content';
import { ArrowIcon, Container, SectionHeading } from './ui';
import { crearT } from '@/lib/i18n/t';
import { intlLocale } from '@/lib/i18n/locales';

interface ExploreRow {
  title: string;
  desc: string;
  href: string;
  /** El visor BIM no carga bien en pantallas chicas (ver BimMobileGate). */
  wideOnly?: boolean;
}

// "Explorar 3D": una fila grande por cada forma de recorrer el proyecto que
// realmente tenga contenido. La key del registro sigue siendo 'masterplan'
// para no romper el section_config guardado de los proyectos existentes.
export default function MasterplanCtaSection({ project, basePath, typeConfig, locale = 'es' }: SectionProps) {
  const t = crearT(locale);
  const isHouse = !typeConfig.hasUnitStep;
  const rows: ExploreRow[] = [];
  // Sin vista aérea ni imagen de masterplan, /masterplan da 404.
  if (projectHasContent(project).facade) {
    rows.push(isHouse
      ? { title: t('sitio.explorar.vistaFrontal'), desc: t('sitio.explorar.vistaFrontalDesc'), href: `${basePath}/masterplan` }
      : { title: t('sitio.explorar.masterplan'), desc: t('sitio.explorar.masterplanDesc'), href: `${basePath}/masterplan` });
  }
  if (project.commonAreasTour) {
    rows.push({ title: t('sitio.about.tour360'), desc: t('sitio.explorar.tourDesc'), href: `${basePath}/recorrido` });
  }
  if (typeConfig.hasUnitStep && project.units.length > 0) {
    const label = pluralize(typeConfig.unitLabel, locale);
    // "ficha, plano, precio y estado" (en inglés, "fact sheet, floor plan, price, and status").
    const lista = new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' }).format(
      [t('sitio.explorar.ficha'), t('sitio.explorar.plano'), typeConfig.showPrice && t('sitio.explorar.precio'), typeConfig.showStatus && t('sitio.explorar.estado')].filter((x): x is string => !!x),
    );
    rows.push({
      title: label,
      desc: project.units.length === 1
        ? t('sitio.explorar.unaUnidad', { unidad: typeConfig.unitLabel.toLowerCase(), lista })
        : t('sitio.explorar.variasUnidades', { los: typeConfig.unitLabelGender === 'f' ? 'Las' : 'Los', count: project.units.length, unidades: label.toLowerCase(), lista }),
      href: `${basePath}/unidades`,
    });
  }
  if (project.bimModels.length > 0) {
    rows.push({ title: t('sitio.bim.eyebrow'), desc: t('sitio.explorar.bimDesc'), href: bimModelHref(project.bimModels[0].id), wideOnly: true });
  }
  if (rows.length === 0) return null;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'comercial') {
    return (
      <section id="explorar" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <SectionHeading
            eyebrow={t('sitio.explorar.accesos')}
            title={t('sitio.explorar.tituloComercial')}
            muted={t('sitio.explorar.tituloComercialAtenuado')}
            className="mb-10"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r, i) => (
              <Link
                key={r.title}
                href={r.href}
                className={`tpl-card group ${r.wideOnly ? 'hidden wide:flex' : 'flex'} flex-col justify-between gap-4 p-6 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] hover:border-[var(--theme-accent)] no-underline text-[var(--theme-text)] shadow-sm`}
              >
                <div className="space-y-2">
                  <span className="inline-block text-[11px] font-semibold text-[var(--theme-accent)] tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-2xl font-bold tracking-[-0.02em]">
                    {r.title}
                  </h3>
                  <p className="m-0 text-sm text-[var(--theme-text-muted)] leading-relaxed">{r.desc}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--theme-text)] group-hover:text-[var(--theme-accent)] transition-colors">
                  {t('sitio.explorar.abrir')} <ArrowIcon />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="explorar" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <SectionHeading
            eyebrow={t('sitio.explorar.recorridos')}
            title={t('sitio.explorar.tituloEditorial')}
            className="mb-10"
          />
          <div className="divide-y divide-[var(--theme-border)] border-y border-[var(--theme-border)]">
            {rows.map((r, i) => (
              <Link
                key={r.title}
                href={r.href}
                className={`ed-row group ${r.wideOnly ? 'hidden wide:flex' : 'flex'} items-center justify-between gap-4 py-5 no-underline text-[var(--theme-text)]`}
              >
                <div className="flex items-baseline gap-4 min-w-0">
                  <span className="text-xs font-mono text-[var(--theme-text-muted)]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-[family-name:var(--theme-font-heading)] text-2xl sm:text-3xl font-medium tracking-[-0.02em] group-hover:text-[var(--theme-accent)] transition-colors">
                    {r.title}
                  </span>
                  <span className="hidden md:inline text-sm text-[var(--theme-text-muted)] truncate">{r.desc}</span>
                </div>
                <span className="shrink-0 w-9 h-9 rounded-full border border-[var(--theme-border)] flex items-center justify-center group-hover:bg-[var(--theme-text)] group-hover:text-[var(--theme-bg)] transition-colors">
                  <ArrowIcon />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section id="explorar" className="py-[var(--theme-spacing)] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]">
      <Container>
        <SectionHeading
          onDark
          eyebrow={t('nav.explorar3d')}
          title={t('sitio.explorar.titulo')}
          muted={t('sitio.explorar.tituloAtenuado')}
          className="mb-16"
        />
        {/* Hover (y foco con teclado) de cada fila, sin tocar la composición:
            el título grande se corre y toma el acento — es lo que se va a
            abrir —, y los detalles de la izquierda responden con la curva
            corta (160 ms): el número pasa a color pleno y la descripción se
            corre 4 px, como si la fila entera se inclinara hacia adelante.
            Todo en EASE_OUT (lib/motion.ts), la curva del resto del sitio.
            Con movimiento reducido quedan solo los cambios de color. */}
        {rows.map((r, i) => (
          <Link
            key={r.title}
            href={r.href}
            className={`group ${r.wideOnly ? 'hidden wide:flex' : 'flex'} flex-wrap items-center gap-6 py-7 border-t border-[var(--theme-border-on-dark)] no-underline text-[var(--theme-text-on-dark)]`}
          >
            <div className="flex-[1_1_220px] flex gap-4 items-start">
              <span className="flex-none w-7 h-7 rounded-full border border-[var(--theme-border-on-dark)] flex items-center justify-center text-xs font-semibold text-[var(--theme-text-on-dark-muted)] tabular-nums transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:text-[var(--theme-text-on-dark)] group-hover:border-[var(--theme-text-on-dark)] group-focus-visible:text-[var(--theme-text-on-dark)] group-focus-visible:border-[var(--theme-text-on-dark)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-sm leading-normal text-[var(--theme-text-on-dark-muted)] max-w-[240px] transition-[transform,color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:group-hover:translate-x-1 group-hover:text-[var(--theme-text-on-dark)] motion-safe:group-focus-visible:translate-x-1 group-focus-visible:text-[var(--theme-text-on-dark)]">{r.desc}</span>
            </div>
            <span className="flex-[999_1_480px] min-w-0 font-[family-name:var(--theme-font-heading)] text-[clamp(44px,8vw,124px)] leading-[0.95] font-medium tracking-[-0.045em] transition-[transform,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:group-hover:translate-x-[18px] group-hover:text-[var(--theme-accent)] motion-safe:group-focus-visible:translate-x-[18px] group-focus-visible:text-[var(--theme-accent)]">
              {r.title}
            </span>
            <span aria-hidden="true" className="hidden sm:flex w-16 h-16 rounded-full bg-[var(--theme-text-on-dark)] text-[var(--theme-bg-alt)] items-center justify-center opacity-0 motion-safe:-translate-x-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 motion-safe:group-hover:translate-x-0 group-focus-visible:opacity-100 motion-safe:group-focus-visible:translate-x-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
            </span>
          </Link>
        ))}
      </Container>
    </section>
  );
}
