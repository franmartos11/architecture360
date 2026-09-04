import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

export interface EmbeddedProject {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  masterplan_image: string | null;
}

interface PostProjectEmbedProps {
  project: EmbeddedProject;
  kind: 'project' | 'tour';
}

// Card de proyecto/recorrido adjuntado a un post — calcada del bloque
// "post.project" del mockup Feed.dc.html (thumbnail angosto + label +
// título + meta + badge). "tour" es el mismo proyecto pero resaltando su
// recorrido 360 en vez de la ficha genérica (ver acción "Recorrido 360"
// del composer en PostFeed.tsx).
export default function PostProjectEmbed({ project, kind }: PostProjectEmbedProps) {
  const href = kind === 'tour' ? `/proyecto/${project.slug}/recorrido` : `/proyecto/${project.slug}`;
  const label = kind === 'tour' ? 'RECORRIDO 360' : 'FICHA DE PROYECTO';
  const badge = kind === 'tour' ? 'Recorrido 360 disponible' : 'Ver ficha completa';

  return (
    <Link
      href={href}
      className="mt-3.5 border border-[rgba(28,25,23,0.1)] rounded-xl overflow-hidden flex hover:border-[rgba(92,122,88,0.5)] transition-colors"
    >
      <div className="w-[126px] shrink-0 relative bg-[repeating-linear-gradient(115deg,#e6e3dc_0_14px,#dedbd3_14px_28px)]">
        {project.masterplan_image && (
          <Image src={project.masterplan_image} alt="" fill sizes="126px" className="object-cover" />
        )}
      </div>
      <div className="px-[15px] py-[13px] min-w-0">
        <p className="font-medium text-[9.5px] tracking-[0.12em] text-[rgba(28,25,23,0.4)]">{label}</p>
        <p className="font-semibold text-sm text-[#1c1a17] mt-[5px] truncate">{project.name}</p>
        {project.location && (
          <p className="font-light text-[11.5px] leading-[1.5] text-[rgba(28,25,23,0.52)] mt-[3px]">{project.location}</p>
        )}
        <div className="flex gap-1.5 mt-2.5">
          <span className="h-[22px] px-2.5 rounded-[6px] text-[10.5px] font-medium flex items-center" style={{ background: 'rgba(92,122,88,0.13)', color: '#4a6647' }}>
            {badge}
          </span>
        </div>
      </div>
    </Link>
  );
}
