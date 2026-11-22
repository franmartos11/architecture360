'use client';

// Aviso de que otra persona guardó el avance mientras se editaba (409 de
// PATCH /api/admin/project). No ofrece "guardar igual": pisaría lo del
// otro sin que nadie lo vea. La única salida es recargar.
export default function ConflictNotice({ message, onReload, reloading, detail }: {
  message: string;
  onReload: () => void;
  reloading: boolean;
  /** Qué pasa con lo local al recargar (cambia según desde dónde se guardó). */
  detail: string;
}) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="m-0 text-sm font-semibold text-red-900">{message}</p>
        <p className="m-0 text-xs text-red-800">{detail}</p>
      </div>
      <button type="button" onClick={onReload} disabled={reloading}
        className="shrink-0 min-h-[40px] px-4 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-60">
        {reloading ? 'Recargando…' : 'Recargar'}
      </button>
    </div>
  );
}
