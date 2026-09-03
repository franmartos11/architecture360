'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

interface EventData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  attendeeCount: number;
  attendingByMe: boolean;
}

interface UpcomingEventProps {
  loggedIn: boolean;
  canCreate: boolean;
}

function dateBadge(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-AR', { day: '2-digit' });
  const month = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
  return { day, month };
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// Widget "Próximo evento" del rail derecho — trae el evento más cercano
// desde /api/events, permite confirmar asistencia (RSVP) y, para quien
// tiene perfil, crear uno nuevo desde un modal liviano (mismo patrón de
// modal que el de repostear en PostFeed). No hay un rol de "admin de
// plataforma" separado, así que cualquier cuenta con perfil puede
// publicar un evento — igual que publicar un post.
export default function UpcomingEvent({ loggedIn, canCreate }: UpcomingEventProps) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvping, setRsvping] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        setEvent(data.event ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRsvp = async () => {
    if (!event) return;
    if (!loggedIn) {
      toast('Iniciá sesión para confirmar asistencia.', 'error');
      return;
    }
    const nextAttending = !event.attendingByMe;
    setEvent(prev => (prev ? { ...prev, attendingByMe: nextAttending, attendeeCount: prev.attendeeCount + (nextAttending ? 1 : -1) } : prev));
    setRsvping(true);
    const res = await fetch(`/api/events/${event.id}/rsvp`, { method: nextAttending ? 'POST' : 'DELETE' });
    setRsvping(false);
    if (!res.ok) {
      setEvent(prev => (prev ? { ...prev, attendingByMe: !nextAttending, attendeeCount: prev.attendeeCount + (nextAttending ? -1 : 1) } : prev));
      toast('No se pudo actualizar tu asistencia.', 'error');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;
    setSubmitting(true);
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), location: location.trim() || undefined, startsAt: new Date(startsAt).toISOString() }),
    });
    setSubmitting(false);
    if (res.ok) {
      const created = await res.json();
      setEvent(created);
      setShowForm(false);
      setTitle('');
      setLocation('');
      setStartsAt('');
      toast('Evento publicado.');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo crear el evento.', 'error');
    }
  };

  if (loading) return null;

  // Calcado del mockup Feed.dc.html — valores arbitrarios en vez de tokens
  // trevo-*, a propósito: es el look específico de ese diseño, scopeado a
  // este componente.
  return (
    <>
      <div className="bg-white rounded-2xl p-[17px]" style={{ border: '1px solid rgba(28,25,23,0.07)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: '#c2543d' }} />
            <h3 className="font-semibold text-[13.5px] text-[#1c1a17]">Próximo evento</h3>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowForm(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: '#4a6647' }}
            >
              + Crear
            </button>
          )}
        </div>

        {event ? (
          <div className="mt-3 flex gap-3 items-start">
            <div className="w-[46px] shrink-0 rounded-[10px] text-center py-[7px]" style={{ background: '#f5f4f0' }}>
              <div className="text-base font-semibold text-[#1c1a17] leading-none">{dateBadge(event.starts_at).day}</div>
              <div className="text-[9.5px] font-medium tracking-wide text-[rgba(28,25,23,0.45)] mt-0.5">{dateBadge(event.starts_at).month}</div>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[12.5px] leading-snug text-[#1c1a17]">{event.title}</p>
              <p className="font-light text-[11px] leading-[1.45] text-[rgba(28,25,23,0.5)] mt-[3px]">
                {timeLabel(event.starts_at)}{event.location ? ` · ${event.location}` : ''}
              </p>
              <button
                onClick={handleRsvp}
                disabled={rsvping}
                className="text-[11px] font-medium mt-1.5 transition-colors disabled:opacity-50"
                style={{ color: event.attendingByMe ? '#4a6647' : 'rgba(28,25,23,0.5)' }}
              >
                {event.attendingByMe ? '✓ Vas a asistir' : `${event.attendeeCount} colega${event.attendeeCount === 1 ? '' : 's'} asiste${event.attendeeCount === 1 ? '' : 'n'} →`}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[rgba(28,25,23,0.4)] mt-3">No hay eventos próximos.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={() => !submitting && setShowForm(false)}>
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-trevo-dark/10">
              <h2 className="font-semibold text-trevo-dark">Crear evento</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-trevo-dark/40 hover:text-trevo-dark transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Título del evento"
                maxLength={140}
                required
                className="w-full px-3.5 py-2 rounded-lg border border-trevo-dark/15 text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 outline-none transition-all"
              />
              <input
                type="datetime-local"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
                required
                className="w-full px-3.5 py-2 rounded-lg border border-trevo-dark/15 text-trevo-dark focus:ring-2 focus:ring-trevo-dark/20 outline-none transition-all"
              />
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Lugar (opcional)"
                maxLength={500}
                className="w-full px-3.5 py-2 rounded-lg border border-trevo-dark/15 text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 outline-none transition-all"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} disabled={submitting} className="px-4 py-2 text-sm font-medium text-trevo-dark/50 hover:text-trevo-dark transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting || !title.trim() || !startsAt} className="px-4 py-2 rounded-lg bg-trevo-dark text-white text-sm font-medium hover:bg-trevo-dark/90 transition-colors disabled:opacity-50">
                  {submitting ? 'Publicando...' : 'Publicar evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
