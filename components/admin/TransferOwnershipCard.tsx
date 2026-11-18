'use client';

import { useCallback, useEffect, useState } from 'react';
import PersonSearchSelect, { type PersonSearchResult } from '@/components/admin/PersonSearchSelect';
import { btnPrimary, btnSecondary } from '@/components/admin/panel-ui';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface PendingTransfer {
  id: string;
  to: { handle: string; display_name: string | null } | null;
  created_at: string;
}

// Configuración → "Transferir propiedad" (solo el dueño). Dos estados: hay una
// transferencia pendiente (se puede cancelar) o se elige a quién transferir.
export default function TransferOwnershipCard({ projectId }: { projectId: string }) {
  const confirmDialog = useConfirm();
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const url = `/api/admin/projects/${projectId}/transfer`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el estado de la transferencia.');
      setPending(data.pending ?? null);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el estado de la transferencia.');
    } finally {
      setLoading(false);
    }
  }, [url]);

  // Carga inicial: load() actualiza el estado recién al resolver el fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || busy) return;
    setError('');
    // Confirmar antes: la transferencia cambia roles y oculta el proyecto del portfolio.
    const ok = await confirmDialog({
      message: `Si @${selected.handle} acepta, pasa a ser el dueño y vos quedás como Administrador. El proyecto se ocultará del portfolio hasta que el nuevo dueño lo vuelva a mostrar.`,
      confirmLabel: 'Transferir propiedad',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: selected.handle }),
      });
      if (res.ok) {
        setSelected(null);
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo iniciar la transferencia.');
      }
    } catch {
      setError('No se pudo iniciar la transferencia.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) await load();
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo cancelar la transferencia.');
      }
    } catch {
      setError('No se pudo cancelar la transferencia.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="px-5 sm:px-6 py-5 border-b border-gray-200 flex flex-col gap-1">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Transferir propiedad</h2>
        <p className="m-0 text-xs text-gray-600">Pasale el proyecto a otra persona de la plataforma. Tiene que aceptar la transferencia para que se concrete.</p>
      </div>
      {loading ? (
        <p className="m-0 px-5 sm:px-6 py-5 text-sm text-gray-600">Cargando…</p>
      ) : loadError ? (
        <div className="px-5 sm:px-6 py-5 flex items-center justify-between gap-3 flex-wrap">
          <p role="alert" className="m-0 text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }} className={btnSecondary}>Reintentar</button>
        </div>
      ) : pending ? (
        <div className="px-5 sm:px-6 py-5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="m-0 text-sm text-gray-800">
              Esperando que <span className="font-medium">@{pending.to?.handle ?? 'la persona elegida'}</span> acepte
            </p>
            <button type="button" onClick={handleCancel} disabled={busy} className={btnSecondary}>
              {busy ? 'Cancelando…' : 'Cancelar transferencia'}
            </button>
          </div>
          {error && <p role="alert" className="m-0 text-sm text-red-700">{error}</p>}
        </div>
      ) : (
        <form onSubmit={handleTransfer} className="px-5 sm:px-6 py-5 flex flex-col gap-3">
          <PersonSearchSelect selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} placeholder="Buscar al nuevo dueño por nombre o handle…" />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {error ? <p role="alert" className="m-0 text-sm text-red-700">{error}</p> : <span />}
            <button type="submit" disabled={busy || !selected} className={btnPrimary}>
              {busy ? 'Transfiriendo…' : 'Transferir propiedad'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
