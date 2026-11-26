import Reveal from '@/components/ui/Reveal';
import { formatPrice, pluralize } from '@/lib/units';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { Project } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';
import type { SectionProps } from './types';
import { Container } from './ui';

interface Stat {
  label: string;
  value: string;
  /** Prefijo chico y atenuado, ej. la moneda. */
  prefix?: string;
}

// Todo derivado de los datos cargados — no hay cifras "de marketing" que
// el admin tenga que mantener a mano (y que queden desactualizadas).
export function projectStats(project: Project, typeConfig: ProjectTypeConfig): Stat[] {
  const stats: Stat[] = [];
  const units = project.units;
  if (units.length > 0) {
    stats.push({ label: pluralize(typeConfig.unitLabel), value: String(units.length) });
  }
  if (typeConfig.showStatus && units.length > 0) {
    stats.push({ label: 'Disponibles', value: String(units.filter(u => u.status === 'available').length) });
  }
  if (typeConfig.hasFloorStep) {
    const floors = Math.max(0, ...project.buildings.map(b => b.floors.length));
    if (floors > 1) stats.push({ label: 'Niveles', value: String(floors) });
  }
  if (project.buildings.length > 1) {
    stats.push({ label: pluralize(typeConfig.buildingLabel), value: String(project.buildings.length) });
  }
  if (typeConfig.showPrice) {
    const cheapest = units
      .filter(u => u.status === 'available' && typeof u.price === 'number' && u.price > 0)
      .reduce<Project['units'][number] | null>((min, u) => (!min || u.price! < min.price!) ? u : min, null);
    if (cheapest) {
      const currency = cheapest.currency ?? 'USD';
      // "USD 15.000": la moneda va chica al lado, la cifra sola grande.
      const amount = formatPrice(cheapest.price!, currency).replace(/[^\d.,]/g, '').trim();
      stats.push({ label: 'Desde', value: amount, prefix: currency });
    }
  }
  return stats.slice(0, 4);
}

export default function StatsSection({ project, typeConfig }: SectionProps) {
  const stats = projectStats(project, typeConfig);
  // Una sola cifra no es una "fila de cifras".
  if (stats.length < 2) return null;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  if (template === 'comercial') {
    return (
      <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
        <Container>
          <Reveal>
            <dl className="m-0 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(s => (
                <div
                  key={s.label}
                  className="tpl-card p-6 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-sm flex flex-col gap-2"
                >
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">{s.label}</dt>
                  <dd className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.5vw,52px)] leading-none font-bold tracking-[-0.03em] text-[var(--theme-text)] tabular-nums">
                    {s.prefix && <span className="text-[0.45em] font-semibold text-[var(--theme-text-muted)]">{s.prefix} </span>}
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]">
        <Container>
          <Reveal>
            <dl className="m-0 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--theme-border-on-dark)]">
              {stats.map(s => (
                <div key={s.label} className="py-5 lg:py-2 lg:px-6 first:lg:pl-0 flex flex-col gap-1.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-on-dark-muted)]">{s.label}</dt>
                  <dd className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(34px,4.8vw,58px)] leading-none font-medium tracking-[-0.03em] text-[var(--theme-text-on-dark)] tabular-nums">
                    {s.prefix && <span className="text-[0.4em] text-[var(--theme-text-on-dark-muted)]">{s.prefix} </span>}
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <dl className="m-0 grid grid-cols-2 lg:grid-cols-4 border-t border-[var(--theme-border)]">
            {stats.map(s => (
              <div key={s.label} className="pt-7 pr-6 pb-6 flex flex-col gap-2.5">
                <dt className="text-[13px] font-semibold text-[var(--theme-text-muted)]">{s.label}</dt>
                <dd className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(44px,6vw,72px)] leading-none font-medium tracking-[-0.04em] text-[var(--theme-text)] tabular-nums">
                  {s.prefix && <span className="text-[0.4em] tracking-normal text-[var(--theme-text-muted)]">{s.prefix} </span>}
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </section>
  );
}
