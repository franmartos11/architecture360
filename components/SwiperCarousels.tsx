'use client';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import type { PointOfInterest } from '@/types';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface PointsOfInterestCarouselProps {
  pointsOfInterest: PointOfInterest[];
  projectSlug: string;
}

export function PointsOfInterestCarousel({ pointsOfInterest, projectSlug }: PointsOfInterestCarouselProps) {
  const slides = pointsOfInterest.filter(p => p.image);
  if (slides.length === 0) return null;

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
        className="w-full h-[548px] rounded-[var(--theme-radius)] overflow-hidden pb-12"
      >
        {slides.map((item) => (
          <SwiperSlide key={item.id} className="group relative rounded-[var(--theme-radius)] overflow-hidden h-[500px]">
            <Link href={`/proyecto/${projectSlug}/ubicacion`} className="block w-full h-full">
              <Image
                src={item.image!}
                alt={item.name}
                fill
                sizes="(min-width: 1152px) 1152px, 100vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl()}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-10">
                <h3 className="font-[family-name:var(--theme-font-heading)] text-white text-3xl mb-2">{item.name}</h3>
                {item.description && <p className="text-white/80">{item.description}</p>}
              </div>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
      {/* Custom Nav Buttons — este carrusel siempre vive en secciones de fondo oscuro (Ubicación) */}
      <div className="flex justify-end gap-4 mt-4">
        <button className="swiper-btn-prev-zone w-12 h-12 flex items-center justify-center rounded-full border border-[var(--theme-text-on-dark)] text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)] hover:text-[var(--theme-bg-alt)] transition-colors">
          &larr;
        </button>
        <button className="swiper-btn-next-zone w-12 h-12 flex items-center justify-center rounded-full border border-[var(--theme-text-on-dark)] text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)] hover:text-[var(--theme-bg-alt)] transition-colors">
          &rarr;
        </button>
      </div>
    </div>
  );
}
