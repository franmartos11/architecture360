import type { EmbeddedProject } from '@/components/social/PostProjectEmbed';
import { formatUpdateDate } from '@/lib/construction-progress';
import { getProjectHref } from '@/lib/project-url';

export interface EmbeddedProgressUpdate {
  id: string;
  date: string;
  title: string;
  percent: number | null;
  cover: string | null;
  /** Clip de la entrada cuando no tiene fotos — se muestra su primer cuadro. */
  video: string | null;
}

// Tarjeta de una entrada del avance de obra compartida en el feed. Misma
// estructura que PostProjectEmbed, pero con la portada de la entrada, su
// fecha y su título; enlaza a la bitácora de la landing (#avance-<id>).
export default function PostProgressEmbed({ project, update }: { project: EmbeddedProject; update: EmbeddedProgressUpdate }) {
  const href = `${getProjectHref(project.slug)}#avance-${encodeURIComponent(update.id)}`;
  const date = formatUpdateDate(update.date);

  return (
    <a
      href={href}
      className="mt-3.5 border border-[rgba(28,25,23,0.1)] rounded-xl overflow-hidden flex hover:border-[rgba(92,122,88,0.5)] transition-colors"
    >
      <div className="w-[126px] shrink-0 relative bg-[repeating-linear-gradient(115deg,#e6e3dc_0_14px,#dedbd3_14px_28px)]">
        {update.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={update.cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : update.video ? (
          // El #t=0.1 hace que el navegador pinte un cuadro como poster sin descargar el clip entero.
          <video src={`${update.video}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="px-[15px] py-[13px] min-w-0">
        <p className="font-medium text-[9.5px] tracking-[0.12em] text-[rgba(28,25,23,0.4)]">
          AVANCE DE OBRA{date ? ` · ${date.toUpperCase()}` : ''}
        </p>
        <p className="font-semibold text-sm text-[#1c1a17] mt-[5px] line-clamp-2">{update.title}</p>
        <p className="font-light text-[11.5px] leading-[1.5] text-[rgba(28,25,23,0.52)] mt-[3px] truncate">{project.name}</p>
        <div className="flex gap-1.5 mt-2.5">
          {update.percent != null && (
            <span className="h-[22px] px-2.5 rounded-[6px] text-[10.5px] font-medium flex items-center" style={{ background: 'rgba(92,122,88,0.13)', color: '#4a6647' }}>
              {update.percent}% de avance
            </span>
          )}
          <span className="h-[22px] px-2.5 rounded-[6px] text-[10.5px] font-medium flex items-center" style={{ background: '#f5f4f0', color: 'rgba(28,25,23,0.66)' }}>
            Ver en la obra
          </span>
        </div>
      </div>
    </a>
  );
}
