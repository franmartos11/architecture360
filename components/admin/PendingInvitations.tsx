'use client';

import { useCallback, useEffect, useState } from 'react';
import { btnPrimary, btnSecondary } from '@/components/admin/panel-ui';
import { useToast } from '@/components/ui/ToastProvider';
import { ROLE_LABELS, type ProjectRole } from '@/lib/project-roles';

interface Invitation {
  id: string;
  role: ProjectRole;
  project: { id: string; name: string; slug: string } | null;
  inviter: { handle: string; display_name: string } | null;
}

interface Transfer {
  id: string;
  project: { id: string; name: string } | null;
  from: { handle: string; display_name: string } | null;
}

type Pending = { kind: 'invitation' | 'transfer'; id: string };

const LOAD_ERROR = 'No se pudieron cargar las invitaciones.';

async function fetchMine(): Promise<{ invitations: Invitation[]; transfers: Transfer[] }> {
  const res = await fetch('/api/members/mine');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? LOAD_ERROR);
  return { invitations: data.invitations ?? [], transfers: data.transfers ?? [] };
}

// Invitaciones a proyectos ajenos y transferencias de propiedad que esperan
// respuesta del usuario. Si no hay nada pendiente no renderiza nada (un error
// de carga sí se muestra: no puede parecer "no hay nada").
export default function PendingInvitations({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadError, setLoadError] = useState('');
  // Una sola respuesta en vuelo a la vez: evita dobles clicks y respuestas cruzadas.
  const [busy, setBusy] = useState<Pending | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMine();
      setInvitations(data.invitations);
      setTransfers(data.transfers);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : LOAD_ERROR);
    }
  }, []);

  useEffect(() => {
    // Carga inicial con .then: el setState corre en el callback, no en el cuerpo del efecto.
    fetchMine()
      .then(data => { setInvitations(data.invitations); setTransfers(data.transfers); })
      .catch(err => setLoadError(err instanceof Error ? err.message : LOAD_ERROR));
  }, []);

  const respond = async (kind: Pending['kind'], id: string, status: 'accepted' | 'declined') => {
    if (busy) return;
    setBusy({ kind, id });
    try {
      const url = kind === 'invitation' ? `/api/members/${id}/respond` : `/api/transfers/${id}/respond`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la respuesta.');
      toast(status === 'accepted' ? 'Aceptaste.' : 'Rechazaste.', 'success');
      await refresh();
      onChange(); // la grilla de proyectos tiene que recargarse
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo enviar la respuesta.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="m-0 text-sm text-red-700">{loadError}</p>
        <button type="button" onClick={refresh} className={btnSecondary}>Reintentar</button>
      </div>
    );
  }
  if (invitations.length === 0 && transfers.length === 0) return null;

  const row = (kind: Pending['kind'], id: string, text: React.ReactNode) => {
    const mine = busy?.kind === kind && busy.id === id;
    return (
      <li key={`${kind}-${id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
        <p className="m-0 flex-1 text-sm text-gray-800">{text}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy !== null} onClick={() => respond(kind, id, 'accepted')} className={btnPrimary}>
            {mine ? 'Enviando…' : 'Aceptar'}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => respond(kind, id, 'declined')} className={btnSecondary}>
            Rechazar
          </button>
        </div>
      </li>
    );
  };

  return (
    <section aria-label="Invitaciones pendientes" className="rounded-2xl border border-brand-700 bg-white overflow-hidden">
      <ul className="m-0 p-0 list-none divide-y divide-gray-200">
        {invitations.map(i => row('invitation', i.id, (
          <>
            <span className="font-medium">@{i.inviter?.handle ?? 'alguien'}</span> te invitó a «{i.project?.name ?? 'un proyecto'}» como {ROLE_LABELS[i.role]}
          </>
        )))}
        {transfers.map(t => row('transfer', t.id, (
          <>
            <span className="font-medium">@{t.from?.handle ?? 'alguien'}</span> quiere transferirte «{t.project?.name ?? 'un proyecto'}»
          </>
        )))}
      </ul>
    </section>
  );
}
