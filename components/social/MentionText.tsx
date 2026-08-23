import { Fragment } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

const MENTION_RE = /@([a-z0-9-]{3,40})/g;

// Linkifica @menciones en el cuerpo de un post — optimista, no valida
// contra perfiles reales (mismo criterio que Twitter/LinkedIn: un handle
// que no existe simplemente 404ea al clickearlo).
export default function MentionText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(<Fragment key={key++}>{text.slice(lastIndex, index)}</Fragment>);
    const handle = match[1];
    parts.push(
      <Link key={key++} href={`/portfolio/${handle}`} className="text-brand-600 font-medium hover:underline">
        @{handle}
      </Link>
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);

  return <>{parts}</>;
}
