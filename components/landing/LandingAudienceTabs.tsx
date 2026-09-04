'use client';

import { useState } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Reveal from '@/components/ui/Reveal';

const AUDIENCES = [
  {
    id: 'desarrolladoras',
    label: 'Desarrolladoras',
    title: 'Un sitio de venta por proyecto, siempre al día.',
    copy: 'Cargá las unidades con precio, superficie y estado. Cuando cambia el stock cambia el sitio: nadie vuelve a mandar el PDF de hace tres meses.',
    cta: 'Ver cómo se carga el inventario',
    points: [
      'Inventario con precios, superficies y disponibilidad en vivo',
      'Consultas del sitio ordenadas en un embudo comercial',
      'Ajustes de precio en lote y monedas múltiples',
    ],
    image: '/aerial/view-1.png',
    alt: 'Vista aérea de un proyecto residencial en venta',
  },
  {
    id: 'estudios',
    label: 'Estudios',
    title: 'Tu obra mostrada como se merece, no como un adjunto.',
    copy: 'Masterplan, plantas y recorridos 360° en un link propio, con el color y la tipografía de tu estudio en cada proyecto.',
    cta: 'Ver el editor de estilo',
    points: [
      'Tema visual y tipografía definidos por proyecto',
      'Colaboradores con rol y crédito en su perfil',
      'Recorridos 360° con orientación solar real',
    ],
    image: '/masterplan/render-exterior.png',
    alt: 'Render exterior de una obra publicada por un estudio',
  },
  {
    id: 'arquitectos',
    label: 'Arquitectos y estudiantes',
    title: 'Un portfolio que se arma con proyectos, no con capturas.',
    copy: 'Subí un proyecto y ya tenés perfil, trayectoria y un link para mandar a un estudio, a un concurso o a una entrega.',
    cta: 'Ver un perfil de ejemplo',
    points: [
      'Perfil con experiencia, formación y proyectos propios',
      'Publicaciones de avances en el feed de la comunidad',
      'Funciona igual con un solo proyecto cargado',
    ],
    image: '/units/gallery-3.png',
    alt: 'Interior de un proyecto publicado en un perfil',
  },
] as const;

export default function LandingAudienceTabs() {
  const [activeId, setActiveId] = useState<(typeof AUDIENCES)[number]['id']>('desarrolladoras');
  const active = AUDIENCES.find((a) => a.id === activeId) ?? AUDIENCES[0];

  return (
    <section className="py-14 md:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-5">
          <h2 className="font-display text-2xl md:text-[30px] font-bold tracking-tight text-white">
            ¿Qué necesitás mostrar?
          </h2>
          <div className="flex gap-1.5 p-1 border border-white/10 rounded-full bg-white/[0.03]">
            {AUDIENCES.map((aud) => (
              <button
                key={aud.id}
                type="button"
                onClick={() => setActiveId(aud.id)}
                className={`rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${
                  aud.id === activeId ? 'bg-brand-300 text-[#12140f]' : 'text-white/60 hover:text-white'
                }`}
              >
                {aud.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-12 items-center pt-9">
          <Reveal key={active.id} className="flex flex-col gap-4.5">
            <h3 className="font-display text-3xl md:text-4xl leading-tight tracking-tight font-bold text-white text-balance">
              {active.title}
            </h3>
            <p className="text-white/60 text-[16.5px] leading-relaxed max-w-lg text-balance">{active.copy}</p>

            <div className="flex flex-col border-y border-white/10 mt-1.5">
              {active.points.map((point, i) => (
                <div key={point} className="flex items-baseline gap-3.5 py-3.5 border-white/10 [&:not(:first-child)]:border-t">
                  <span className="font-display text-xs font-bold text-brand-400 min-w-[18px]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[15px] text-white/80 leading-snug">{point}</span>
                </div>
              ))}
            </div>

            <Link
              href="#registro"
              className="text-[14.5px] font-medium text-white border-b border-brand-300/50 pb-0.5 self-start mt-1.5 hover:text-brand-300 hover:border-brand-300 transition-colors"
            >
              {active.cta}
            </Link>
          </Reveal>

          <Reveal delay={0.05} className="rounded-[18px] overflow-hidden border border-white/10">
            <Image
              src={active.image}
              alt={active.alt}
              width={1024}
              height={704}
              className="w-full h-auto aspect-[16/11] object-cover"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
