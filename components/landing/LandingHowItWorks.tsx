import { FolderUp, Orbit, Link2 } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const STEPS = [
  {
    icon: FolderUp,
    title: 'Cargá tu proyecto',
    copy: 'Sumá plantas, precios y fotos desde el panel de administración.',
  },
  {
    icon: Orbit,
    title: 'Subí tus recorridos 360°',
    copy: 'Conectá las panorámicas de cada ambiente y calibrá la orientación solar.',
  },
  {
    icon: Link2,
    title: 'Compartí el link',
    copy: 'Cada proyecto tiene su propio sitio, listo para mandar a tus clientes.',
  },
];

export default function LandingHowItWorks() {
  return (
    <section id="como-funciona" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white text-center">
            Así se arma tu sitio.
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-3 gap-10 md:gap-6 relative">
          <div className="hidden md:block absolute top-6 left-[16.5%] right-[16.5%] h-px bg-white/10" />
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08} className="relative flex flex-col items-center text-center gap-3">
              <div className="relative z-10 w-12 h-12 rounded-full bg-stone-950 border border-white/15 flex items-center justify-center">
                <step.icon className="w-5 h-5 text-brand-400" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-lg font-semibold text-white">{step.title}</h3>
              <p className="text-sm text-white/55 leading-relaxed max-w-[26ch]">{step.copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
