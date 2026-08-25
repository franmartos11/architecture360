import { Layers, Users, Banknote, Palette, Sun } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const PILLS = [
  { icon: Layers, label: 'Multi-proyecto' },
  { icon: Users, label: 'Colaboradores' },
  { icon: Banknote, label: 'Monedas múltiples' },
  { icon: Palette, label: 'Temas personalizables' },
  { icon: Sun, label: 'Orientación solar en tours' },
];

export default function LandingFeaturePills() {
  return (
    <section className="py-16 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white text-center">
            Pensado para estudios y desarrolladoras.
          </h2>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-8 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center">
            {PILLS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="snap-start shrink-0 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5"
              >
                <Icon className="w-4 h-4 text-brand-400" strokeWidth={1.5} />
                <span className="text-sm text-white/75 whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
