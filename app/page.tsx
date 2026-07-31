import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import Image from 'next/image';
import Navbar from '@/components/ui/Navbar';
import { demoProject } from '@/data/mockData';

export default function HomePage() {
  const project = demoProject;
  const availableCount = project.units.filter((u) => u.status === 'available').length;

  return (
    <>
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-grid-pattern">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--background)]/50 to-[var(--background)]" />

        {/* Floating orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-brand-600/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-32 right-20 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }} />

        <div className="relative z-10 text-center max-w-4xl mx-auto px-6 pt-24">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-light text-xs font-medium text-white/60 mb-8 animate-fade-in-up">
            <span className="w-1.5 h-1.5 rounded-full bg-status-available animate-pulse" />
            {availableCount} unidades disponibles
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            Explorá tu próximo hogar{' '}
            <span className="gradient-text">de forma interactiva</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Masterplan interactivo con disponibilidad en tiempo real y recorridos virtuales 360° de cada unidad.
            Tecnología de vanguardia para la comercialización inmobiliaria.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Link
              href="/proyecto/demo"
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-brand-600/30 hover:-translate-y-0.5 animate-pulse-glow"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
              Ver Masterplan
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Project Card Section */}
      <section className="relative -mt-32 z-20 max-w-6xl mx-auto px-6 pb-20">
        <div className="glass rounded-3xl overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-0">
            {/* Image */}
            <div className="relative h-64 lg:h-auto">
              <Image
                src={project.masterplanImage}
                alt={project.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface-50/80 hidden lg:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-50/90 to-transparent lg:hidden" />
            </div>

            {/* Details */}
            <div className="p-8 lg:p-12 flex flex-col justify-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-2">
                Proyecto destacado
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-3">
                {project.name}
              </h2>
              <p className="text-white/50 mb-6 leading-relaxed">
                {project.description}
              </p>

              <div className="flex items-center gap-2 text-sm text-white/40 mb-8">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                {project.location}
              </div>

              {/* Amenities pills */}
              <div className="flex flex-wrap gap-2 mb-8">
                {project.amenities.slice(0, 5).map((amenity) => (
                  <span
                    key={amenity}
                    className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-white/50"
                  >
                    {amenity}
                  </span>
                ))}
                {project.amenities.length > 5 && (
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-white/40">
                    +{project.amenities.length - 5} más
                  </span>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div>
                  <div className="text-2xl font-bold text-white">{project.units.length}</div>
                  <div className="text-xs text-white/40">Unidades</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-status-available">{availableCount}</div>
                  <div className="text-xs text-white/40">Disponibles</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">3</div>
                  <div className="text-xs text-white/40">Torres</div>
                </div>
              </div>

              <Link
                href="/proyecto/demo"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-brand-600/25 w-full sm:w-auto"
              >
                Explorar Masterplan
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-3">
            Tecnología que vende
          </h2>
          <p className="text-white/40 max-w-xl mx-auto">
            Herramientas interactivas que transforman la experiencia de compra inmobiliaria
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            }
            title="Masterplan Interactivo"
            description="Visualización aérea del proyecto con polígonos SVG que muestran disponibilidad en tiempo real. Click para ver detalles de cada unidad."
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            title="Tours Virtuales 360°"
            description="Recorridos inmersivos del interior de cada unidad con Marzipano. Ultra ligero y compatible con todos los dispositivos."
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            }
            title="Datos en Tiempo Real"
            description="Integración con CRM para reflejar precios, disponibilidad y estados de cada unidad actualizados al instante."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-[10px]">
              360
            </div>
            <span className="text-sm text-white/30">InteractiveRE</span>
          </div>
          <p className="text-xs text-white/20">
            Demo de plataforma inmobiliaria interactiva · Masterplan + Tours 360°
          </p>
        </div>
      </footer>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-2xl p-6 hover:bg-white/[0.03] transition-all duration-300 group">
      <div className="w-12 h-12 rounded-xl bg-brand-600/10 border border-brand-600/20 flex items-center justify-center text-brand-400 mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}
