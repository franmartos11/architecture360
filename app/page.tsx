import Navbar from '@/components/ui/Navbar';
import { TabsSection } from '@/components/TabsSection';
import Calculator from '@/components/Calculator';
import HomeContactForm from '@/components/HomeContactForm';
import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { DEFAULT_PROJECT_SLUG } from '@/lib/constants';
import { getProjectBySlug } from '@/data/project-repository';
import dynamic from 'next/dynamic';

// Swiper (carrusel + CSS + módulos) pesa bastante y estas secciones están
// debajo del fold — se cargan solo cuando el bundle del cliente las necesita,
// en vez de sumarse al JS inicial que bloquea el hero.
const CAROUSEL_LOADING = <div className="w-full max-w-6xl mx-auto h-[400px] rounded-xl bg-gray-100 animate-pulse" />;
const AmenitiesCarousel = dynamic(() => import('@/components/SwiperCarousels').then(m => m.AmenitiesCarousel), {
  loading: () => CAROUSEL_LOADING,
});
const PointsOfInterestCarousel = dynamic(() => import('@/components/SwiperCarousels').then(m => m.PointsOfInterestCarousel), {
  loading: () => CAROUSEL_LOADING,
});

export default async function HomePage() {
  const project = await getProjectBySlug(DEFAULT_PROJECT_SLUG);

  return (
    <div className="bg-trevo-light min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background video/image placeholder */}
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80"
            alt="Hero background"
            fill
            sizes="100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl(1920, 1080)}
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative z-10 text-center px-4 sm:px-6 mt-16 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-thin tracking-wide text-white animate-fade-in-up">
            VIVE TU PRÓXIMO HOGAR <span className="font-medium">EN ARMONÍA</span>
          </h1>
        </div>

        <a href="#next" className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <div className="w-10 h-10 rounded-full border border-white/50 flex items-center justify-center text-white backdrop-blur-sm">
            &darr;
          </div>
        </a>
      </section>

      {/* Intro Section */}
      <section id="next" className="py-24 bg-trevo-light">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl font-light text-trevo-dark tracking-wide">
              Donde el diseño contemporáneo y la vida se encuentran
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            <Reveal className="space-y-6">
              <h2 className="text-3xl font-light text-trevo-dark leading-tight">
                NACE DE UNA VISIÓN ÚNICA, DONDE ARQUITECTURA Y CONFORT EVOLUCIONAN JUNTOS
              </h2>
              <p className="text-trevo-dark/80 font-light leading-relaxed">
                <span className="font-medium">Residencias Natura parte de una premisa esencial:</span> crear espacios que se adapten a tu estilo de vida. El proyecto se diseña como un sistema integral donde cada detalle arquitectónico y área verde dialogan en perfecta armonía, para construir una experiencia de bienestar diario.
              </p>
              <div className="pt-4 flex flex-wrap gap-4">
                <button className="btn-outline">MÁS SOBRE EL PROYECTO</button>
                <button className="btn-solid-green">TOUR 360°</button>
              </div>
            </Reveal>

            <Reveal delay={0.15} className="relative h-[320px] sm:h-[420px] md:h-[600px] w-full rounded-2xl overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
                alt="Arquitectura"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl()}
                className="object-cover"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Amenities Section */}
      <section className="py-24 bg-trevo-light">
        <Reveal className="max-w-7xl mx-auto px-4 md:px-6 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 items-end">
            <h2 className="text-3xl font-medium text-trevo-dark">
              AMENIDADES INTEGRADAS PARA TU DÍA A DÍA
            </h2>
            <p className="text-trevo-dark/70 font-light">
              Espacios exclusivos pensados como extensión de tu hogar: para disfrutar, relajarte y conectar.
            </p>
          </div>
        </Reveal>

        {project && <AmenitiesCarousel amenities={project.amenities} projectSlug={project.slug} />}
      </section>

      {/* 360 Tour Section */}
      <section id="tour-360" className="py-24 bg-trevo-light">
        <Reveal className="max-w-6xl mx-auto px-6 text-center space-y-4 mb-12">
          <h2 className="text-3xl font-light text-trevo-dark tracking-widest">MASTERPLAN INTERACTIVO</h2>
          <p className="text-trevo-dark/70 font-light">Explora el proyecto desde cualquier ángulo con nuestro visor 3D interactivo.</p>
        </Reveal>

        <Reveal delay={0.15} className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative w-full aspect-[4/3] sm:aspect-[21/9] rounded-2xl overflow-hidden bg-trevo-dark group mb-8 shadow-2xl">
            <Image
              src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
              alt="Vista previa del masterplan"
              fill
              sizes="(min-width: 896px) 896px, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-500"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              <h3 className="text-white text-2xl sm:text-3xl font-light tracking-widest mb-6 text-center">RESIDENCIAS NATURA</h3>
              <a href={`/proyecto/${project?.slug ?? DEFAULT_PROJECT_SLUG}`} className="btn-outline-white bg-white/10 backdrop-blur-md hover:bg-white text-white hover:text-trevo-dark">
                ENTRAR AL MASTERPLAN
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Typologies Section */}
      <section id="modelos" className="py-24 bg-trevo-green">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="mb-16 space-y-4">
            <div className="text-white/70 tracking-widest text-sm font-semibold">MODELOS DISPONIBLES</div>
            <h2 className="text-4xl md:text-5xl font-light text-white leading-tight max-w-3xl">
              DISEÑADOS PARA INSPIRAR Y ADAPTARSE A TU RUTINA
            </h2>
            <p className="text-white/80 font-light max-w-xl">
              Espacios funcionales con excelente iluminación natural, amplias terrazas y distribuciones inteligentes que priorizan tu comodidad.
            </p>
          </Reveal>

          <Reveal delay={0.15} className="bg-trevo-light rounded-2xl p-8 md:p-12">
            <TabsSection />
          </Reveal>
        </div>
      </section>

      {/* Zone / Location Section */}
      {project && project.pointsOfInterest.some(p => p.image) && (
        <section className="py-24 bg-trevo-dark">
          <Reveal className="max-w-6xl mx-auto px-4 md:px-6 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <h2 className="text-3xl md:text-4xl font-light text-white max-w-lg leading-tight">
              UBICACIÓN PRIVILEGIADA EN EL CORAZÓN DE LA CIUDAD
            </h2>
            <a href={`/proyecto/${project.slug}/ubicacion`} className="btn-outline-white whitespace-nowrap w-full md:w-auto">
              DESCUBRIR LA ZONA
            </a>
          </Reveal>

          <PointsOfInterestCarousel pointsOfInterest={project.pointsOfInterest} projectSlug={project.slug} />
        </section>
      )}

      {/* Calculator Section */}
      <Calculator />

      {/* Contact Section */}
      <section className="py-24 bg-trevo-green relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          <Reveal>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-thin text-white leading-tight mb-6 text-center md:text-left">
              Trevoluciona <br/>
              <span className="font-medium">tu forma de vivir</span>
            </h2>
          </Reveal>

          <Reveal delay={0.15} className="bg-white/5 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-white/10">
            <div className="text-white mb-6 md:mb-8 font-light text-center md:text-left">Completa el formulario para obtener más información.</div>
            <HomeContactForm />
          </Reveal>
        </div>
      </section>

      {/* Footer Placeholder */}
      <footer className="bg-trevo-dark text-white py-12 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-2xl font-bold tracking-widest">RESIDENCIAS NATURA</div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-light text-white/70">
            <a href="/" className="hover:text-white transition-colors">Inicio</a>
            <a href="#next" className="hover:text-white transition-colors">Nosotros</a>
            <a href="#modelos" className="hover:text-white transition-colors">Modelos</a>
            <a href="#cotizador" className="hover:text-white transition-colors">Cotizador</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
