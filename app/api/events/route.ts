import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api-validate';
import { sanitizeText, sanitizeMultiline } from '@/lib/sanitize';

const MAX_TITLE_LENGTH = 140;
const MAX_TEXT_LENGTH = 500;

// Un único evento a la vez en el widget del feed — el próximo que va a
// pasar. Si más adelante hace falta una lista completa, esto se puede
// extender con paginación sin romper el shape actual.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: event } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event) return NextResponse.json({ event: null });

  const [{ count: attendeeCount }, rsvpMine] = await Promise.all([
    supabase.from('event_rsvps').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
    user
      ? supabase.from('event_rsvps').select('id').eq('event_id', event.id).eq('profile_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    event: {
      ...event,
      attendeeCount: attendeeCount ?? 0,
      attendingByMe: !!rsvpMine.data,
    },
  });
}

const eventSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().max(MAX_TEXT_LENGTH).optional(),
  location: z.string().max(MAX_TEXT_LENGTH).optional(),
  startsAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
});

// Cualquier cuenta con perfil puede publicar un evento — mismo criterio de
// apertura que publicar un post (ver posts.author_id / profiles), no hay
// rol de "admin de plataforma" separado del dueño de cada proyecto.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Creá tu portfolio antes de publicar un evento.' }, { status: 400 });

  const parsed = await parseJsonBody(request, eventSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const title = sanitizeText(body.title, MAX_TITLE_LENGTH);
  if (!title) return NextResponse.json({ error: 'Falta el título del evento' }, { status: 400 });

  const { data, error } = await supabase
    .from('events')
    .insert({
      title,
      description: body.description ? sanitizeMultiline(body.description, MAX_TEXT_LENGTH) : null,
      location: body.location ? sanitizeText(body.location, MAX_TEXT_LENGTH) : null,
      starts_at: body.startsAt,
      created_by: user.id,
    })
    .select('id, title, description, location, starts_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, attendeeCount: 0, attendingByMe: false }, { status: 201 });
}
