'use client';

import { useState } from 'react';
import Reveal from '@/components/ui/Reveal';

const FAQS = [
  {
    q: '¿Necesito saber de web para armar el sitio?',
    a: 'No. Cargás el proyecto desde el panel y el sitio se arma solo. El editor de estilo cambia colores y tipografía con vista previa, sin tocar código.',
  },
  {
    q: '¿Cómo subo los recorridos 360°?',
    a: 'Subís la panorámica de cada ambiente, las conectás entre sí con hotspots y calibrás el norte para que la luz siga la orientación solar real.',
  },
  {
    q: '¿Puedo manejar varios proyectos con una cuenta?',
    a: 'Sí. Cada proyecto tiene su propio sitio, su inventario, su equipo de colaboradores y su tema visual.',
  },
  {
    q: '¿Sirve si todavía no vendo unidades?',
    a: 'Sí. El mismo proyecto se puede publicar en modo portfolio, sin precios ni disponibilidad, y sumarlo después.',
  },
  {
    q: '¿Puedo invitar a mi equipo?',
    a: 'Sí, con colaboradores por proyecto y rol asignado. El crédito de la obra queda en el perfil de cada persona.',
  },
  {
    q: '¿En qué moneda muestro los precios?',
    a: 'En la que uses. El inventario soporta monedas múltiples y ajustes por porcentaje o monto fijo sobre la selección.',
  },
];

export default function LandingFaq() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="preguntas" className="border-t border-white/10 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto py-14 md:py-16 px-4 sm:px-6 lg:px-8 grid md:grid-cols-[.7fr_1.3fr] gap-12">
        <Reveal className="flex flex-col gap-3">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">Preguntas</span>
          <h2 className="font-display text-2xl md:text-[34px] leading-tight tracking-tight font-bold text-white">
            Lo que suelen preguntar antes de empezar.
          </h2>
        </Reveal>

        <div className="flex flex-col">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={faq.q} className="border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="w-full bg-transparent border-0 py-5 flex items-center justify-between gap-5 cursor-pointer text-left"
                >
                  <span className="font-display text-base md:text-[17px] font-semibold text-white">{faq.q}</span>
                  <span
                    className={`font-light text-xl text-brand-300 leading-none shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-45' : 'rotate-0'
                    }`}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <p className="pb-5.5 text-[14.5px] leading-relaxed text-white/58 max-w-2xl">{faq.a}</p>
                )}
              </div>
            );
          })}
          <div className="border-t border-white/10" />
        </div>
      </div>
    </section>
  );
}
