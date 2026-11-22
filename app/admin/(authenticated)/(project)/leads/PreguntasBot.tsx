'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { btnPrimary, btnSecondary, fieldClass } from '@/components/admin/panel-ui';
import type { WaEstadoPregunta, WaPregunta } from '@/types/whatsapp-bot';

const veces = (n: number) => (n === 1 ? '1 vez' : `${n} veces`);

function Pregunta({
  p,
  onCambio,
  onBorrar,
}: {
  p: WaPregunta;
  onCambio: (estado: WaEstadoPregunta, respuesta?: string) => Promise<string | null>;
  onBorrar: () => Promise<void>;
}) {
  const respondida = p.estado === 'respondida';
  const [editando, setEditando] = useState(!respondida);
  const [respuesta, setRespuesta] = useState(p.respuesta ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correr = async (fn: () => Promise<string | null | void>) => {
    setGuardando(true);
    setError(null);
    const e = await fn();
    setGuardando(false);
    if (e) setError(e);
    return e;
  };

  const guardar = async () => {
    if (!respuesta.trim()) {
      setError('Escribí la respuesta');
      return;
    }
    const e = await correr(() => onCambio('respondida', respuesta.trim()));
    if (!e) setEditando(false);
  };

  return (
    <li className="rounded-xl border border-[#ECE9E3] bg-white p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[15px] font-semibold text-gray-900">{p.tema}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#F1EFEA] text-gray-700">{veces(p.veces)}</span>
      </div>
      <p className="m-0 text-sm leading-relaxed text-gray-700">“{p.pregunta}”</p>

      {editando ? (
        <div className="flex gap-2 flex-wrap items-start">
          <textarea
            className={`${fieldClass} flex-[1_1_280px] w-auto py-2.5 leading-relaxed min-h-[44px] resize-y`}
            rows={respondida ? 3 : 1}
            value={respuesta}
            maxLength={2000}
            onChange={e => setRespuesta(e.target.value)}
            placeholder="La respuesta que va a dar el bot"
            aria-label={`Respuesta para ${p.tema}`}
          />
          <button type="button" onClick={guardar} disabled={guardando} className={btnPrimary}>
            Guardar
          </button>
          {respondida ? (
            <button type="button" onClick={() => { setEditando(false); setRespuesta(p.respuesta ?? ''); setError(null); }} disabled={guardando} className={btnSecondary}>
              Cancelar
            </button>
          ) : (
            <button type="button" onClick={() => correr(() => onCambio('descartada'))} disabled={guardando} className={btnSecondary}>
              Descartar
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="m-0 rounded-[10px] bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap">
            {p.respuesta}
          </p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => setEditando(true)} className={btnSecondary}>
              Editar
            </button>
            <button
              type="button"
              onClick={() => correr(onBorrar)}
              disabled={guardando}
              className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-[10px] border border-red-200 bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Quitar
            </button>
          </div>
        </>
      )}
      {error && <p className="m-0 text-[13px] font-medium text-red-700" role="alert">{error}</p>}
    </li>
  );
}

export default function PreguntasBot() {
  const activeProjectId = useActiveProjectId();
  const confirmDialog = useConfirm();
  const url = withActiveProject('/api/admin/whatsapp-bot/preguntas', activeProjectId);
  const [preguntas, setPreguntas] = useState<WaPregunta[]>([]);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Request failed');
      const data: { preguntas: WaPregunta[]; faltaTabla?: boolean } = await res.json();
      setPreguntas(Array.isArray(data.preguntas) ? data.preguntas : []);
      setFaltaTabla(!!data.faltaTabla);
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [url]);

  useEffect(() => {
    // Carga inicial desde la API: los setState ocurren después del fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const cambiar = async (id: string, estado: WaEstadoPregunta, respuesta?: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/whatsapp-bot/preguntas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, ...(respuesta !== undefined ? { respuesta } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return (data as { error?: string } | null)?.error ?? 'No se pudo guardar';
      const p = data as WaPregunta;
      setPreguntas(ps => (p.estado === 'descartada' ? ps.filter(x => x.id !== id) : ps.map(x => (x.id === id ? p : x))));
      return null;
    } catch {
      return 'No se pudo conectar';
    }
  };

  const borrar = async (p: WaPregunta) => {
    const ok = await confirmDialog({
      title: '¿Quitar esta respuesta?',
      message: `El bot va a dejar de saber la respuesta sobre "${p.tema}".`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/whatsapp-bot/preguntas/${p.id}`, { method: 'DELETE' });
    if (res.ok) setPreguntas(ps => ps.filter(x => x.id !== p.id));
  };

  const pendientes = preguntas.filter(p => p.estado === 'pendiente');
  const respondidas = preguntas.filter(p => p.estado === 'respondida');

  const hayPendientes = pendientes.length > 0;
  return (
    <section className={`rounded-2xl border px-5 sm:px-6 py-5 flex flex-col gap-4 ${hayPendientes ? 'border-amber-200 bg-[#FFFBF3]' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className="m-0 text-base font-semibold text-gray-900">Preguntas sin respuesta</h2>
        {hayPendientes && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{pendientes.length}</span>
        )}
      </div>
      <p className="-mt-1.5 m-0 text-sm leading-relaxed text-gray-700">
        Lo que los clientes preguntaron y el bot no supo responder. Lo que contestes acá lo usa en las próximas charlas.
      </p>

      {cargando && <p className="m-0 text-[13px] text-gray-600">Cargando…</p>}
      {error && <p className="m-0 text-[13px] font-medium text-red-700" role="alert">No se pudieron cargar las preguntas.</p>}
      {faltaTabla && (
        <p className="m-0 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800" role="status">
          Falta actualizar la base de datos: volvé a correr supabase/schema.sql en Supabase.
        </p>
      )}

      {!cargando && !error && !faltaTabla && !hayPendientes && (
        <p className="m-0 text-[13px] text-gray-600">No hay preguntas pendientes.</p>
      )}
      {hayPendientes && (
        <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
          {pendientes.map(p => (
            <Pregunta key={p.id} p={p} onCambio={(e, r) => cambiar(p.id, e, r)} onBorrar={() => borrar(p)} />
          ))}
        </ul>
      )}

      {respondidas.length > 0 && (
        <details className="group flex flex-col">
          <summary className="cursor-pointer list-none text-sm font-medium text-gray-900 underline underline-offset-2 min-h-[32px] flex items-center">
            <span className="group-open:hidden">Ver respuestas que ya sabe ({respondidas.length})</span>
            <span className="hidden group-open:inline">Ocultar respuestas que ya sabe</span>
          </summary>
          <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-2.5">
            {respondidas.map(p => (
              <Pregunta key={p.id} p={p} onCambio={(e, r) => cambiar(p.id, e, r)} onBorrar={() => borrar(p)} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
