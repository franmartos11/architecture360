import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

interface FeedLeftRailProps {
  handle: string;
  displayName: string;
  avatarImage: string | null;
  followerCount: number;
}

// Mini-tarjeta de la propia cuenta en el rail izquierdo del feed — el
// atajo permanente a "quién sos" que cualquier red social muestra al
// costado del timeline, en vez de que la única forma de llegar al propio
// perfil sea el dropdown de la nav.
export default function FeedLeftRail({ handle, displayName, avatarImage, followerCount }: FeedLeftRailProps) {
  return (
    <div className="bg-white rounded-2xl border border-trevo-dark/10 p-5 sticky top-20">
      <Link href={`/portfolio/${handle}`} className="flex flex-col items-center text-center group">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-trevo-dark/10 flex items-center justify-center mb-3">
          {avatarImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg text-trevo-dark/40 font-medium">{displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <p className="font-semibold text-trevo-dark text-sm group-hover:underline">{displayName}</p>
        <p className="text-xs text-trevo-dark/40 mt-0.5">@{handle}</p>
      </Link>
      <div className="border-t border-trevo-dark/5 mt-4 pt-4 flex items-center justify-between text-xs">
        <span className="text-trevo-dark/50">Seguidores</span>
        <span className="font-semibold text-trevo-dark">{followerCount}</span>
      </div>
      <Link href={`/portfolio/${handle}`} className="block mt-4 text-center text-xs font-medium text-trevo-dark/60 hover:text-trevo-dark transition-colors">
        Ver mi perfil →
      </Link>
    </div>
  );
}
