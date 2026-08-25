import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Reveal from '@/components/ui/Reveal';

export default function LandingFinalCta() {
  return (
    <section className="py-24 md:py-32 px-4 sm:px-6 lg:px-8 text-center">
      <Reveal className="max-w-2xl mx-auto">
        <h2 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Sumá tu proyecto a Atrium.
        </h2>
        <p className="mt-4 text-white/60 text-lg">
          Registrate y armá el sitio de tu primer proyecto en minutos.
        </p>
        <div className="mt-8">
          <Link href="/admin/signup" className="inline-block px-6 py-3.5 rounded-lg bg-white text-stone-900 text-sm font-medium hover:bg-white/90 transition-colors">
            Registrarme
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
