'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { btnPrimary, fieldClass } from '@/components/admin/panel-ui';
import type { WaBot, WaPedido } from '@/types/whatsapp-bot';
import { panelDelBot, resolverEspera, remezclarFallidos, ESPERA_PEDIDO_MS } from './bot-whatsapp-estado';

const AUTOSAVE_MS = 800;
const POLL_QR_MS = 3000;

type Campo = 'activo' | 'nombre_bot' | 'vendedor_nombre' | 'vendedor_whatsapp' | 'conocimiento' | 'criterio_aviso';
type Form = { activo: boolean; nombre_bot: string; vendedor_nombre: string; vendedor_whatsapp: string; conocimiento: string; criterio_aviso: string };

function formDesde(bot: WaBot | null): Form {
  return {
    activo: bot?.activo ?? false,
    nombre_bot: bot?.nombre_bot ?? '',
    vendedor_nombre: bot?.vendedor_nombre ?? '',
    vendedor_whatsapp: bot?.vendedor_whatsapp ?? '',
    conocimiento: bot?.conocimiento ?? '',
    criterio_aviso: bot?.criterio_aviso ?? '',
  };
}

// Tarjeta con encabezado separado por una línea, como las de Configuración.
const SECCION = 'rounded-2xl border border-gray-200 bg-white';
const SECCION_HEAD = 'px-5 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap';
const SECCION_BODY = 'px-5 sm:px-6 py-5 flex flex-col gap-4';
const ERROR_TEXT = 'm-0 text-[13px] font-medium text-red-700';

function Campo({ label, ayuda, error, children }: { label: string; ayuda?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {children}
      {ayuda && <span className="text-xs text-gray-500">{ayuda}</span>}
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
    <div className="max-w-[800px] flex flex-col gap-6">
      {/* El título es el "Leads" fijo de page.tsx; la pestaña ya dice "Bot de WhatsApp". */}
      <p className="m-0 text-[15px] leading-relaxed text-gray-600 max-w-[640px]">
        Vinculá el WhatsApp del proyecto y configurá cómo atiende el bot.
      </p>

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

      <section className={SECCION}>
        <div className={`${SECCION_HEAD} ${hayCuerpo ? 'border-b border-gray-200' : ''}`}>
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <h2 className="m-0 text-[15px] font-semibold text-gray-900">Número del proyecto</h2>
            {panel === 'conectado' && (
              <>
                <EstadoNumero tono="green">Conectado</EstadoNumero>
                {bot?.numero && <span className="text-[13px] font-medium text-gray-700 tabular-nums">{bot.numero}</span>}
              </>
            )}
            {panel === 'esperando_qr' && <EstadoNumero tono="warn">Esperando que escanees el QR</EstadoNumero>}
            {sinVincular && <EstadoNumero tono="neutral">Sin vincular</EstadoNumero>}
            {panel === 'error' && <EstadoNumero tono="error">Error</EstadoNumero>}
          </div>
          {panel === 'conectado' && (
            <button
              type="button"
              onClick={desconectar}
              disabled={esperandoConexion}
              className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-[10px] border border-red-300 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
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

        {hayCuerpo && (
          <div className={SECCION_BODY}>
            {sinVincular && (
              <p className="m-0 text-[13px] leading-relaxed text-gray-600">
                {esperandoConexion ? 'Esperando al servidor del bot…' : 'Usá un chip dedicado solo a este proyecto'}
              </p>
            )}
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
                <ol className="m-0 flex-[1_1_220px] list-decimal pl-5 flex flex-col gap-2 text-[13px] leading-relaxed text-gray-700 marker:font-semibold marker:text-gray-500">
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

      <section className={SECCION}>
        <div className={`${SECCION_HEAD} border-b border-gray-200`}>
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Configuración</h2>
          <span className="text-xs text-gray-500" aria-live="polite">{guardando ? 'Guardando…' : guardado ? 'Guardado' : ''}</span>
        </div>
        <div className="px-5 sm:px-6 py-5 flex flex-col gap-5">
          {errores._general && <p className={ERROR_TEXT} role="alert">{errores._general}</p>}

          <div className="flex flex-col gap-1.5">
            {/* Toggle del diseño (como "Mostrar la calculadora en el sitio"), sobre un checkbox nativo. */}
            <label className="flex items-center justify-between gap-4 min-h-[56px] px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer">
              <span className="text-sm font-semibold text-gray-900">Bot activo</span>
              <span className="relative shrink-0 w-11 h-7">
                <input type="checkbox" checked={form.activo} onChange={e => cambiar('activo', e.target.checked)} className="peer sr-only" />
                <span aria-hidden="true" className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 peer-focus-visible:ring-offset-2" />
                <span aria-hidden="true" className="absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-[left] peer-checked:left-[19px]" />
              </span>
            </label>
            {errores.activo && <span className="text-xs font-medium text-red-700" role="alert">{errores.activo}</span>}
          </div>

          <Campo label="Se presenta como" ayuda="Usá un nombre si querés; si le preguntan, aclara que es un asistente virtual" error={errores.nombre_bot}>
            <input className={fieldClass} value={form.nombre_bot} onChange={e => cambiar('nombre_bot', e.target.value)} placeholder="Sofía, del equipo de Torre Alba" />
          </Campo>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo label="Vendedor" error={errores.vendedor_nombre}>
              <input className={fieldClass} value={form.vendedor_nombre} onChange={e => cambiar('vendedor_nombre', e.target.value)} placeholder="Nombre" />
            </Campo>
            <Campo label="WhatsApp del vendedor" error={errores.vendedor_whatsapp}>
              <input className={fieldClass} value={form.vendedor_whatsapp} onChange={e => cambiar('vendedor_whatsapp', e.target.value)} placeholder="+54 9 11 …" inputMode="tel" />
            </Campo>
          </div>

          <Campo label="Lo que el bot tiene que saber" ayuda="Financiación, entrega, visitas, preguntas frecuentes" error={errores.conocimiento}>
            <textarea className={`${fieldClass} py-3 leading-relaxed min-h-[220px] resize-y`} value={form.conocimiento} onChange={e => cambiar('conocimiento', e.target.value)} />
          </Campo>

          <Campo label="Cuándo avisarme (opcional)" error={errores.criterio_aviso}>
            <input className={fieldClass} value={form.criterio_aviso} onChange={e => cambiar('criterio_aviso', e.target.value)} placeholder="ej: solo si pregunta por 3 ambientes" />
          </Campo>
        </div>
      </section>
    </div>
  );
}
