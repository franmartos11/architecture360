import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Reveal from '@/components/ui/Reveal';

export default function LandingFinalCta() {
  return (
    <section id="registro" className="py-16 md:py-20 px-4 sm:px-6 lg:px-8">
      <Reveal className="max-w-7xl mx-auto border border-white/10 rounded-[22px] bg-white/[0.03] p-8 md:p-13 grid md:grid-cols-[1.2fr_.8fr] gap-8 md:gap-10 items-center">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-3xl md:text-[44px] leading-[1.1] md:leading-[1.05] tracking-tight font-extrabold text-white">
            Sumá tu proyecto a Atrium.
          </h2>
          <p className="text-base md:text-[17px] leading-relaxed text-white/60 max-w-lg">
            Creá la cuenta, cargá un proyecto y mandá el link el mismo día.
          </p>
        </div>
        <div className="flex flex-col gap-3 items-start">
          <Link
            href="/admin/signup"
            className="w-full text-center px-6 py-[15px] rounded-[10px] bg-white text-stone-900 text-[15px] font-medium hover:bg-white/90 transition-colors"
          >
            Registrarme
          </Link>
          <Link
            href="/admin/login"
            className="w-full text-center px-6 py-[15px] rounded-[10px] border border-white/20 text-white text-[15px] font-medium hover:bg-white/5 transition-colors"
          >
            Ya tengo cuenta
          </Link>
          <span className="text-[13px] text-white/40">Sin instalar nada. Sin hosting propio.</span>
        </div>
      </Reveal>
    </section>
  );
}
