import Link from 'next/link';
import type { Metadata } from 'next';
import ConstructionProgressView from '@/components/project-landing/ConstructionProgressView';
import { Container } from '@/components/project-landing/ui';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { DEMO_PROGRESS } from '@/lib/construction-progress-demo';
import { progressHeadline } from '@/lib/construction-progress-view';
import { HeroProgressLink } from '@/components/project-landing/ProjectHero';
import { resolveTheme } from '@/lib/resolve-theme';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';

// Laboratorio del avance de obra: la misma sección de la landing con datos
// de ejemplo (edificio, casa y loteo) y el tema de un proyecto real — para
// probar la animación sin tener que cargar fotos en un proyecto. No se indexa.
export const metadata: Metadata = { title: 'Avance de obra · laboratorio', robots: { index: false } };

const KINDS = [
  { key: 'edificio', label: 'Edificio' },
  { key: 'casa', label: 'Casa' },
  { key: 'loteo', label: 'Loteo' },
] as const;
type Kind = (typeof KINDS)[number]['key'];

interface PageProps {
  searchParams: Promise<{ t?: string; p?: string }>;
}

export default async function ConstructionProgressLabPage({ searchParams }: PageProps) {
  const { t, p = 'demo' } = await searchParams;
  const kind: Kind = KINDS.some(k => k.key === t) ? (t as Kind) : 'edificio';
  const project = await getPublicProjectBySlug(p);
  const theme = resolveTheme(project?.themeConfig);
  const headline = progressHeadline(DEMO_PROGRESS[kind]);

  return (
    <div
      className={`${ALL_FONT_CLASSNAMES} min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)]`}
      style={{ ...theme.cssVars, fontFamily: 'var(--theme-font-body)' } as React.CSSProperties}
    >
      <div className="sticky top-0 z-40 bg-[var(--theme-bg)]/85 backdrop-blur-md border-b border-[var(--theme-border)]">
        <Container className="h-16 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold truncate">Avance de obra · laboratorio{project ? ` · tema de ${project.name}` : ''}</span>
          <nav className="flex gap-1 p-1 rounded-full bg-[var(--theme-border)]/60" aria-label="Tipo de proyecto">
            {KINDS.map(k => (
              <Link
                key={k.key}
                href={`?t=${k.key}${p !== 'demo' ? `&p=${p}` : ''}`}
                scroll={false}
                aria-current={k.key === kind ? 'page' : undefined}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${k.key === kind ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]'}`}
              >
                {k.label}
              </Link>
            ))}
          </nav>
        </Container>
      </div>

      {/* Aire arriba y abajo para probar el scroll como si estuviera en la
          landing. Arriba, el renglón que el hero muestra con estos datos. */}
      <div className="h-[30vh] flex items-end pb-10">
        <Container className="w-full flex flex-col gap-2">
          <span className="text-[13px] text-[var(--theme-text-muted)]">En el hero</span>
          {headline && <HeroProgressLink href="#avance" text={headline} />}
        </Container>
      </div>
      <ConstructionProgressView key={kind} progress={DEMO_PROGRESS[kind]} />
      <div className="h-[60vh]" />
    </div>
  );
}
