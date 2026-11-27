import Reveal from '@/components/ui/Reveal';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { SectionProps } from './types';
import { Container, SectionHeading } from './ui';
import { crearT } from '@/lib/i18n/t';

type ParsedVideo =
  | { kind: 'iframe'; src: string }
  | { kind: 'file'; src: string };

export function parseEmbedVideo(rawUrl: string): ParsedVideo | null {
  const url = rawUrl.trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? { kind: 'iframe', src: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return id ? { kind: 'iframe', src: `https://www.youtube.com/embed/${encodeURIComponent(id)}` } : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? { kind: 'iframe', src: `https://player.vimeo.com/video/${encodeURIComponent(id)}` } : null;
    }
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return { kind: 'file', src: url };
    }
  } catch {
    // Allow relative /media/... mp4 files
    if (url.startsWith('/')) return { kind: 'file', src: url };
  }
  return null;
}

export default function VideoSection({ project, locale = 'es' }: SectionProps) {
  const t = crearT(locale);
  const block = project.themeConfig?.videoBlock;
  const parsed = block?.url ? parseEmbedVideo(block.url) : null;
  if (!parsed) return null;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);

  const isEmbed = parsed.kind === 'iframe';
  const player = (
    <div className="relative aspect-video w-full overflow-hidden rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-black">
      {isEmbed ? (
        <iframe
          src={parsed.src}
          title={block?.title || t('sitio.video.videoDe', { nombre: project.name })}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      ) : (
        <video
          src={parsed.src}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );

  if (template === 'comercial') {
    return (
      <section id="video" className="py-[calc(var(--theme-spacing)/1.4)] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)]">
        <Container className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div className="space-y-4">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--theme-accent)]">
              {t('sitio.video.recorridoEnVideo')}
            </span>
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(28px,3.8vw,48px)] leading-[1.06] font-bold tracking-[-0.03em] text-[var(--theme-text-on-dark)]">
              {block?.title?.trim() || t('sitio.video.tituloComercial')}
            </h2>
            {block?.caption?.trim() && (
              <p className="m-0 text-sm sm:text-base text-[var(--theme-text-on-dark-muted)] leading-relaxed">
                {block.caption}
              </p>
            )}
          </div>
          <Reveal delay={0.08}>{player}</Reveal>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="video" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6 border-b border-[var(--theme-border)] mb-8">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
              {t('sitio.video.film')}
            </span>
            <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-2xl sm:text-3xl font-medium text-[var(--theme-text)]">
              {block?.title?.trim() || project.name}
            </h2>
          </div>
          <Reveal delay={0.08} className="p-3 sm:p-5 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)]">
            {player}
            {block?.caption?.trim() && (
              <p className="m-0 mt-3 text-xs sm:text-sm text-[var(--theme-text-muted)]">{block.caption}</p>
            )}
          </Reveal>
        </Container>
      </section>
    );
  }

  return (
    <section id="video" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
      <Container>
        <SectionHeading
          eyebrow={t('sitio.video.audiovisual')}
          title={block?.title?.trim() || t('sitio.video.titulo')}
          muted={block?.title?.trim() ? undefined : t('sitio.video.tituloAtenuado')}
        />
        <Reveal delay={0.08} className="mt-10">
          {player}
          {block?.caption?.trim() && (
            <p className="mt-3 text-sm text-[var(--theme-text-muted)]">{block.caption}</p>
          )}
        </Reveal>
      </Container>
    </section>
  );
}
