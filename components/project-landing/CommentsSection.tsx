import Reveal from '@/components/ui/Reveal';
import CommentSection from '@/components/CommentSection';
import { Container, SectionHeading } from './ui';
import type { SectionProps } from './types';
import { crearT } from '@/lib/i18n/t';

// Comentarios públicos del proyecto. Antes era "chrome" fijo de la página
// (siempre al final, sin forma de sacarlo); ahora es una sección más del
// registro, así el admin la apaga o la mueve desde Sitio → Secciones.
export default function CommentsSection({ project, locale = 'es' }: SectionProps) {
  const t = crearT(locale);
  return (
    <section id="comentarios" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal>
          <SectionHeading eyebrow={t('sitio.comentarios.eyebrow')} title={t('sitio.comentarios.titulo')} muted={t('sitio.comentarios.tituloAtenuado')} className="mb-10" />
        </Reveal>
        <div className="max-w-3xl">
          <CommentSection entityType="project" entityId={project.id} />
        </div>
      </Container>
    </section>
  );
}
