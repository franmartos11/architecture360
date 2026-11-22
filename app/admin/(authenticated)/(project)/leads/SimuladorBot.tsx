'use client';

import { useEffect, useRef, useState } from 'react';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { Send } from 'lucide-react';
import { fieldClass } from '@/components/admin/panel-ui';
import type { AvisoSimulado, ResultadoSimulacion } from '@/lib/whatsapp-bot/simulador';

type Entrada =
  | { rol: 'cliente'; texto: string }
  | {
      rol: 'bot';
      partes: string[];
      imagenes: string[];
      aviso: AvisoSimulado | null;
      preguntas: { tema: string; pregunta: string }[];
      visita: string | null;
    }
  | { rol: 'nota'; texto: string };

const MOTIVO: Record<string, string> = {
  refusal: 'El bot no quiso responder ese mensaje. En WhatsApp, la charla quedaría pausada para que la tome una persona.',
  error: 'Falló la llamada a la IA. En WhatsApp, la charla quedaría pausada para que la tome una persona.',
  max_iteraciones: 'El bot dio demasiadas vueltas sin responder. En WhatsApp, la charla quedaría pausada.',
};

const SUGERENCIAS = ['¿Cómo es la financiación?', '¿Qué unidades tienen?', 'Quiero visitar'];

/** La charla como la ve la IA: lo del bot con una marca por imagen, como en WhatsApp. */
type MensajeEnviado = { rol: 'cliente' | 'bot'; texto: string };

function paraEnviar(es: Entrada[]): MensajeEnviado[] {
  return es.flatMap((e): MensajeEnviado[] => {
    if (e.rol === 'cliente') return [{ rol: 'cliente', texto: e.texto }];
    if (e.rol === 'bot') {
      const texto = [...e.imagenes.map(() => '[Imagen]'), ...e.partes].join('\n\n');
      return texto ? [{ rol: 'bot', texto }] : [];
    }
    return [];
  });
}

export default function SimuladorBot() {
  const activeProjectId = useActiveProjectId();
  const url = withActiveProject('/api/admin/whatsapp-bot/simular', activeProjectId);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chat = useRef<HTMLDivElement | null>(null);
  const yaAvisado = entradas.some(e => e.rol === 'bot' && e.aviso);

  // Baja el scroll del chat (no el de la página) cuando llega algo nuevo.
  useEffect(() => {
    const el = chat.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entradas, enviando]);

  const reiniciar = () => {
    setEntradas([]);
    setError(null);
    setTexto('');
  };

  const enviar = async (sugerida?: string) => {
    const t = (sugerida ?? texto).trim();
    if (!t || enviando) return;
    const nuevas: Entrada[] = [...entradas, { rol: 'cliente', texto: t }];
    setEntradas(nuevas);
    setTexto('');
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: paraEnviar(nuevas).slice(-40), yaAvisado }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data as { error?: string } | null)?.error ?? 'No se pudo correr la prueba.');
        return;
      }
      const r = data as ResultadoSimulacion;
      if (r.motivoSinRespuesta || r.partes.length === 0) {
        setEntradas(es => [...es, { rol: 'nota', texto: MOTIVO[r.motivoSinRespuesta ?? 'error'] ?? MOTIVO.error }]);
        return;
      }
      setEntradas(es => [...es, { rol: 'bot', partes: r.partes, imagenes: r.imagenes, aviso: r.aviso, preguntas: r.preguntas, visita: r.visita }]);
    } catch (e) {
      console.error(e);
      setError('No se pudo conectar. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section aria-label="Probar el bot" className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="m-0 text-base font-semibold text-gray-900">Probar el bot</h2>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-gray-600">
          Escribile como si fueras un cliente. Usa la configuración guardada y los datos reales del proyecto, pero no
          manda nada por WhatsApp ni avisa al vendedor.
        </p>
      </div>

      <div
        ref={chat}
        className="flex flex-col gap-2.5 bg-[#F7F6F2] p-4 min-h-[360px] max-h-[560px] overflow-y-auto"
        aria-live="polite"
      >
        {entradas.length === 0 && !enviando && (
          <p className="m-auto text-[13px] text-gray-600 text-center">Ej: “Hola, ¿tienen departamentos de 2 ambientes?”</p>
        )}
        {entradas.map((e, i) => {
          if (e.rol === 'cliente') {
            return (
              <div key={i} className="self-end max-w-[85%] rounded-[14px_4px_14px_14px] bg-white border border-[#EBE8E2] px-3 py-2 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap break-words">
                {e.texto}
              </div>
            );
          }
          if (e.rol === 'nota') {
            return (
              <p key={i} className="m-0 self-center max-w-[90%] rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 text-center">
                {e.texto}
              </p>
            );
          }
          return (
            <div key={i} className="self-start max-w-[85%] flex flex-col gap-1.5">
              {e.imagenes.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {e.imagenes.map(src => (
                    <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="Imagen que mandaría el bot" className="w-[120px] h-[90px] object-cover rounded-xl border border-gray-200 bg-white" />
                    </a>
                  ))}
                </div>
              )}
              {e.partes.map((p, j) => (
                <div
                  key={j}
                  className={`rounded-[4px_14px_14px_14px] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    e.preguntas.length > 0 ? 'bg-amber-50 border border-amber-200 text-gray-800' : 'bg-brand-100 text-gray-900'
                  }`}
                >
                  {p}
                  {j === e.partes.length - 1 && e.preguntas.map((q, k) => (
                    <span key={k} className="block mt-1.5 text-xs font-semibold text-amber-800">En WhatsApp quedaría en Preguntas sin respuesta: {q.tema}</span>
                  ))}
                </div>
              ))}
              {e.aviso && (
                <div className="rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-gray-800">
                  <span className="font-semibold text-brand-800">Avisaría al vendedor.</span> {e.aviso.resumen}
                  {e.aviso.calificacion && <span className="block mt-1">{e.aviso.calificacion}</span>}
                  {e.aviso.unidades.length > 0 && <span className="block mt-1">Unidades: {e.aviso.unidades.join(' / ')}</span>}
                </div>
              )}
              {e.visita && (
                <div className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs leading-relaxed text-gray-800">
                  <span className="font-semibold text-brand-800">Agendaría la visita:</span> {e.visita}
                </div>
              )}
            </div>
          );
        })}
        {enviando && <p className="m-0 self-start text-[13px] text-gray-600">El bot está escribiendo…</p>}
      </div>

      <div className="px-4 pt-3 pb-4 flex flex-col gap-2.5 border-t border-gray-100">
        {error && <p className="m-0 text-[13px] font-medium text-red-700" role="alert">{error}</p>}
        {!enviando && (
          <div className="flex gap-1.5 flex-wrap">
            {SUGERENCIAS.map(t => (
              <button key={t} type="button" onClick={() => enviar(t)} className="min-h-[32px] px-2.5 rounded-full border border-gray-300 bg-white text-xs text-gray-900 hover:border-gray-400">
                {t}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2 items-end"
          onSubmit={e => {
            e.preventDefault();
            enviar();
          }}
        >
          <textarea
            className={`${fieldClass} py-2.5 leading-relaxed resize-none`}
            rows={1}
            value={texto}
            maxLength={2000}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Escribí como cliente…"
            aria-label="Mensaje de prueba"
          />
          <button type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar" className="w-11 h-11 shrink-0 rounded-[10px] bg-gray-900 text-white flex items-center justify-center hover:bg-black disabled:bg-gray-200 disabled:text-gray-400">
            <Send className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </form>
        {entradas.length > 0 && (
          <button type="button" onClick={reiniciar} disabled={enviando} className="self-start min-h-[32px] text-[13px] text-gray-700 underline underline-offset-2 hover:text-gray-900 disabled:opacity-50">
            Reiniciar prueba
          </button>
        )}
      </div>
    </section>
  );
}
