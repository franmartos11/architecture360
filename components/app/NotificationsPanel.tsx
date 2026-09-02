'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { formatRelativeTime } from '@/lib/relativeTime';

interface NotificationRow {
  id: string;
  type: 'follow' | 'like' | 'comment' | 'collaboration_invite' | 'collaboration_accepted' | 'message' | 'mention';
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: { handle: string; display_name: string; avatar_image: string | null } | null;
}

// entity_id de un 'message' es el id de la conversación (ver notify() en
// app/api/conversations/[id]/messages/route.ts) — antes esto ignoraba el
// campo y mandaba siempre al perfil del que escribió, nunca al hilo.
function notificationHref(n: NotificationRow): string {
  if (n.type === 'collaboration_invite') return '/admin/portfolio';
  if (n.type === 'message' && n.entity_id) return `/mensajes/${n.entity_id}`;
  if (n.actor) return `/portfolio/${n.actor.handle}`;
  return '#';
}

const TEXT_BY_TYPE: Record<NotificationRow['type'], string> = {
  follow: 'empezó a seguirte',
  like: 'le gustó tu post',
  comment: 'comentó tu post',
  collaboration_invite: 'te acreditó en un proyecto — confirmalo en tu portfolio',
  collaboration_accepted: 'confirmó su crédito en tu proyecto',
  message: 'te mandó un mensaje',
  mention: 'te mencionó en un post',
};

// Contenido del panel de la campanita — se carga recién cuando se abre
// (perezoso, como el hover card) y marca todo como leído al abrir.
export default function NotificationsPanel({ onRead }: { onRead: () => void }) {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);

  useEffect(() => {
    fetch('/api/notifications')
      .then(res => res.json())
      .then(data => setNotifications(data.notifications ?? []))
      .catch(() => setNotifications([]));
    fetch('/api/notifications/read', { method: 'POST' }).then(onRead).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-80 max-w-full max-h-96 overflow-y-auto">
      {notifications === null ? (
        <p className="px-4 py-6 text-sm text-trevo-dark/40 text-center">Cargando...</p>
      ) : notifications.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Bell className="w-5 h-5 text-trevo-dark/20 mx-auto mb-2" />
          <p className="text-sm text-trevo-dark/40">Todavía no hay notificaciones.</p>
        </div>
      ) : (
        <ul className="divide-y divide-trevo-dark/5">
          {notifications.map(n => (
            <li key={n.id}>
              <Link
                href={notificationHref(n)}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-trevo-dark/5 transition-colors ${!n.read_at ? 'bg-brand-50/60' : ''}`}
              >
                <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
                  {n.actor?.avatar_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.actor.avatar_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-trevo-dark/40 font-medium">{(n.actor?.display_name ?? 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-trevo-dark leading-snug">
                    <span className="font-medium">{n.actor?.display_name ?? 'Alguien'}</span> {TEXT_BY_TYPE[n.type]}
                  </p>
                  <p className="text-xs text-trevo-dark/40 mt-0.5">{formatRelativeTime(n.created_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
