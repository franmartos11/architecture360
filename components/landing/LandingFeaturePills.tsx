import Reveal from '@/components/ui/Reveal';

const FEATURES = [
  { title: 'Multi-proyecto', copy: 'Una cuenta, varios proyectos, cada uno con su sitio y su equipo.' },
  { title: 'Colaboradores', copy: 'Invitá a tu equipo con rol asignado y crédito en su perfil.' },
  { title: 'Monedas múltiples', copy: 'Precios en la moneda que uses, con ajustes por % o monto.' },
  { title: 'Temas personalizables', copy: 'Color y tipografía por proyecto, con vista previa antes de publicar.' },
  { title: 'Orientación solar', copy: 'La luz de cada tour sigue la hora del día y el norte real del lote.' },
  { title: 'Leads y embudo', copy: 'Las consultas del sitio entran ordenadas por etapa comercial.' },
];

export default function LandingFeaturePills() {
  return (
    <section className="py-6 md:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Reveal className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-4.5">
          <h2 className="font-display text-xl md:text-[26px] font-bold tracking-tight text-white">
            Pensado para estudios y desarrolladoras.
          </h2>
          <span className="text-[13.5px] text-white/40">Todo incluido en la plataforma</span>
        </Reveal>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-px bg-white/10 border-b border-white/10">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.04} className="bg-stone-950 p-5.5 flex flex-col gap-1.5">
              <h3 className="font-display text-base font-bold text-white">{feature.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-white/50">{feature.copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
