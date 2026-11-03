import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { bimModelHref } from '@/lib/bim';
import { pluralize } from '@/lib/units';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';

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
export default function MasterplanCtaSection({ project, basePath, typeConfig }: SectionProps) {
  const isHouse = !typeConfig.hasUnitStep;
  const rows: ExploreRow[] = [
    isHouse
      ? { title: 'Vista frontal', desc: 'Entrá a recorrer la casa desde el frente.', href: `${basePath}/masterplan` }
      : { title: 'Masterplan', desc: 'Explorá el proyecto con el visor interactivo.', href: `${basePath}/masterplan` },
  ];
  if (project.commonAreasTour) {
    rows.push({ title: 'Tour 360°', desc: 'Entrá a los espacios y mirá alrededor.', href: `${basePath}/recorrido` });
  }
  if (typeConfig.hasUnitStep && project.units.length > 0) {
    const label = pluralize(typeConfig.unitLabel);
    rows.push({
      title: label,
      desc: `${project.units.length === 1 ? `1 ${typeConfig.unitLabel.toLowerCase()}` : `${typeConfig.unitLabelGender === 'f' ? 'Las' : 'Los'} ${project.units.length} ${label.toLowerCase()}`} con ${['ficha', 'plano', typeConfig.showPrice && 'precio', typeConfig.showStatus && 'estado'].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' y $1')}.`,
      href: `${basePath}/unidades`,
    });
  }
  if (project.bimModels.length > 0) {
    rows.push({ title: 'Modelo BIM', desc: 'Recorré el edificio en detalle, pieza por pieza.', href: bimModelHref(project.bimModels[0].id), wideOnly: true });
  }

  return (
    <section id="explorar" className="py-[var(--theme-spacing)] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]">
      <Container>
        <SectionHeading
          onDark
          eyebrow="Explorar 3D"
          title="Recorrelo desde cualquier ángulo,"
          muted="sin moverte de donde estás."
          className="mb-16"
        />
        {rows.map((r, i) => (
          <Link
            key={r.title}
            href={r.href}
            className={`group ${r.wideOnly ? 'hidden wide:flex' : 'flex'} flex-wrap items-center gap-6 py-7 border-t border-[var(--theme-border-on-dark)] no-underline text-[var(--theme-text-on-dark)]`}
          >
            <div className="flex-[1_1_220px] flex gap-4 items-start">
              <span className="flex-none w-7 h-7 rounded-full border border-[var(--theme-border-on-dark)] flex items-center justify-center text-xs font-semibold text-[var(--theme-text-on-dark-muted)] tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-sm leading-normal text-[var(--theme-text-on-dark-muted)] max-w-[240px]">{r.desc}</span>
            </div>
            <span className="flex-[999_1_480px] min-w-0 font-[family-name:var(--theme-font-heading)] text-[clamp(44px,8vw,124px)] leading-[0.95] font-medium tracking-[-0.045em] transition-[transform,color] duration-500 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:translate-x-[18px] group-hover:text-[var(--theme-accent)]">
              {r.title}
            </span>
            <span aria-hidden="true" className="hidden sm:flex w-16 h-16 rounded-full bg-[var(--theme-text-on-dark)] text-[var(--theme-bg-alt)] items-center justify-center opacity-0 -translate-x-3 transition-[opacity,transform] duration-500 group-hover:opacity-100 group-hover:translate-x-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
            </span>
          </Link>
        ))}
      </Container>
    </section>
  );
}
