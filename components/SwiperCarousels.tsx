'use client';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

const amenities = [
  { id: 1, name: 'TERRAZA GOURMET', image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 2, name: 'SALA DE EVENTOS', image: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 3, name: 'FITNESS CENTER', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 4, name: 'LOBBY PRINCIPAL', image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 5, name: 'PISCINA INFINITA', image: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 6, name: 'ROOFTOP GARDEN', image: 'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
];

export function AmenitiesCarousel() {
  return (
    <div className="relative w-full max-w-6xl mx-auto">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={30}
        slidesPerView={1}
        breakpoints={{
          640: { slidesPerView: 1.5 },
          1024: { slidesPerView: 2 },
        }}
        navigation={{
          nextEl: '.swiper-btn-next-am',
          prevEl: '.swiper-btn-prev-am',
        }}
        pagination={{ clickable: true }}
        loop={true}
        autoplay={{ delay: 4000, disableOnInteraction: false }}
        className="w-full h-auto rounded-xl overflow-hidden pb-12"
      >
        {amenities.map((item) => (
          <SwiperSlide key={item.id} className="group relative rounded-xl overflow-hidden h-[400px]">
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="(min-width: 1024px) 576px, (min-width: 640px) 66vw, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-8">
              <h3 className="text-white text-xl tracking-wider">{item.name}</h3>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
      {/* Custom Nav Buttons */}
      <div className="flex justify-end gap-4 mt-4">
        <button className="swiper-btn-prev-am w-12 h-12 flex items-center justify-center rounded-full border border-trevo-dark text-trevo-dark hover:bg-trevo-dark hover:text-white transition-colors">
          &larr;
        </button>
        <button className="swiper-btn-next-am w-12 h-12 flex items-center justify-center rounded-full border border-trevo-dark text-trevo-dark hover:bg-trevo-dark hover:text-white transition-colors">
          &rarr;
        </button>
      </div>
    </div>
  );
}

const zones = [
  { id: 1, name: 'Comercios', desc: 'Compras y servicios en tu radio inmediato.', image: 'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 2, name: 'Restaurantes', desc: 'Buena oferta gastronómica, sin desplazarte.', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 3, name: 'Conveniencia', desc: 'Lo esencial, en el camino.', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 4, name: 'Salud', desc: 'Atención médica cerca, cuando se necesita.', image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
  { id: 5, name: 'Educación', desc: 'Oferta académica sólida en el entorno.', image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
];

export function ZonesCarousel() {
  return (
    <div className="relative w-full max-w-6xl mx-auto">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={30}
        slidesPerView={1}
        navigation={{
          nextEl: '.swiper-btn-next-zone',
          prevEl: '.swiper-btn-prev-zone',
        }}
        pagination={{ clickable: true }}
        loop={true}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        className="w-full h-auto rounded-xl overflow-hidden pb-12"
      >
        {zones.map((item) => (
          <SwiperSlide key={item.id} className="group relative rounded-xl overflow-hidden h-[500px]">
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="(min-width: 1152px) 1152px, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-10">
              <h3 className="text-white text-3xl mb-2">{item.name}</h3>
              <p className="text-white/80">{item.desc}</p>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
      {/* Custom Nav Buttons */}
      <div className="flex justify-end gap-4 mt-4">
        <button className="swiper-btn-prev-zone w-12 h-12 flex items-center justify-center rounded-full border border-trevo-dark text-trevo-dark hover:bg-trevo-dark hover:text-white transition-colors">
          &larr;
        </button>
        <button className="swiper-btn-next-zone w-12 h-12 flex items-center justify-center rounded-full border border-trevo-dark text-trevo-dark hover:bg-trevo-dark hover:text-white transition-colors">
          &rarr;
        </button>
      </div>
    </div>
  );
}
