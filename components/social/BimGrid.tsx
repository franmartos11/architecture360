import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { bimModelHref } from '@/lib/bim';
import type { BimModel } from '@/types';

export default function BimGrid({ models }: { models: BimModel[] }) {
  if (models.length === 0) {
    return (
      <p className="text-sm text-trevo-dark/50 py-10 text-center">
        Todavía no hay modelos publicados.
      </p>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {models.map(m => (
        <Link
          key={m.id}
          href={bimModelHref(m.id)}
          className="group rounded-[16px] overflow-hidden bg-white border border-trevo-dark/[0.09] hover:border-trevo-dark/30 transition-colors flex flex-col"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-[repeating-linear-gradient(115deg,#e6e3dc_0px,#e6e3dc_18px,#dcd8d0_18px,#dcd8d0_36px)]">
            {m.coverImage ? (
              <Image
                src={m.coverImage} alt={m.title} fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                placeholder="blur" blurDataURL={shimmerDataUrl()}
                className="object-cover"
              />
            ) : null}
            {m.geometryUrl && (
              <span className="absolute top-3 left-3 h-6 px-2.5 rounded-md bg-[#1c1a17]/80 text-white text-[10.5px] font-medium tracking-[0.06em] flex items-center">
                3D
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 py-[14px] px-[15px]">
            <p className="text-sm font-medium text-trevo-dark truncate">{m.title}</p>
            {m.description && (
              <p className="text-[12.5px] text-trevo-dark/55 line-clamp-2">{m.description}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
