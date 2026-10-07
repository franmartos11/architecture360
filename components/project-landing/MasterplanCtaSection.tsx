import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { SectionProps } from './types';

// CTA al masterplan interactivo. Solo existe si hay vistas aéreas cargadas
// (mismo criterio que sectionHasContent): sin ellas /masterplan es una
// pantalla en blanco, y antes este bloque igual se mostraba con una foto de
// stock de Unsplash, invitando a entrar a un masterplan vacío.
export default function MasterplanCtaSection({ project, basePath, typeConfig }: SectionProps) {
  const firstSlide = project.aerialSlides[0];
  if (!firstSlide) return null;

  const isHouse = !typeConfig.hasUnitStep;
  const preview = project.masterplanImage || firstSlide.imageUrl;
  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-6xl mx-auto px-6 text-center space-y-4 mb-12">
        <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] tracking-widest">
          {isHouse ? 'VISTA FRONTAL' : 'MASTERPLAN INTERACTIVO'}
        </h2>
        <p className="text-[var(--theme-text-muted)] font-light">
          {isHouse
            ? 'Entrá a recorrer la casa desde el frente.'
            : 'Explorá el proyecto desde cualquier ángulo con nuestro visor interactivo.'}
        </p>
      </Reveal>

      <Reveal delay={0.15} className="max-w-4xl mx-auto px-6 text-center">
        <div className="relative w-full aspect-[4/3] sm:aspect-[21/9] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-bg-alt)] group mb-8 shadow-2xl">
          {preview && (
            <Image
              src={preview}
              alt={`Vista previa del masterplan de ${project.name}`}
              fill
              sizes="(min-width: 896px) 896px, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-500"
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
            <h3 className="font-[family-name:var(--theme-font-heading)] text-[var(--theme-text-on-dark)] text-2xl sm:text-3xl font-light tracking-widest mb-6 text-center">{project.name.toUpperCase()}</h3>
            <a
              href={`${basePath}/masterplan`}
              className="px-6 py-3 border border-[var(--theme-text-on-dark)] bg-[var(--theme-text-on-dark)]/10 backdrop-blur-md text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)] hover:text-[var(--theme-bg-alt)] transition-colors duration-300 tracking-wider text-sm"
            >
              {isHouse ? 'ENTRAR A LA CASA' : 'ENTRAR AL MASTERPLAN'}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
