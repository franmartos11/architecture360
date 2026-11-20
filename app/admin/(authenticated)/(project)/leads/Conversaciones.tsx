'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectRole } from '@/lib/project-role-context';
import { hasRole } from '@/lib/project-roles';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Bot, Flame, Search, TriangleAlert, User } from 'lucide-react';
import { btnPrimary, fieldClass } from '@/components/admin/panel-ui';
import type { WaConversacion, WaMensaje, WaSalida } from '@/types/whatsapp-bot';
import {
  filtrarConversaciones, burbuja, posicionAviso, modoLabel, pendientesVisibles, tiempoCorto,
  avisoChat, numeroVisible, tituloConversacion as titulo,
  type MensajePendiente, type SalidaPendiente,
} from './conversaciones-logica';

const POLL_MS = 20_000;

type MensajeConMedia = WaMensaje & { media_url: string | null };
type Detalle = { conversacion: WaConversacion; mensajes: MensajeConMedia[]; salidas?: SalidaPendiente[] };

// Tonos de las burbujas con la paleta del panel: el cliente a la izquierda en
// blanco; a la derecha el bot (verde claro), el vendedor desde el panel (verde
// del diseño) y lo que se mandó desde el celular (beige).
const TONO_BURBUJA = {
  cliente: { caja: 'bg-white border-gray-200 text-gray-900 rounded-bl-md', meta: 'text-gray-500' },
  bot: { caja: 'bg-brand-100 border-brand-200 text-brand-900 rounded-br-md', meta: 'text-brand-800' },
  vendedor: { caja: 'bg-brand-700 border-brand-700 text-white rounded-br-md', meta: 'text-white/70' },
  telefono: { caja: 'bg-[#EAE7E0] border-gray-300 text-gray-900 rounded-br-md', meta: 'text-gray-600' },
} as const;
const BURBUJA_CLASS = 'max-w-[80%] rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed shadow-[0_1px_2px_rgba(23,25,26,0.04)]';
const ETIQUETA_CLASS = 'text-[10px] font-semibold uppercase tracking-[0.08em] mb-0.5';
const HORA_CLASS = 'text-[10px] mt-1 text-right tabular-nums';

function Burbuja({ m, vendedorNombre, onImgError }: { m: MensajeConMedia; vendedorNombre: string | null; onImgError: () => void }) {
  const { lado, etiqueta } = burbuja(m.autor, vendedorNombre);
  const derecha = lado === 'derecha';
  const tono = !derecha
    ? TONO_BURBUJA.cliente
    : m.autor === 'bot'
      ? TONO_BURBUJA.bot
      : m.autor === 'vendedor'
        ? TONO_BURBUJA.vendedor
        : TONO_BURBUJA.telefono;
  return (
    <div className={`flex ${derecha ? 'justify-end' : 'justify-start'}`}>
      <div className={`${BURBUJA_CLASS} ${tono.caja}`}>
        {etiqueta && <div className={`${ETIQUETA_CLASS} ${tono.meta}`}>{etiqueta}</div>}
        {m.tipo === 'imagen' && (
          m.media_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={m.media_url} alt="Imagen del chat" onError={onImgError} className="rounded-xl max-h-64 mb-1.5" />
            : <div className="italic opacity-70">[Imagen no disponible]</div>
        )}
        {m.tipo === 'audio' && (
          m.media_url
            ? <audio controls src={m.media_url} className="max-w-full" />
            : <div className="italic opacity-70">[Audio no disponible]</div>
        )}
        {(m.tipo === 'documento' || m.tipo === 'otro') && !m.cuerpo && (
          <div className="italic opacity-70">[{m.tipo === 'documento' ? 'Documento' : 'Mensaje no compatible'}]</div>
        )}
        {m.cuerpo && <div className="whitespace-pre-wrap break-words">{m.cuerpo}</div>}
        <div className={`${HORA_CLASS} ${tono.meta}`}>{tiempoCorto(m.orden_at ?? m.enviado_at)}</div>
      </div>
    </div>
  );
}

export default function Conversaciones({ conversacionId }: { conversacionId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const activeProjectId = useActiveProjectId();
  // La configuración del bot (de donde sale el nombre del vendedor) es de
  // administrador en adelante: un gestor no la pide y el aviso dice "el vendedor".
  const puedeLeerBot = hasRole(useProjectRole(), 'administrador');
  const [lista, setLista] = useState<WaConversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [detalleError, setDetalleError] = useState(false);
  const [pendientes, setPendientes] = useState<MensajePendiente[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [vendedorNombre, setVendedorNombre] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const proyectoRef = useRef(activeProjectId);
  const abiertaRef = useRef(conversacionId);
  const imgReintentoRef = useRef<string | null>(null);
  const enviandoRef = useRef(false);
  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    proyectoRef.current = activeProjectId;
    abiertaRef.current = conversacionId;
  }, [activeProjectId, conversacionId]);

  const urlLista = withActiveProject('/api/admin/whatsapp-bot/conversaciones', activeProjectId);

  const cargarLista = useCallback(async (inicial: boolean) => {
    const proyecto = activeProjectId;
    try {
      const res = await fetch(urlLista);
      if (!res.ok) throw new Error('Request failed');
      const data: WaConversacion[] = await res.json();
      if (proyectoRef.current !== proyecto) return;
      setLista(Array.isArray(data) ? data : []);
      setError(false);
    } catch (e) {
      console.error(e);
      if (inicial && proyectoRef.current === proyecto) setError(true);
    } finally {
      if (inicial && proyectoRef.current === proyecto) setCargando(false);
    }
  }, [activeProjectId, urlLista]);

  const cargarDetalle = useCallback(async (id: string) => {
    const proyecto = activeProjectId;
    try {
      const res = await fetch(withActiveProject(`/api/admin/whatsapp-bot/conversaciones/${id}`, activeProjectId));
      if (!res.ok) throw new Error('Request failed');
      const data: Detalle = await res.json();
      if (proyectoRef.current !== proyecto || abiertaRef.current !== id) return;
      setDetalle(data);
      setDetalleError(false);
      return data;
    } catch (e) {
      console.error(e);
      if (proyectoRef.current === proyecto && abiertaRef.current === id) setDetalleError(true);
    }
  }, [activeProjectId]);

  const marcarLeido = useCallback((id: string) => {
    const proyecto = activeProjectId;
    fetch(withActiveProject(`/api/admin/whatsapp-bot/conversaciones/${id}`, activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'leido' }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((c: WaConversacion | null) => {
        if (!c || proyectoRef.current !== proyecto) return;
        setLista(prev => prev.map(x => (x.id === c.id ? { ...x, no_leidos: c.no_leidos } : x)));
        setDetalle(prev => (prev && prev.conversacion.id === c.id ? { ...prev, conversacion: { ...prev.conversacion, no_leidos: c.no_leidos } } : prev));
      })
      .catch(() => {});
  }, [activeProjectId]);

  // Lista: carga inicial por proyecto + Realtime + poll de respaldo.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLista([]);
    setVendedorNombre(null);
    setCargando(true);
    setError(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    cargarLista(true);
    const proyecto = activeProjectId;
    if (puedeLeerBot) {
      fetch(withActiveProject('/api/admin/whatsapp-bot', activeProjectId))
        .then(r => (r.ok ? r.json() : null))
        .then((d: { bot: { vendedor_nombre: string | null } | null } | null) => {
          if (proyectoRef.current === proyecto) setVendedorNombre(d?.bot?.vendedor_nombre ?? null);
        })
        .catch(() => {});
    }
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`wa-conversaciones:${activeProjectId ?? 'mine'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wa_conversaciones', ...(activeProjectId ? { filter: `project_id=eq.${activeProjectId}` } : {}) },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            cargarLista(false);
            const abierta = abiertaRef.current;
            if (abierta) cargarDetalle(abierta);
          }, 300);
        },
      )
      .subscribe();
    const poll = setInterval(() => {
      cargarLista(false);
      const abierta = abiertaRef.current;
      if (abierta) cargarDetalle(abierta);
    }, POLL_MS);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(canal);
    };
  }, [activeProjectId, cargarLista, cargarDetalle, puedeLeerBot]);

  // Chat abierto: carga, marca leído y Realtime de sus mensajes.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDetalle(null);
    setDetalleError(false);
    setPendientes([]);
    setTexto('');
    setAccionError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    imgReintentoRef.current = null;
    if (!conversacionId) return;
    cargarDetalle(conversacionId).then(d => {
      if (d && d.conversacion.no_leidos > 0) marcarLeido(conversacionId);
    });
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`wa-mensajes:${conversacionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wa_mensajes', filter: `conversacion_id=eq.${conversacionId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            cargarDetalle(conversacionId).then(d => {
              if (d && d.conversacion.no_leidos > 0) marcarLeido(conversacionId);
            });
          }, 300);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [activeProjectId, conversacionId, cargarDetalle, marcarLeido]);

  // Reloj para el "vuelve al bot en …".
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const mensajes = useMemo(() => detalle?.mensajes ?? [], [detalle]);
  const visibles = useMemo(() => pendientesVisibles(pendientes, mensajes, detalle?.salidas), [pendientes, mensajes, detalle]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length, visibles.length, conversacionId]);

  const abrir = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', 'conversaciones');
    if (id) next.set('c', id);
    else next.delete('c');
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const aplicarConversacion = (c: WaConversacion) => {
    setLista(prev => prev.map(x => (x.id === c.id ? c : x)));
    setDetalle(prev => (prev && prev.conversacion.id === c.id ? { ...prev, conversacion: c } : prev));
  };

  const cambiarModo = async (accion: 'tomar' | 'devolver') => {
    if (!conversacionId) return;
    setAccionError(null);
    try {
      const res = await fetch(withActiveProject(`/api/admin/whatsapp-bot/conversaciones/${conversacionId}`, activeProjectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });
      if (!res.ok) throw new Error('Request failed');
      const c: WaConversacion = await res.json();
      if (abiertaRef.current === conversacionId) aplicarConversacion(c);
    } catch (e) {
      console.error(e);
      setAccionError('No se pudo cambiar el modo del chat. Probá de nuevo.');
    }
  };

  const enviar = async (reintento?: MensajePendiente) => {
    const cuerpo = reintento ? reintento.cuerpo : texto.trim();
    const id = conversacionId;
    if (!id || !cuerpo || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setAccionError(null);
    try {
      const res = await fetch(withActiveProject(`/api/admin/whatsapp-bot/conversaciones/${id}/enviar`, activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: cuerpo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'No se pudo enviar el mensaje.');
      }
      const data: { salida: WaSalida; conversacion: WaConversacion | null } = await res.json();
      if (abiertaRef.current !== id) return;
      if (!reintento) setTexto('');
      setPendientes(prev => [...prev.filter(x => x.salidaId !== reintento?.salidaId), { salidaId: data.salida.id, cuerpo, estado: 'pendiente' }]);
      if (data.conversacion) aplicarConversacion(data.conversacion);
      else cargarDetalle(id);
    } catch (e) {
      if (abiertaRef.current === id) setAccionError(e instanceof Error ? e.message : 'No se pudo enviar el mensaje.');
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  // Las URLs firmadas vencen a la hora: si una imagen falla, se recarga el chat una vez.
  const reintentarImagen = () => {
    if (!conversacionId || imgReintentoRef.current === conversacionId) return;
    imgReintentoRef.current = conversacionId;
    cargarDetalle(conversacionId);
  };

  const filtradas = useMemo(() => filtrarConversaciones(lista, busqueda), [lista, busqueda]);

  if (cargando) return <LoadingSpinner text="Cargando conversaciones..." tone="light" />;
  if (error) return <ErrorState message="No se pudieron cargar las conversaciones." onRetry={() => { setCargando(true); cargarLista(true); }} />;

  const conv = detalle?.conversacion ?? lista.find(c => c.id === conversacionId) ?? null;
  const modo = conv ? modoLabel(conv, ahora) : null;
  const aviso = conv ? avisoChat(conv) : null;
  const posAviso = detalle ? posicionAviso(mensajes, detalle.conversacion.avisado_at) : null;
  const separador = detalle && posAviso !== null && (
    <div className="flex justify-center my-1" key="aviso">
      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center text-[11px] font-semibold rounded-full px-3 py-1 bg-amber-100 text-amber-800">
        <Flame className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>
          Aviso enviado a {(vendedorNombre?.trim() || 'el vendedor')}
          {detalle.conversacion.lead_id && <> · <button className="underline underline-offset-2 cursor-pointer" onClick={() => router.replace('?tab=tablero', { scroll: false })}>ver lead</button></>}
        </span>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-[420px] flex rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Lista */}
      <div className={`${conversacionId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] md:shrink-0 flex-col min-h-0 md:border-r md:border-gray-200`}>
        <div className="p-3 border-b border-gray-200">
          {/* Mismo buscador que el del tablero. */}
          <label className="flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-[10px] border border-gray-200 bg-white focus-within:border-brand-700">
            <Search className="w-[15px] h-[15px] shrink-0 text-gray-500" aria-hidden="true" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o número"
              aria-label="Buscar conversación"
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtradas.length === 0 && (
            lista.length === 0 ? (
              <div className="px-5 py-6 flex flex-col gap-1.5">
                <p className="m-0 text-[15px] font-semibold text-gray-900">Todavía no hay conversaciones.</p>
                <p className="m-0 text-[13px] leading-relaxed text-gray-600">Aparecen acá cuando alguien le escribe al WhatsApp del proyecto.</p>
              </div>
            ) : (
              <p className="m-0 px-5 py-6 text-[13px] text-gray-600">No hay conversaciones que coincidan.</p>
            )
          )}
          {filtradas.map(c => {
            const on = c.id === conversacionId;
            const humano = modoLabel(c, ahora).humano;
            const pista = avisoChat(c);
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={`w-full text-left px-4 py-3 flex gap-2.5 items-start cursor-pointer outline-none border-b border-gray-200 transition-colors focus-visible:bg-gray-50 ${
                  on ? 'bg-brand-50 shadow-[inset_3px_0_0_var(--color-brand-700)]' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${c.no_leidos > 0 ? 'bg-brand-700' : 'bg-transparent'}`} aria-label={c.no_leidos > 0 ? 'Sin leer' : undefined} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`text-[13px] text-gray-900 truncate ${c.no_leidos > 0 ? 'font-semibold' : 'font-medium'}`}>{titulo(c)}</span>
                    {c.avisado_at && (
                      <span title="Se avisó al vendedor" className="shrink-0 text-amber-800">
                        <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">{tiempoCorto(c.ultimo_mensaje_at)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-xs truncate flex-1 ${c.no_leidos > 0 ? 'text-gray-700' : 'text-gray-600'}`}>{c.ultimo_mensaje ?? 'Sin mensajes'}</span>
                    <span className={`shrink-0 ${humano ? 'text-brand-700' : 'text-gray-400'}`} title={humano ? 'Atendido por vos' : 'Bot respondiendo'}>
                      {humano ? <User className="w-3.5 h-3.5" aria-hidden="true" /> : <Bot className="w-3.5 h-3.5" aria-hidden="true" />}
                    </span>
                  </span>
                  {pista && (
                    <span className="flex items-center gap-1 mt-1 text-[11px] text-amber-800" title={pista}>
                      <TriangleAlert className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{pista}</span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat */}
      <div className={`${conversacionId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col min-h-0 bg-gray-100`}>
        {!conversacionId || !conv ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-gray-500 p-6 text-center">
            {conversacionId && !detalleError ? 'Cargando chat...' : conversacionId ? 'No se encontró la conversación.' : 'Elegí una conversación de la lista.'}
          </div>
        ) : (
          <>
            <div className="px-4 sm:px-5 py-3 flex items-center gap-3 bg-white border-b border-gray-200">
              <button onClick={() => abrir(null)} className="md:hidden w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-900 hover:border-gray-400 cursor-pointer" aria-label="Volver a la lista">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-gray-900 truncate">{titulo(conv)}{conv.contacto_nombre?.trim() && <span className="font-normal text-gray-500"> · {numeroVisible(conv)}</span>}</div>
                <div className={`text-xs ${modo?.humano ? 'font-medium text-brand-800' : 'text-gray-600'}`}>{modo?.texto}</div>
                {aviso && (
                  <div className="flex items-center gap-1 text-xs text-amber-800 mt-0.5" role="status">
                    <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{aviso}</span>
                  </div>
                )}
              </div>
              {modo?.accion === 'devolver' && (
                <button onClick={() => cambiarModo('devolver')} className="inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-[10px] border border-gray-300 bg-white text-gray-900 text-[13px] font-medium hover:border-gray-400 whitespace-nowrap cursor-pointer transition-colors">Devolver al bot</button>
              )}
              {modo?.accion === 'tomar' && (
                <button onClick={() => cambiarModo('tomar')} className="inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-[10px] bg-brand-700 text-white text-[13px] font-semibold hover:bg-brand-800 whitespace-nowrap cursor-pointer transition-colors">Tomar chat</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 flex flex-col gap-2">
              {!detalle && (detalleError
                ? (
                  <div className="text-[13px] text-red-700" role="alert">
                    No se pudieron cargar los mensajes.{' '}
                    <button type="button" className="font-semibold underline underline-offset-2 cursor-pointer" onClick={() => { setDetalleError(false); cargarDetalle(conversacionId); }}>Reintentar</button>
                  </div>
                )
                : <div className="text-[13px] text-gray-500">Cargando mensajes...</div>)}
              {mensajes.map((m, i) => (
                <div key={m.id} className="flex flex-col gap-2">
                  {posAviso === i && separador}
                  <Burbuja m={m} vendedorNombre={vendedorNombre} onImgError={reintentarImagen} />
                </div>
              ))}
              {posAviso !== null && posAviso >= mensajes.length && separador}
              {visibles.map(p => (
                <div key={p.salidaId} className="flex justify-end">
                  <div className={`${BURBUJA_CLASS} ${TONO_BURBUJA.vendedor.caja} ${p.estado === 'error' ? 'ring-2 ring-red-600 ring-offset-2 ring-offset-gray-100' : 'opacity-60'}`}>
                    <div className={`${ETIQUETA_CLASS} ${TONO_BURBUJA.vendedor.meta}`}>{vendedorNombre?.trim() || 'Vos'}</div>
                    <div className="whitespace-pre-wrap break-words">{p.cuerpo}</div>
                    <div className={`${HORA_CLASS} ${TONO_BURBUJA.vendedor.meta}`}>{p.estado === 'error' ? (
                      <>No se pudo enviar · <button type="button" className="font-semibold text-white underline underline-offset-2 cursor-pointer" onClick={() => enviar(p)}>Reintentar</button></>
                    ) : 'Enviando…'}</div>
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            <div className="px-3 sm:px-4 py-3 bg-white border-t border-gray-200">
              {accionError && <div className="text-xs font-medium text-red-700 mb-2" role="alert">{accionError}</div>}
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); enviar(); }}>
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  maxLength={4000}
                  placeholder="Escribí como vendedor…"
                  aria-label="Mensaje"
                  className={`${fieldClass} flex-1 min-w-0`}
                />
                <button type="submit" disabled={enviando || !texto.trim()} className={`${btnPrimary} shrink-0 cursor-pointer disabled:cursor-not-allowed`}>
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </form>
              {!modo?.humano && <p className="text-[11px] text-gray-500 mt-2">Al enviar, el chat pasa a modo humano y el bot deja de responder.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
