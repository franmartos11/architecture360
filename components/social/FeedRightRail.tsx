import PeopleSuggestions from '@/components/social/PeopleSuggestions';
import TrendingTags from '@/components/social/TrendingTags';
import UpcomingEvent from '@/components/social/UpcomingEvent';

interface FeedRightRailProps {
  loggedIn: boolean;
  canCreate: boolean;
}

// Rail derecho compartido por /feed, /guardados y /etiqueta/[tag] — mismo
// cascarón de 3 columnas en las tres, ver FeedLeftRail y lib/feed-rail.ts.
export default function FeedRightRail({ loggedIn, canCreate }: FeedRightRailProps) {
  return (
    <div className="hidden lg:flex flex-col gap-4 sticky top-20">
      <PeopleSuggestions />
      <TrendingTags />
      <UpcomingEvent loggedIn={loggedIn} canCreate={canCreate} />
      <p className="font-light text-[10.5px] leading-[1.7] px-1.5" style={{ color: 'rgba(28,25,23,0.34)' }}>
        Acerca de · Ayuda · Privacidad · Términos<br />Atrium © {new Date().getFullYear()}
      </p>
    </div>
  );
}
