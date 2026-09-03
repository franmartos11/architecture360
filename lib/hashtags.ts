// Mismo enfoque que extractMentionedHandles (lib/mentions.ts) pero para
// "#tags" — usado tanto para trending tags como para un futuro linkify.
const HASHTAG_RE = /#([\p{L}0-9_]{2,40})/gu;

export function extractHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_RE)) tags.add(match[1]);
  return [...tags];
}
