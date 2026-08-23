import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { formatRelativeTime } from '@/lib/relativeTime';
import MentionText from '@/components/social/MentionText';

export interface EmbeddedPost {
  id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  author: { handle: string; display_name: string; avatar_image: string | null } | null;
}

// Card chica del post original dentro de un repost o de un mensaje que
// comparte un post — mismo componente en ambos lugares (ver PostFeed.tsx
// y MessageThread.tsx). Sin link propio al body/imagen: todavía no existe
// una página de post individual, solo se puede linkear al autor.
export default function EmbeddedPostCard({ post }: { post: EmbeddedPost }) {
  return (
    <div className="border border-trevo-dark/10 rounded-xl p-3.5 bg-trevo-light/50">
      <div className="flex items-center gap-2.5">
        <Link href={`/portfolio/${post.author?.handle ?? ''}`} className="relative w-7 h-7 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
          {post.author?.avatar_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author.avatar_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-trevo-dark/40 font-medium">{(post.author?.display_name ?? 'U').charAt(0).toUpperCase()}</span>
          )}
        </Link>
        <Link href={`/portfolio/${post.author?.handle ?? ''}`} className="text-xs font-semibold text-trevo-dark hover:underline">
          {post.author?.display_name ?? 'Usuario'}
        </Link>
        <span className="text-[11px] text-trevo-dark/30">{formatRelativeTime(post.created_at)}</span>
      </div>
      {post.body && <p className="text-sm text-trevo-dark/80 font-light mt-1.5 whitespace-pre-line line-clamp-4"><MentionText text={post.body} /></p>}
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" className="w-full rounded-lg mt-2 max-h-64 object-cover" />
      )}
    </div>
  );
}
