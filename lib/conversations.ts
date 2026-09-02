import 'server-only';
import type { createClient } from '@/lib/supabase/server';

// Usado por las rutas de mensajes y de adjuntos — ambas necesitan el mismo
// chequeo antes de tocar una conversación puntual.
export async function getConversationIfParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  userId: string
) {
  const { data } = await supabase.from('conversations').select('id, participant_one, participant_two').eq('id', id).maybeSingle();
  if (!data) return null;
  if (data.participant_one !== userId && data.participant_two !== userId) return null;
  return data;
}
