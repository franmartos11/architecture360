import Navbar from '@/components/ui/Navbar';
import { AmenitiesCarousel, ZonesCarousel } from '@/components/SwiperCarousels';
import { TabsSection } from '@/components/TabsSection';
import Calculator from '@/components/Calculator';
import Image from 'next/image';

export default function HomePage() {
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
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl font-light text-trevo-dark tracking-wide">
              Donde el diseño contemporáneo y la vida se encuentran
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="space-y-6">
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
            </div>
            
            <div className="relative h-[600px] w-full rounded-2xl overflow-hidden">
              <Image 
                src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" 
                alt="Arquitectura" 
                fill 
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Amenities Section */}
      <section className="py-24 bg-trevo-light">
        <div className="max-w-7xl mx-auto px-4 md:px-6 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 items-end">
            <h2 className="text-3xl font-medium text-trevo-dark">
              AMENIDADES INTEGRADAS PARA TU DÍA A DÍA
            </h2>
            <p className="text-trevo-dark/70 font-light">
              Espacios exclusivos pensados como extensión de tu hogar: para disfrutar, relajarte y conectar.
            </p>
          </div>
        </div>
        
        <AmenitiesCarousel />
      </section>

      {/* 360 Tour Section */}
      <section id="tour-360" className="py-24 bg-trevo-light">
        <div className="max-w-6xl mx-auto px-6 text-center space-y-4 mb-12">
          <h2 className="text-3xl font-light text-trevo-dark tracking-widest">MASTERPLAN INTERACTIVO</h2>
          <p className="text-trevo-dark/70 font-light">Explora el proyecto desde cualquier ángulo con nuestro visor 3D interactivo.</p>
        </div>
        
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative w-full aspect-[21/9] rounded-2xl overflow-hidden bg-trevo-dark group mb-8 shadow-2xl">
            <Image 
              src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" 
              alt="Vista previa del masterplan" 
              fill 
              className="object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-500"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              <h3 className="text-white text-3xl font-light tracking-widest mb-6">RESIDENCIAS NATURA</h3>
              <a href="/proyecto/demo" className="btn-outline-white bg-white/10 backdrop-blur-md hover:bg-white text-white hover:text-trevo-dark">
                ENTRAR AL MASTERPLAN
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Typologies Section */}
      <section className="py-24 bg-trevo-green">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-16 space-y-4">
            <div className="text-white/70 tracking-widest text-sm font-semibold">MODELOS DISPONIBLES</div>
            <h2 className="text-4xl md:text-5xl font-light text-white leading-tight max-w-3xl">
              DISEÑADOS PARA INSPIRAR Y ADAPTARSE A TU RUTINA
            </h2>
            <p className="text-white/80 font-light max-w-xl">
              Espacios funcionales con excelente iluminación natural, amplias terrazas y distribuciones inteligentes que priorizan tu comodidad.
            </p>
          </div>
          
          <div className="bg-trevo-light rounded-2xl p-8 md:p-12">
            <TabsSection />
          </div>
        </div>
      </section>

      {/* Zone / Location Section */}
      <section className="py-24 bg-trevo-dark">
        <div className="max-w-6xl mx-auto px-4 md:px-6 mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <h2 className="text-3xl md:text-4xl font-light text-white max-w-lg leading-tight">
            UBICACIÓN PRIVILEGIADA EN EL CORAZÓN DE LA CIUDAD
          </h2>
          <button className="btn-outline-white whitespace-nowrap w-full md:w-auto">DESCUBRIR LA ZONA</button>
        </div>
        
        <ZonesCarousel />
      </section>

      {/* Calculator Section */}
      <Calculator />

      {/* Contact Section */}
      <section className="py-24 bg-trevo-green relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-thin text-white leading-tight mb-6 text-center md:text-left">
              Trevoluciona <br/>
              <span className="font-medium">tu forma de vivir</span>
            </h2>
          </div>
          
          <div className="bg-white/5 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-white/10">
            <div className="text-white mb-6 md:mb-8 font-light text-center md:text-left">Completa el formulario para obtener más información.</div>
            {/* Placeholder form */}
            <form className="space-y-4">
              <input type="text" placeholder="Nombre completo" className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-white transition-colors" />
              <input type="email" placeholder="Correo electrónico" className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-white transition-colors" />
              <input type="tel" placeholder="Teléfono" className="w-full p-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 focus:outline-none focus:border-white transition-colors" />
              <button type="button" className="btn-solid-brown w-full mt-2 py-4 rounded-lg">ENVIAR</button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer Placeholder */}
      <footer className="bg-trevo-dark text-white py-12 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-2xl font-bold tracking-widest">RESIDENCIAS NATURA</div>
          <div className="flex gap-6 text-sm font-light text-white/70">
            <a href="#" className="hover:text-white transition-colors">Inicio</a>
            <a href="#" className="hover:text-white transition-colors">Nosotros</a>
            <a href="#" className="hover:text-white transition-colors">Modelos</a>
            <a href="#" className="hover:text-white transition-colors">Cotizador</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
