import { createClient } from '@/lib/supabase/server';

type NotificationType = 'follow' | 'like' | 'comment' | 'collaboration_accepted' | 'message' | 'mention';

interface NotifyParams {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId?: string;
}

// Best-effort — igual que sendEmail(), una notificación que falla no debe
// tumbar la acción principal (seguir, likear, comentar). Nunca se notifica
// a uno mismo (ej. dar like a tu propio post, si algún día se permite).
export async function notify(supabase: Awaited<ReturnType<typeof createClient>>, { recipientId, actorId, type, entityId }: NotifyParams) {
  if (recipientId === actorId) return;
  try {
    await supabase.from('notifications').insert({
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      entity_id: entityId ?? null,
    });
  } catch (err) {
    console.error('[notify] no se pudo crear la notificación', err);
  }
}
