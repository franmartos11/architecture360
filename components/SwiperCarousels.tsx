'use client';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import type { Amenity, PointOfInterest } from '@/types';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface AmenitiesCarouselProps {
  amenities: Amenity[];
  projectSlug: string;
}

export function AmenitiesCarousel({ amenities, projectSlug }: AmenitiesCarouselProps) {
  const slides = amenities.filter(a => a.images.length > 0);
  if (slides.length === 0) return null;

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
        {slides.map((item) => (
          <SwiperSlide key={item.id} className="group relative rounded-xl overflow-hidden h-[400px]">
            <Link href={`/proyecto/${projectSlug}/amenities`} className="block w-full h-full">
              <Image
                src={item.images[0]}
                alt={item.name}
                fill
                sizes="(min-width: 1024px) 576px, (min-width: 640px) 66vw, 100vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl()}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-8">
                <h3 className="text-white text-xl tracking-wider uppercase">{item.name}</h3>
              </div>
            </Link>
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
        className="w-full h-auto rounded-xl overflow-hidden pb-12"
      >
        {slides.map((item) => (
          <SwiperSlide key={item.id} className="group relative rounded-xl overflow-hidden h-[500px]">
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
                <h3 className="text-white text-3xl mb-2">{item.name}</h3>
                {item.description && <p className="text-white/80">{item.description}</p>}
              </div>
            </Link>
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
