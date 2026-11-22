'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectRole } from '@/lib/project-role-context';
import { hasRole } from '@/lib/project-roles';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, ArrowRight, Bot, CalendarDays, ChevronRight, Flame, Hand, Info, Search, Send, TriangleAlert, User } from 'lucide-react';
import type { Lead } from '@/types';
import type { WaConversacion, WaMensaje, WaSalida, WaVisita } from '@/types/whatsapp-bot';
import { fechaAR, textoTurno } from '@/lib/whatsapp-bot/visitas';
import { filasCalificacion } from '@/lib/whatsapp-bot/calificacion';
import { Avatar, ChipFiltro, Etiqueta, PillInteres, PuntoVivo, hace } from './leads-ui';
import {
  filtrarConversaciones, burbuja, posicionAviso, modoLabel, pendientesVisibles, tiempoCorto,
  avisoChat, numeroVisible, tituloConversacion as titulo,
  type MensajePendiente, type SalidaPendiente,
} from './conversaciones-logica';

// Respaldo de Realtime: con el canal caído se consulta cada 20 s; conectado,
// cada 60 s (por si las tablas wa_* no estuvieran en la publicación de
// Realtime: el canal figura conectado pero no llega nada). Con la pestaña
// oculta, nunca.
const POLL_MS = 20_000;
const POLL_EN_VIVO_CADA = 3; // ciclos de POLL_MS

type MensajeConMedia = WaMensaje & { media_url: string | null };
type Detalle = { conversacion: WaConversacion; mensajes: MensajeConMedia[]; salidas?: SalidaPendiente[] };

// Burbujas del diseño: el cliente a la izquierda en blanco; a la derecha el
// bot (verde claro, con la marca BOT), el vendedor desde el panel (verde) y lo
// que se mandó desde el celular (beige).
const TONO_BURBUJA = {
  cliente: { caja: 'bg-white border border-[#EBE8E2] text-gray-900 rounded-[4px_14px_14px_14px]', meta: 'text-gray-500' },
  bot: { caja: 'bg-brand-100 text-gray-900 rounded-[14px_4px_14px_14px]', meta: 'text-brand-800' },
  vendedor: { caja: 'bg-brand-700 text-white rounded-[14px_4px_14px_14px]', meta: 'text-white/75' },
  telefono: { caja: 'bg-[#EAE7E0] text-gray-900 rounded-[14px_4px_14px_14px]', meta: 'text-gray-600' },
} as const;
const BURBUJA_CLASS = 'max-w-[85%] sm:max-w-[72%] px-3.5 py-2.5 text-[15px] leading-[1.45]';
const ETIQUETA_CLASS = 'flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] mb-1';
const HORA_CLASS = 'text-[11px] mt-1 text-right tabular-nums';

type FiltroChat = 'todas' | 'sin_leer' | 'bot' | 'vendedor';

/** "Hoy", "Ayer" o "sáb 21/11" para los separadores del chat. */
function etiquetaDia(iso: string, ahora: number): string {
  const dia = fechaAR(new Date(iso));
  if (dia === fechaAR(new Date(ahora))) return 'Hoy';
  if (dia === fechaAR(new Date(ahora - 86_400_000))) return 'Ayer';
  const [d, f] = textoTurno(new Date(iso)).split(' ');
  return `${d} ${f}`;
}

/** El texto de modoLabel sin el emoji del principio (acá el estado lo marca el punto). */
const sinEmoji = (t: string) => t.replace(/^[^\p{L}]+/u, '');

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
        {etiqueta && (
          <div className={`${ETIQUETA_CLASS} ${tono.meta}`}>
            {m.autor === 'bot' ? <Bot className="w-3.5 h-3.5" aria-hidden="true" /> : <User className="w-3.5 h-3.5" aria-hidden="true" />}
            {etiqueta}
          </div>
        )}
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
        {m.tipo === 'audio' && m.transcripcion && (
          <div className="mt-1 text-sm leading-relaxed opacity-80">“{m.transcripcion}”</div>
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

const COLUMNAS_LEAD: Record<string, string> = { nuevo: 'Nuevos', contactado: 'Contactados', negociacion: 'En negociación', cerrado: 'Venta cerrada' };

/** Panel derecho: lo que se sabe del lead de este chat (y su visita). */
function DatosLead({
  conv,
  lead,
  visita,
  onConfirmar,
  onVerAgenda,
  onVerFicha,
}: {
  conv: WaConversacion;
  lead: Lead | null;
  visita: WaVisita | null;
  onConfirmar: (v: WaVisita) => void;
  onVerAgenda: () => void;
  onVerFicha: (id: string) => void;
}) {
  const filas = lead?.calificacion ? filasCalificacion(lead.calificacion).filter(([k]) => k !== 'Interés') : [];
  if (lead?.unit_name) filas.unshift(['Unidad', lead.unit_name]);
  return (
    <aside aria-label="Datos del lead" className="hidden xl:flex w-[300px] shrink-0 border-l border-gray-200 p-5 flex-col gap-5 overflow-y-auto">
      <div className="flex items-center gap-3">
        <Avatar nombre={lead?.name ?? titulo(conv)} size={48} />
        <div className="min-w-0">
          <div className="text-base font-semibold text-gray-900 truncate">{lead?.name ?? titulo(conv)}</div>
          <div className="text-[13px] text-gray-600 mt-0.5">{lead ? `Lead desde ${hace(lead.created_at) === 'ayer' ? 'ayer' : `hace ${hace(lead.created_at)}`}` : 'Todavía no es lead'}</div>
        </div>
      </div>
      {lead && (
        <div className="flex gap-1.5 flex-wrap">
          {lead.calificacion && <PillInteres t={lead.calificacion.temperatura} />}
          <Etiqueta>Etapa: {COLUMNAS_LEAD[lead.status || 'nuevo'] ?? lead.status}</Etiqueta>
        </div>
      )}
      {visita && (
        <div className="rounded-xl bg-gray-100 p-3.5">
          <div className="text-xs text-gray-600">{visita.estado === 'agendada' ? 'Visita · por confirmar' : 'Visita confirmada'}</div>
          <div className="text-[15px] font-semibold text-gray-900 mt-0.5 first-letter:uppercase">{textoTurno(new Date(visita.inicio)).replace(/ (\d\d:\d\d)$/, ' · $1')}</div>
          <div className="flex gap-2 mt-3">
            {visita.estado === 'agendada' && (
              <button type="button" onClick={() => onConfirmar(visita)} className="flex-1 min-h-[36px] rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-black">Confirmar</button>
            )}
            <button type="button" onClick={onVerAgenda} className="flex-1 min-h-[36px] rounded-lg border border-gray-300 bg-white text-[13px] font-medium text-gray-900 hover:border-gray-400">Ver agenda</button>
          </div>
        </div>
      )}
      {filas.length > 0 && (
        <div>
          <h3 className="m-0 mb-2.5 text-sm font-semibold text-gray-900">Lo que juntó el bot</h3>
          <dl className="m-0 grid grid-cols-[104px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-sm">
            {filas.map(([k, v]) => (
              <Fragment key={k}>
                <dt className="text-gray-600">{k}</dt>
                <dd className="m-0 font-medium text-gray-900 first-letter:uppercase">{v}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}
      {conv.resumen && (
        <div>
          <h3 className="m-0 mb-1.5 text-sm font-semibold text-gray-900">Resumen</h3>
          <p className="m-0 text-sm leading-relaxed text-gray-700">{conv.resumen}</p>
        </div>
      )}
      {!lead && !conv.resumen && (
        <p className="m-0 text-[13px] leading-relaxed text-gray-600">Cuando el bot detecte interés, crea el lead y le avisa al vendedor.</p>
      )}
      {lead && (
        <button type="button" onClick={() => onVerFicha(lead.id)} className="mt-auto min-h-[44px] rounded-[10px] border border-gray-300 bg-white text-sm font-medium text-gray-900 flex items-center justify-center gap-2 hover:border-gray-400">
          Ver ficha en el tablero<ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </aside>
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
  const [filtro, setFiltro] = useState<FiltroChat>('todas');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [visitas, setVisitas] = useState<WaVisita[]>([]);

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
    let enVivo = false;
    let ciclo = 0;
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
      .subscribe(estado => {
        enVivo = estado === 'SUBSCRIBED';
      });
    const poll = setInterval(() => {
      ciclo++;
      if (document.hidden || (enVivo && ciclo % POLL_EN_VIVO_CADA !== 0)) return;
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

  // Leads del proyecto (para la tarjeta de cada conversación y el panel
  // derecho): extra, si fallan el chat anda igual. La lista entera se pide al
  // cambiar de proyecto y de nuevo solo si aparece una conversación con un
  // lead que no está cargado (el bot acaba de crearlo), no en cada chat abierto.
  const faltaLead = lista.some(c => c.lead_id && !leads.some(l => l.id === c.lead_id));
  useEffect(() => {
    let vivo = true;
    fetch(withActiveProject('/api/admin/leads', activeProjectId))
      .then(r => (r.ok ? r.json() : null))
      .then((d: Lead[] | null) => { if (vivo && Array.isArray(d)) setLeads(d); })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [activeProjectId, faltaLead]);

  // Visitas (panel derecho): se refrescan al abrir cada chat, el bot puede haber agendado una.
  useEffect(() => {
    let vivo = true;
    fetch(withActiveProject('/api/admin/whatsapp-bot/visitas', activeProjectId))
      .then(r => (r.ok ? r.json() : null))
      .then((d: { visitas?: WaVisita[] } | null) => { if (vivo && Array.isArray(d?.visitas)) setVisitas(d.visitas); })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [activeProjectId, conversacionId]);

  const confirmarVisita = async (v: WaVisita) => {
    try {
      const res = await fetch(`/api/admin/whatsapp-bot/visitas/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'confirmada' }),
      });
      if (!res.ok) throw new Error('Request failed');
      const nueva: WaVisita = await res.json();
      setVisitas(vs => vs.map(x => (x.id === nueva.id ? nueva : x)));
    } catch {
      setAccionError('No se pudo confirmar la visita.');
    }
  };

  const irATab = (query: string) => router.replace(`?${query}`, { scroll: false });

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

  const buscadas = useMemo(() => filtrarConversaciones(lista, busqueda), [lista, busqueda]);
  const pasaFiltro = (c: WaConversacion, f: FiltroChat) =>
    f === 'sin_leer' ? c.no_leidos > 0 : f === 'bot' ? !modoLabel(c, ahora).humano : f === 'vendedor' ? modoLabel(c, ahora).humano : true;
  const filtradas = buscadas.filter(c => pasaFiltro(c, filtro));

  if (cargando) return <LoadingSpinner text="Cargando conversaciones..." tone="light" />;
  if (error) return <ErrorState message="No se pudieron cargar las conversaciones." onRetry={() => { setCargando(true); cargarLista(true); }} />;

  const conv = detalle?.conversacion ?? lista.find(c => c.id === conversacionId) ?? null;
  const modo = conv ? modoLabel(conv, ahora) : null;
  const aviso = conv ? avisoChat(conv) : null;
  const posAviso = detalle ? posicionAviso(mensajes, detalle.conversacion.avisado_at) : null;
  const leadDe = (c: WaConversacion) => leads.find(l => (c.lead_id && l.id === c.lead_id) || l.wa_conversacion_id === c.id) ?? null;
  const visitaDe = (c: WaConversacion) =>
    visitas
      .filter(v => v.conversacion_id === c.id && v.estado !== 'cancelada' && new Date(v.fin).getTime() >= ahora)
      .sort((x, y) => x.inicio.localeCompare(y.inicio))[0] ?? null;
  const lead = conv ? leadDe(conv) : null;
  const visita = conv ? visitaDe(conv) : null;
  const separador = detalle && posAviso !== null && (
    <div className="flex justify-center my-1" key="aviso">
      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center text-[13px] rounded-full px-3 py-1.5 bg-amber-50 text-amber-800">
        <Flame className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>
          Aviso enviado a {(vendedorNombre?.trim() || 'el vendedor')}
          {lead && <> · <button className="underline underline-offset-2 cursor-pointer" onClick={() => irATab(`tab=tablero&lead=${lead.id}`)}>ver lead</button></>}
        </span>
      </div>
    </div>
  );
  const FILTROS_CHAT: { id: FiltroChat; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'sin_leer', label: 'Sin leer' },
    { id: 'bot', label: 'Bot' },
    { id: 'vendedor', label: 'Vendedor' },
  ];

  return (
    <div className="h-full min-h-[420px] flex rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Lista */}
      <section aria-label="Lista de conversaciones" className={`${conversacionId ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] md:shrink-0 flex-col min-h-0 md:border-r md:border-gray-200`}>
        <div className="p-4 flex flex-col gap-3 border-b border-gray-200">
          <label className="flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-[10px] border border-gray-200 bg-gray-50 focus-within:border-brand-700 focus-within:bg-white">
            <Search className="w-4 h-4 shrink-0 text-gray-500" aria-hidden="true" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o número"
              aria-label="Buscar conversación"
              className="flex-1 min-w-0 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-500"
            />
          </label>
          {lista.length > 0 && (
            <div role="group" aria-label="Filtrar conversaciones" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {FILTROS_CHAT.map(f => (
                <ChipFiltro key={f.id} chico activo={filtro === f.id} onClick={() => setFiltro(f.id)} cantidad={buscadas.filter(c => pasaFiltro(c, f.id)).length}>{f.label}</ChipFiltro>
              ))}
            </div>
          )}
        </div>
        <ul className="m-0 p-2 list-none flex-1 overflow-y-auto flex flex-col gap-0.5">
          {filtradas.length === 0 && (
            lista.length === 0 ? (
              <li className="px-3 py-4 flex flex-col gap-1.5">
                <p className="m-0 text-[15px] font-semibold text-gray-900">Todavía no hay conversaciones.</p>
                <p className="m-0 text-[13px] leading-relaxed text-gray-600">Aparecen acá cuando alguien le escribe al WhatsApp del proyecto.</p>
              </li>
            ) : (
              <li className="px-3 py-4 text-[13px] text-gray-600">No hay conversaciones que coincidan.</li>
            )
          )}
          {filtradas.map(c => {
            const on = c.id === conversacionId;
            const humano = modoLabel(c, ahora).humano;
            const pista = avisoChat(c);
            const sinLeer = c.no_leidos > 0;
            const l = leadDe(c);
            const v = visitaDe(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => abrir(c.id)}
                  aria-current={on ? 'true' : undefined}
                  className={`w-full text-left p-3 flex gap-3 items-start rounded-xl cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                    on ? 'bg-[#F1EFEA]' : 'hover:bg-gray-50'
                  }`}
                >
                  <Avatar nombre={l?.name ?? titulo(c)} tono={sinLeer ? 'brand' : l ? 'soft' : 'neutral'} size={40} />
                  <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[15px] text-gray-900 truncate ${sinLeer ? 'font-bold' : 'font-semibold'}`}>{titulo(c)}</span>
                      {l?.calificacion && <PillInteres t={l.calificacion.temperatura} size="xs" />}
                      <span className="flex-1" />
                      <span className={`text-xs shrink-0 tabular-nums ${sinLeer ? 'font-semibold text-brand-700' : 'text-gray-500'}`}>{tiempoCorto(c.ultimo_mensaje_at)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`text-sm truncate flex-1 ${sinLeer ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{c.ultimo_mensaje ?? 'Sin mensajes'}</span>
                      {sinLeer && <span className="w-2 h-2 rounded-full bg-brand-700 shrink-0" aria-label="Sin leer" />}
                    </span>
                    <span className="flex gap-1.5 flex-wrap mt-1">
                      <Etiqueta className={on ? 'bg-white' : ''}>
                        {humano ? <User className="w-3.5 h-3.5" aria-hidden="true" /> : <Bot className="w-3.5 h-3.5" aria-hidden="true" />}
                        {humano ? (vendedorNombre?.trim() || 'Vendedor') : 'Bot'}
                      </Etiqueta>
                      {v && <Etiqueta className={on ? 'bg-white' : ''}>Visita {textoTurno(new Date(v.inicio)).split(' ').filter((_, i) => i !== 1).join(' ')}</Etiqueta>}
                      {c.avisado_at && !v && <Etiqueta className="bg-amber-50 text-amber-800"><Flame className="w-3 h-3" aria-hidden="true" />Avisado</Etiqueta>}
                      {pista && <Etiqueta className="bg-amber-50 text-amber-800 max-w-full"><TriangleAlert className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate">{pista}</span></Etiqueta>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Chat */}
      <section aria-label={conv ? `Chat con ${titulo(conv)}` : 'Chat'} className={`${conversacionId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col min-h-0 bg-[#F7F6F2]`}>
        {!conversacionId || !conv ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-600 p-6 text-center">
            {conversacionId && !detalleError ? 'Cargando chat...' : conversacionId ? 'No se encontró la conversación.' : 'Elegí una conversación de la lista.'}
          </div>
        ) : (
          <>
            <div className="bg-white border-b border-gray-200">
              <div className="px-3 sm:px-5 py-3 sm:py-4 flex items-center gap-3 flex-wrap">
                <button onClick={() => abrir(null)} className="md:hidden w-11 h-11 -ml-1 shrink-0 flex items-center justify-center rounded-[10px] text-gray-900 hover:bg-gray-100 cursor-pointer" aria-label="Volver a la lista">
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="m-0 text-base sm:text-lg font-semibold text-gray-900 truncate">{titulo(conv)}</h2>
                    {conv.contacto_nombre?.trim() && <span className="text-sm text-gray-600 tabular-nums">{numeroVisible(conv)}</span>}
                  </div>
                  <div className={`flex items-center gap-1.5 mt-0.5 text-[13px] font-medium ${modo?.humano ? 'text-gray-700' : 'text-brand-700'}`}>
                    {modo?.humano ? <User className="w-3.5 h-3.5" aria-hidden="true" /> : <PuntoVivo />}
                    {modo?.humano ? sinEmoji(modo.texto) : 'El bot está respondiendo'}
                  </div>
                  {aviso && (
                    <div className="flex items-center gap-1 text-[13px] text-amber-800 mt-0.5" role="status">
                      <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{aviso}</span>
                    </div>
                  )}
                </div>
                {modo?.accion === 'devolver' && (
                  <button onClick={() => cambiarModo('devolver')} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:border-gray-400 whitespace-nowrap cursor-pointer transition-colors">
                    <Bot className="w-4 h-4" aria-hidden="true" />Devolver al bot
                  </button>
                )}
                {modo?.accion === 'tomar' && (
                  <button onClick={() => cambiarModo('tomar')} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 sm:px-[18px] rounded-[10px] bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 whitespace-nowrap cursor-pointer transition-colors">
                    <Hand className="w-4 h-4" aria-hidden="true" />Tomar chat
                  </button>
                )}
              </div>
              {/* Celular y pantallas medianas: el lead en una franja (en grande va a la derecha). */}
              {lead && (
                <button type="button" onClick={() => irATab(`tab=tablero&lead=${lead.id}`)} className="xl:hidden w-full flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 text-left text-[13px] text-gray-900">
                  {lead.calificacion && <PillInteres t={lead.calificacion.temperatura} size="xs" />}
                  {lead.unit_name && <span>{lead.unit_name}</span>}
                  {visita && <><span className="text-gray-400" aria-hidden="true">·</span><span>Visita {textoTurno(new Date(visita.inicio)).split(' ').filter((_, i) => i !== 1).join(' ')}</span></>}
                  <span className="ml-auto flex items-center gap-0.5 font-semibold text-brand-700">Ficha<ChevronRight className="w-4 h-4" aria-hidden="true" /></span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 flex flex-col gap-3">
              {!detalle && (detalleError
                ? (
                  <div className="text-sm text-red-700" role="alert">
                    No se pudieron cargar los mensajes.{' '}
                    <button type="button" className="font-semibold underline underline-offset-2 cursor-pointer" onClick={() => { setDetalleError(false); cargarDetalle(conversacionId); }}>Reintentar</button>
                  </div>
                )
                : <div className="text-sm text-gray-600">Cargando mensajes...</div>)}
              {mensajes.map((m, i) => {
                const cuando = m.orden_at ?? m.enviado_at;
                const anterior = i > 0 ? (mensajes[i - 1].orden_at ?? mensajes[i - 1].enviado_at) : null;
                const nuevoDia = !!cuando && (!anterior || fechaAR(new Date(anterior)) !== fechaAR(new Date(cuando)));
                return (
                  <div key={m.id} className="flex flex-col gap-3">
                    {nuevoDia && (
                      <div className="self-center text-xs font-semibold text-gray-600 bg-[#EBE8E2] px-2.5 py-1 rounded-full first-letter:uppercase">{etiquetaDia(cuando!, ahora)}</div>
                    )}
                    {posAviso === i && separador}
                    <Burbuja m={m} vendedorNombre={vendedorNombre} onImgError={reintentarImagen} />
                  </div>
                );
              })}
              {posAviso !== null && posAviso >= mensajes.length && separador}
              {visita && detalle && (
                <button type="button" onClick={() => irATab('tab=visitas')} className="self-center inline-flex items-center gap-2 text-[13px] text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-400">
                  <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                  Visita {visita.estado === 'agendada' ? 'agendada' : 'confirmada'} · {textoTurno(new Date(visita.inicio))}
                </button>
              )}
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

            <div className="px-3 sm:px-5 pt-3.5 pb-4 bg-white border-t border-gray-200">
              {accionError && <div className="text-[13px] font-medium text-red-700 mb-2" role="alert">{accionError}</div>}
              <form className="flex gap-2.5" onSubmit={e => { e.preventDefault(); enviar(); }}>
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  maxLength={4000}
                  placeholder="Escribí como vendedor…"
                  aria-label="Mensaje"
                  className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl border border-gray-300 bg-white text-base sm:text-[15px] text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30 placeholder:text-gray-500"
                />
                <button type="submit" disabled={enviando || !texto.trim()} aria-label={enviando ? 'Enviando…' : 'Enviar'} className="w-12 h-12 shrink-0 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 cursor-pointer disabled:cursor-not-allowed">
                  <Send className="w-[18px] h-[18px]" aria-hidden="true" />
                </button>
              </form>
              {!modo?.humano && (
                <p className="m-0 mt-2 flex items-center gap-1.5 text-xs text-gray-600">
                  <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  Si escribís, el chat pasa a modo vendedor y el bot deja de responder.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {conv && conversacionId && (
        <DatosLead
          conv={conv}
          lead={lead}
          visita={visita}
          onConfirmar={confirmarVisita}
          onVerAgenda={() => irATab('tab=visitas')}
          onVerFicha={id => irATab(`tab=tablero&lead=${id}`)}
        />
      )}
    </div>
  );
}
