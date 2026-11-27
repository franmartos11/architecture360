'use client';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import type { PointOfInterest } from '@/types';
import { useT } from '@/lib/i18n/client';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

// Valor de la prop de next/image, no texto (el guardián de i18n mira los placeholder escritos a mano).
const BLUR = 'blur' as const;

interface PointsOfInterestCarouselProps {
  pointsOfInterest: PointOfInterest[];
}

export function PointsOfInterestCarousel({ pointsOfInterest }: PointsOfInterestCarouselProps) {
  const basePath = useProjectBasePath();
  const t = useT();
  const slides = pointsOfInterest.filter(p => p.image);
  if (slides.length === 0) return null;

  return (
    <div className="relative w-full">
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
        className="w-full h-[380px] sm:h-[468px] rounded-[var(--theme-radius)] overflow-hidden pb-12"
      >
        {slides.map((item) => (
          <SwiperSlide key={item.id} className="group relative rounded-[var(--theme-radius)] overflow-hidden h-[340px] sm:h-[420px]">
            <Link href={`${basePath}/ubicacion`} className="block w-full h-full">
              <Image
                src={item.image!}
                alt={item.name}
                fill
                sizes="(min-width: 1152px) 1152px, 100vw"
                placeholder={BLUR}
                blurDataURL={shimmerDataUrl()}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-6 sm:p-10">
                <h3 className="font-[family-name:var(--theme-font-heading)] text-white text-2xl sm:text-3xl mb-2">{item.name}</h3>
                {item.description && <p className="text-white/80">{item.description}</p>}
              </div>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
      {/* Botones propios — la sección Ubicación es de fondo claro (--theme-bg). */}
      <div className="flex justify-end gap-4 mt-4">
        <button type="button" aria-label={t('sitio.carrusel.anterior')} className="swiper-btn-prev-zone w-12 h-12 flex items-center justify-center rounded-full border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-text)] hover:text-[var(--theme-bg)] transition-colors">
          ←
        </button>
        <button type="button" aria-label={t('sitio.carrusel.siguiente')} className="swiper-btn-next-zone w-12 h-12 flex items-center justify-center rounded-full border border-[var(--theme-border)] text-[var(--theme-text)] hover:bg-[var(--theme-text)] hover:text-[var(--theme-bg)] transition-colors">
          →
        </button>
      </div>
    </div>
  );
}
