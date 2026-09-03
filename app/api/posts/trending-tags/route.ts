import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractHashtags } from '@/lib/hashtags';

const WINDOW_DAYS = 7;
const SAMPLE_SIZE = 500;
const TOP_N = 4;

// Sin columna de tags propia en `posts` — se parsean los "#hashtags" del
// texto de los posts recientes y se cuenta en memoria, en vez de sumar una
// función SQL solo para esto (ver plan de Feed: escala del producto no
// justifica esa complejidad todavía).
export async function GET() {
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('posts')
    .select('body')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(SAMPLE_SIZE);

  if (error) return NextResponse.json({ tags: [] });

  const countByTag = new Map<string, number>();
  for (const row of (data ?? []) as { body: string }[]) {
    for (const tag of extractHashtags(row.body)) {
      countByTag.set(tag, (countByTag.get(tag) ?? 0) + 1);
    }
  }

  const tags = [...countByTag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([tag, count]) => ({ tag, count }));

  return NextResponse.json({ tags });
}
