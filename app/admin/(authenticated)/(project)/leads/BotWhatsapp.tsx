'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { btnPrimary, fieldClass } from '@/components/admin/panel-ui';
import type { WaBot, WaPedido } from '@/types/whatsapp-bot';
import { BotMessageSquare, Calendar, HelpCircle, Sliders, Smartphone } from 'lucide-react';
import { Interruptor } from './leads-ui';
import { panelDelBot, resolverEspera, remezclarFallidos, ESPERA_PEDIDO_MS } from './bot-whatsapp-estado';
import SimuladorBot from './SimuladorBot';
import AgendaVisitas from './AgendaVisitas';
import MetricasBot from './MetricasBot';
import { CONFIG_VISITAS_DEFAULT, normalizarConfigVisitas, type ConfigVisitas } from '@/lib/whatsapp-bot/visitas';
import PreguntasBot from './PreguntasBot';

const AUTOSAVE_MS = 800;
const POLL_QR_MS = 3000;

type Campo = 'activo' | 'nombre_bot' | 'vendedor_nombre' | 'vendedor_whatsapp' | 'conocimiento' | 'criterio_aviso' | 'seguimiento_activo' | 'seguimiento_horas' | 'visitas' | 'chat_web';
type Form = {
  activo: boolean;
  nombre_bot: string;
  vendedor_nombre: string;
  vendedor_whatsapp: string;
  conocimiento: string;
  criterio_aviso: string;
  seguimiento_activo: boolean;
  seguimiento_horas: number;
  visitas: ConfigVisitas;
  chat_web: boolean;
};

const OPCIONES_SEGUIMIENTO: { horas: number; label: string }[] = [
  { horas: 24, label: '1 día' },
  { horas: 48, label: '2 días' },
  { horas: 72, label: '3 días' },
  { horas: 120, label: '5 días' },
  { horas: 168, label: '7 días' },
];

function formDesde(bot: WaBot | null): Form {
  return {
    activo: bot?.activo ?? false,
    nombre_bot: bot?.nombre_bot ?? '',
    vendedor_nombre: bot?.vendedor_nombre ?? '',
    vendedor_whatsapp: bot?.vendedor_whatsapp ?? '',
    conocimiento: bot?.conocimiento ?? '',
    criterio_aviso: bot?.criterio_aviso ?? '',
    seguimiento_activo: bot?.seguimiento_activo ?? false,
    seguimiento_horas: bot?.seguimiento_horas ?? 72,
    visitas: normalizarConfigVisitas(bot?.visitas) ?? CONFIG_VISITAS_DEFAULT,
    chat_web: bot?.chat_web ?? false,
  };
}

// Tarjeta blanca del diseño.
const SECCION = 'rounded-2xl border border-gray-200 bg-white';
const ERROR_TEXT = 'm-0 text-[13px] font-medium text-red-700';

function Campo({ label, ayuda, error, children }: { label: string; ayuda?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      {children}
      {ayuda && <span className="text-xs text-gray-600">{ayuda}</span>}
      {error && <span className="text-xs font-medium text-red-700" role="alert">{error}</span>}
    </label>
  );
}

/** Pastilla de estado del número, con el punto de color del diseño. */
function EstadoNumero({ tono, children }: { tono: 'green' | 'warn' | 'neutral' | 'error'; children: React.ReactNode }) {
  const tonos = {
    green: { pill: 'bg-brand-100 text-brand-800', dot: 'bg-brand-700' },
    warn: { pill: 'bg-amber-100 text-amber-800', dot: 'bg-[#E3B567]' },
    neutral: { pill: 'bg-gray-100 text-gray-700 border border-gray-200', dot: 'bg-gray-400' },
    error: { pill: 'bg-red-50 text-red-700 border border-red-200', dot: 'bg-red-600' },
  }[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tonos.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tonos.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function BotWhatsapp() {
  const activeProjectId = useActiveProjectId();
  const confirmDialog = useConfirm();
  const [bot, setBot] = useState<WaBot | null>(null);
  const [puenteVivo, setPuenteVivo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<Form>(formDesde(null));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [espera, setEspera] = useState<{ estadoAlPedir: string; desde: number } | null>(null);
  const esperandoConexion = espera !== null;
  const pendiente = useRef<Partial<Form>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const url = withActiveProject('/api/admin/whatsapp-bot', activeProjectId);
  const urlRef = useRef(url);
  const estadoRef = useRef<string>('desconectado');
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const cargar = useCallback(async (inicial: boolean) => {
    const miUrl = url;
    try {
      const res = await fetch(miUrl);
      if (!res.ok) throw new Error('Request failed');
      const data: { bot: WaBot | null; puenteVivo: boolean } = await res.json();
      if (urlRef.current !== miUrl) return; // cambió el proyecto mientras tanto
      setBot(data.bot);
      setPuenteVivo(data.puenteVivo);
      if (inicial) setForm(formDesde(data.bot));
      setError(false);
    } catch (e) {
      console.error(e);
      if (inicial && urlRef.current === miUrl) setError(true);
    } finally {
      if (inicial && urlRef.current === miUrl) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // Proyecto nuevo (o primera carga): se descarta todo lo del anterior.
    /* eslint-disable react-hooks/set-state-in-effect */
    pendiente.current = {};
    setBot(null);
    setForm(formDesde(null));
    setErrores({});
    // Un guardado del proyecto anterior que sigue en vuelo ya no toca el
    // estado (vigente() es false): si no se limpia acá, "Guardando…" queda fijo.
    setGuardando(false);
    setGuardado(false);
    setAccionError(null);
    setEspera(null);
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    cargar(true);
  }, [cargar]);

  const estado = bot?.estado ?? 'desconectado';
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);
  const pollear = estado === 'esperando_qr' || esperandoConexion;
  useEffect(() => {
    if (!pollear) return;
    const id = setInterval(() => cargar(false), POLL_QR_MS);
    return () => clearInterval(id);
  }, [pollear, cargar]);

  // Se deja de esperar cuando el estado cambia respecto del que había al pedir, o vence el tiempo.
  useEffect(() => {
    if (!espera) return;
    const r = resolverEspera(espera, estado, Date.now());
    if (r === 'resuelto') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEspera(null);
      return;
    }
    const restante = Math.max(0, ESPERA_PEDIDO_MS - (Date.now() - espera.desde));
    const t = setTimeout(() => {
      if (resolverEspera(espera, estadoRef.current, Date.now()) === 'timeout') {
        setAccionError('El servidor del bot no respondió. Probá de nuevo en un rato.');
      }
      setEspera(null);
    }, restante);
    return () => clearTimeout(t);
  }, [espera, estado]);

  const guardar = useCallback((): Promise<void> => {
    timer.current = null;
    const miUrl = url;
    // Se toma la foto de lo pendiente ya (no cuando le toque a la cola): así, al
    // cambiar de proyecto, lo del proyecto viejo sale al viejo y no se mezcla.
    const cambios = pendiente.current;
    pendiente.current = {};
    if (Object.keys(cambios).length === 0) return cola.current;
    const ejecutar = async () => {
      const vigente = () => urlRef.current === miUrl;
      const fallo = (msg: string) => {
        if (!vigente()) return;
        pendiente.current = remezclarFallidos(cambios, pendiente.current);
        setErrores(prev => ({ ...prev, _general: msg }));
      };
      // Un guardado del proyecto anterior que arranca tarde (estaba en la
      // cola) se manda igual, pero no marca "Guardando…" en el proyecto nuevo.
      if (vigente()) {
        setGuardando(true);
        setGuardado(false);
      }
      try {
        const res = await fetch(miUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cambios),
        });
        const data = await res.json().catch(() => ({}));
        if (!vigente()) return;
        if (res.ok) {
          setBot(prev => (prev ? { ...prev, ...data, qr: data.qr ?? prev.qr } : data));
          setErrores(prev => {
            const next = { ...prev };
            delete next._general;
            for (const k of Object.keys(cambios)) delete next[k];
            return next;
          });
          setGuardado(true);
        } else if (res.status === 400 && data.campos) {
          setErrores(prev => ({ ...prev, ...data.campos }));
        } else {
          fallo(data.error ?? 'No se pudo guardar.');
        }
      } catch (e) {
        console.error(e);
        fallo('No se pudo guardar. Revisá la conexión.');
      } finally {
        if (vigente()) setGuardando(false);
      }
    };
    // Los guardados van de a uno, para que dos PATCH no se pisen.
    cola.current = cola.current.then(ejecutar, ejecutar);
    return cola.current;
  }, [url]);

  const cambiar = <K extends Campo>(campo: K, valor: Form[K]) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    pendiente.current = { ...pendiente.current, [campo]: valor };
    setGuardado(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(guardar, AUTOSAVE_MS);
  };

  // Si se sale de la pestaña con un cambio sin mandar, se manda.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      void guardar();
    }
  }, [guardar]);

  const pedir = async (pedido: WaPedido) => {
    setAccionError(null);
    try {
      const res = await fetch(`${url.replace('/whatsapp-bot', '/whatsapp-bot/pedido')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'No se pudo enviar el pedido.');
      }
      setEspera({ estadoAlPedir: estadoRef.current, desde: Date.now() });
      await cargar(false);
    } catch (e) {
      setAccionError(e instanceof Error ? e.message : 'No se pudo enviar el pedido.');
    }
  };

  const desconectar = async () => {
    const ok = await confirmDialog({
      title: '¿Desconectar el número?',
      message: 'El bot deja de responder en este número hasta que lo vuelvas a vincular.',
      confirmLabel: 'Desconectar',
      danger: true,
    });
    if (ok) await pedir('desconectar');
  };

  if (loading) return <LoadingSpinner text="Cargando el bot..." tone="light" />;
  if (error) return <ErrorState message="No se pudo cargar la configuración del bot." onRetry={() => { setLoading(true); setError(false); cargar(true); }} />;

  const { panel, puenteCaido, faltaHost } = panelDelBot(bot, puenteVivo);
  const sinVincular = panel === 'desconectado' || panel === 'sin_bot';
  const hayCuerpo = sinVincular || panel === 'esperando_qr' || (panel === 'error' && !!bot?.ultimo_error) || !!accionError;

  return (
    <div className="flex flex-col gap-6">
      {puenteCaido && (
        <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700" role="alert">
          El servidor del bot no responde
        </div>
      )}
      {faltaHost && (
        <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800" role="status">
          Falta habilitar el servidor para este proyecto
        </div>
      )}

      {/* Resultados solo con el bot ya creado (antes no hay nada que medir). */}
      {bot && <MetricasBot key={`metricas-${activeProjectId}`} />}

      {/* Resumen rápido de canales + saltos directos para evitar scrollear toda la página */}
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { href: '#bot-canales', label: 'Canales', icon: Smartphone, on: panel === 'conectado' || form.chat_web },
              { href: '#bot-preguntas', label: 'Preguntas', icon: HelpCircle, on: false },
              { href: '#bot-atencion', label: 'Cómo atiende', icon: Sliders, on: form.activo || form.chat_web },
              { href: '#bot-agenda', label: 'Agenda', icon: Calendar, on: form.visitas.activo },
            ] as const
          ).map(({ href, label, icon: Icon, on }) => (
            <a
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-800 transition-colors"
            >
              <Icon className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
              {label}
              {on && <span className="w-1.5 h-1.5 rounded-full bg-brand-700" aria-hidden="true" />}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${form.chat_web ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-600'}`}>
            <BotMessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            Chat web {form.chat_web ? 'activo' : 'apagado'}
          </span>
          {(guardando || guardado) && (
            <span className="text-gray-600 font-medium" aria-live="polite">{guardando ? 'Guardando…' : 'Guardado'}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
          <section id="bot-canales" className={`${SECCION} scroll-mt-20`}>
            <div className="px-5 sm:px-6 py-5 flex flex-wrap items-center gap-4">
              <span className="w-11 h-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0" aria-hidden="true">
                <Smartphone className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="m-0 text-[15px] font-semibold text-gray-900">Número del proyecto</h2>
                  {panel === 'conectado' && <EstadoNumero tono="green">Conectado</EstadoNumero>}
                  {panel === 'esperando_qr' && <EstadoNumero tono="warn">Esperando que escanees el QR</EstadoNumero>}
                  {sinVincular && <EstadoNumero tono="neutral">Sin vincular</EstadoNumero>}
                  {panel === 'error' && <EstadoNumero tono="error">Error</EstadoNumero>}
                </div>
                <p className="m-0 mt-1 text-sm text-gray-700">
                  {panel === 'conectado' && bot?.numero
                    ? <><span className="tabular-nums">{bot.numero}</span> · chip dedicado a este proyecto</>
                    : esperandoConexion
                      ? 'Esperando al servidor del bot…'
                      : 'Usá un chip dedicado solo a este proyecto'}
                </p>
              </div>
              <label className="flex items-center gap-2.5 min-h-[44px] pl-3.5 pr-2 py-1.5 rounded-xl border border-gray-200 cursor-pointer">
                <span className="text-sm font-semibold text-gray-900">Bot activo</span>
                <Interruptor label="Bot activo" checked={form.activo} onChange={v => cambiar('activo', v)} />
              </label>
              {panel === 'conectado' && (
                <button
                  type="button"
                  onClick={desconectar}
                  disabled={esperandoConexion}
                  className="inline-flex items-center justify-center min-h-[44px] px-3.5 rounded-[10px] border border-red-200 bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Desconectar
                </button>
              )}
              {sinVincular && (
                <button type="button" onClick={() => pedir('conectar')} disabled={esperandoConexion} className={btnPrimary}>
                  Vincular número
                </button>
              )}
              {panel === 'error' && (
                <button type="button" onClick={() => pedir('reiniciar')} disabled={esperandoConexion} className={btnPrimary}>
                  Reintentar
                </button>
              )}
            </div>
            {errores.activo && <p className="m-0 px-5 sm:px-6 pb-4 text-xs font-medium text-red-700" role="alert">{errores.activo}</p>}

            {hayCuerpo && (panel === 'esperando_qr' || (panel === 'error' && !!bot?.ultimo_error) || !!accionError) && (
              <div className="px-5 sm:px-6 py-5 flex flex-col gap-4 border-t border-gray-100">
                {panel === 'error' && bot?.ultimo_error && (
                  <p className="m-0 text-[13px] leading-relaxed text-red-700">{bot.ultimo_error}</p>
                )}
                {panel === 'esperando_qr' && (
                  <div className="flex gap-6 flex-wrap items-start">
                    {bot?.qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bot.qr}
                        alt="Código QR para vincular el WhatsApp del proyecto"
                        width={260}
                        height={260}
                        className="rounded-[14px] border border-gray-200 bg-white p-2"
                        style={{ width: 260, height: 260 }}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-gray-300 bg-gray-50 text-[13px] text-gray-500"
                        style={{ width: 260, height: 260 }}
                      >
                        Generando el código…
                      </div>
                    )}
                    <ol className="m-0 flex-[1_1_220px] list-decimal pl-5 flex flex-col gap-2 text-sm leading-relaxed text-gray-700 marker:font-semibold marker:text-gray-500">
                      <li>Abrí WhatsApp en el celular del chip.</li>
                      <li>Entrá a Dispositivos vinculados.</li>
                      <li>Tocá Vincular un dispositivo y escaneá este código.</li>
                    </ol>
                  </div>
                )}
                {accionError && <p className={ERROR_TEXT} role="alert">{accionError}</p>}
              </div>
            )}
          </section>

          {/* key: al cambiar de proyecto arranca de cero (lista del anterior). */}
          <div id="bot-preguntas" className="scroll-mt-20">
            <PreguntasBot key={`preguntas-${activeProjectId}`} />
          </div>

          <section id="bot-atencion" className={`${SECCION} overflow-hidden scroll-mt-20`}>
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="m-0 text-base font-semibold text-gray-900">Cómo atiende</h2>
              <p className="m-0 mt-1 text-sm text-gray-600">Lo que dice el bot y a quién le pasa los leads.</p>
            </div>
            <div className="px-5 sm:px-6 py-5 grid gap-x-4 gap-y-[18px] sm:grid-cols-2">
              {errores._general && <p className={`${ERROR_TEXT} sm:col-span-2`} role="alert">{errores._general}</p>}

              <div className="sm:col-span-2">
                <Campo label="Se presenta como" ayuda="Si le preguntan, aclara que es un asistente virtual." error={errores.nombre_bot}>
                  <input className={fieldClass} value={form.nombre_bot} onChange={e => cambiar('nombre_bot', e.target.value)} placeholder="Sofía, del equipo de Torre Alba" />
                </Campo>
              </div>

              <Campo label="Vendedor" error={errores.vendedor_nombre}>
                <input className={fieldClass} value={form.vendedor_nombre} onChange={e => cambiar('vendedor_nombre', e.target.value)} placeholder="Nombre" />
              </Campo>
              <Campo label="WhatsApp del vendedor" error={errores.vendedor_whatsapp}>
                <input className={fieldClass} value={form.vendedor_whatsapp} onChange={e => cambiar('vendedor_whatsapp', e.target.value)} placeholder="+54 9 11 …" inputMode="tel" />
              </Campo>

              <div className="sm:col-span-2">
                <Campo label="Lo que el bot tiene que saber" ayuda="Financiación, entrega, visitas, preguntas frecuentes. Los precios y unidades los toma de la ficha." error={errores.conocimiento}>
                  <textarea className={`${fieldClass} py-3 leading-relaxed min-h-[160px] resize-y`} value={form.conocimiento} onChange={e => cambiar('conocimiento', e.target.value)} />
                </Campo>
              </div>

              <div className="sm:col-span-2">
                <Campo label="Cuándo avisarle al vendedor (opcional)" error={errores.criterio_aviso}>
                  <input className={fieldClass} value={form.criterio_aviso} onChange={e => cambiar('criterio_aviso', e.target.value)} placeholder="ej: avisame si pregunta por 3 ambientes o quiere visitar" />
                </Campo>
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 rounded-xl border border-[#ECE9E3] bg-gray-50">
                <div className="flex-1 min-w-[220px]">
                  <div className="text-sm font-semibold text-gray-900">Seguimiento automático</div>
                  <div className="text-[13px] text-gray-600 mt-0.5">Si alguien dejó de responder, le escribe una vez para retomar. Solo de 10 a 20 h.</div>
                </div>
                {form.seguimiento_activo && (
                  <label className="flex items-center gap-2 text-sm text-gray-900">
                    Después de
                    <select className="min-h-[40px] px-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900" value={form.seguimiento_horas} onChange={e => cambiar('seguimiento_horas', Number(e.target.value))}>
                      {OPCIONES_SEGUIMIENTO.map(o => <option key={o.horas} value={o.horas}>{o.label}</option>)}
                    </select>
                  </label>
                )}
                <Interruptor label="Seguimiento automático" checked={form.seguimiento_activo} onChange={v => cambiar('seguimiento_activo', v)} />
                {(errores.seguimiento_activo || errores.seguimiento_horas) && (
                  <span className="w-full text-xs font-medium text-red-700" role="alert">{errores.seguimiento_activo ?? errores.seguimiento_horas}</span>
                )}
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 rounded-xl border border-[#ECE9E3] bg-gray-50">
                <div className="flex-1 min-w-[220px]">
                  <div className="text-sm font-semibold text-gray-900">Chat en el sitio</div>
                  <div className="text-[13px] text-gray-600 mt-0.5">
                    Una burbuja en el sitio público del proyecto con este mismo asistente: usa el nombre, lo que tiene que saber y cuándo avisar de acá. Gasta como el bot. Funciona aunque el WhatsApp no esté vinculado.
                  </div>
                </div>
                <Interruptor label="Chat en el sitio" checked={form.chat_web} onChange={v => cambiar('chat_web', v)} />
                {form.chat_web && (estado !== 'conectado' || !form.vendedor_whatsapp.trim()) && (
                  <span className="w-full text-[13px] text-amber-800" role="status">
                    Los avisos del chat llegan por email y al panel mientras el WhatsApp no esté conectado.
                  </span>
                )}
                {errores.chat_web && <span className="w-full text-xs font-medium text-red-700" role="alert">{errores.chat_web}</span>}
              </div>
            </div>
          </section>

          <div id="bot-agenda" className="scroll-mt-20">
            <AgendaVisitas valor={form.visitas} onChange={v => cambiar('visitas', v)} error={errores.visitas} />
          </div>
        </div>

        <aside className="flex-[1_1_340px] min-w-0 lg:sticky lg:top-20">
          {/* key: al cambiar de proyecto arranca de cero (charla del anterior). */}
          <SimuladorBot key={`simulador-${activeProjectId}`} />
        </aside>
      </div>
    </div>
  );
}
