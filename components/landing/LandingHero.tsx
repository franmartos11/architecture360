import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Reveal from '@/components/ui/Reveal';

export default function LandingHero() {
  return (
    <section className="relative pt-28 pb-20 md:pt-24 md:pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 md:gap-8 items-center">
        <Reveal>
          <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.1]">
            Del plano al recorrido <span className="text-brand-400">360°</span>, en un solo sitio.
          </h1>
          <p className="mt-5 text-white/60 text-base md:text-lg leading-relaxed max-w-md">
            Cargá el masterplan, las plantas y el recorrido 360° de tu proyecto, sea para un cliente o para tu portfolio.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/admin/signup" className="px-5 py-3 rounded-lg bg-white text-stone-900 text-sm font-medium hover:bg-white/90 transition-colors">
              Registrarme
            </Link>
            <Link href="/admin/login" className="px-5 py-3 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition-colors">
              Ingresar
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="relative">
          <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]">
            <Image
              src="/masterplan/render-exterior.png"
              alt="Masterplan interactivo de un proyecto cargado en Atrium"
              width={1024}
              height={1024}
              priority
              className="w-full h-auto aspect-[4/3] object-cover"
            />
          </div>
          <div className="hidden sm:block absolute -bottom-8 -left-8 w-40 h-40 rounded-2xl overflow-hidden border-4 border-stone-950 shadow-2xl rotate-[-4deg]">
            <Image
              src="/tours/sample-pano.png"
              alt="Recorrido virtual 360° de un ambiente"
              width={512}
              height={512}
              className="w-full h-full object-cover"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
