import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Reveal from '@/components/ui/Reveal';

const STATS = [
  { label: 'Masterplan', copy: 'clickeable por unidad' },
  { label: 'Tours 360°', copy: 'con orientación solar' },
  { label: 'Inventario', copy: 'precios y stock en vivo' },
];

export default function LandingHero() {
  return (
    <section id="top" className="relative min-h-[100dvh] flex flex-col justify-center pt-24 pb-10 md:pt-28 md:pb-10 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="w-full max-w-7xl mx-auto grid md:grid-cols-2 gap-12 md:gap-14 items-center">
        <Reveal className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-300" />
            <span className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-brand-300">
              Para estudios, desarrolladoras y arquitectos
            </span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-[56px] font-extrabold tracking-tight text-white leading-[1.05] lg:leading-[1.03]">
            Del plano al recorrido <span className="text-brand-300">360°</span>, en un solo link.
          </h1>

          <p className="text-white/60 text-base md:text-[17.5px] leading-relaxed max-w-md">
            Cargá el masterplan, las plantas, los precios y los recorridos 360° una vez. Atrium arma el sitio del
            proyecto y lo mantiene al día — sin PDFs viejos circulando por WhatsApp.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/admin/signup" className="px-[22px] py-3.5 rounded-[10px] bg-white text-stone-900 text-sm font-medium hover:bg-white/90 transition-colors">
              Registrarme
            </Link>
            <Link href="/admin/login" className="px-[22px] py-3.5 rounded-[10px] border border-white/20 text-white text-sm font-medium hover:bg-white/5 transition-colors">
              Ingresar
            </Link>
            <span className="text-[13px] text-white/40 pl-1.5">Empezá con un proyecto</span>
          </div>

          <div className="grid grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-stone-950 px-4.5 py-4 flex flex-col gap-1">
                <span className="font-display text-[15px] font-bold text-white">{stat.label}</span>
                <span className="text-[12.5px] text-white/45 leading-tight">{stat.copy}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="relative">
          <div className="relative rounded-[20px] overflow-hidden border border-white/10 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.85)]">
            <Image
              src="/masterplan/render-exterior.png"
              alt="Masterplan interactivo de un proyecto cargado en Atrium"
              width={1024}
              height={1024}
              priority
              className="w-full h-auto aspect-[4/3] object-cover"
            />
          </div>
          <div className="hidden sm:block absolute -bottom-6.5 -left-6.5 w-[172px] rounded-[14px] overflow-hidden border-4 border-stone-950 shadow-2xl rotate-[-4deg]">
            <Image
              src="/tours/sample-pano.png"
              alt="Recorrido virtual 360° de un ambiente"
              width={512}
              height={512}
              className="w-full aspect-square object-cover"
            />
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-stone-950/70 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-300" />
            <span className="text-xs text-white/80">atrium.app/proyecto/tu-obra</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
