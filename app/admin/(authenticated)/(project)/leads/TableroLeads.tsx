'use client';

import { Fragment, useState, useEffect, useMemo, useRef, startTransition, createContext, useContext } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ArrowRight, CalendarDays, Check, ChevronRight, Mail, MessageCircle, Phone, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectRole } from '@/lib/project-role-context';
import { hasRole } from '@/lib/project-roles';
import type { Lead } from '@/types';
import type { WaVisita } from '@/types/whatsapp-bot';
import { textoTurno } from '@/lib/whatsapp-bot/visitas';
import { TEMPERATURA_LABEL, filasCalificacion } from '@/lib/whatsapp-bot/calificacion';
import { downloadCsv } from '@/lib/csv';
import { Card, btnSecondary } from '@/components/admin/panel-ui';
import { Avatar, ChipFiltro, Cifra, Contador, Etiqueta, PillInteres, hace } from './leads-ui';

// Unidades del proyecto, por código — para mostrar "6B · 2 dorm." y la
// ficha (estado, m², precio) de la unidad por la que preguntó cada lead.
// leads.unit_name guarda el código de la unidad tal como se ve en el sitio.
interface UnitInfo {
  id: string;
  code: string;
  floor_id: string;
  building_id: string | null;
  model_name: string | null;
  type: string | null;
  bedrooms: number | null;
  total_area: number | null;
  inner_area: number | null;
  price: number | null;
  currency: string | null;
  status: 'available' | 'reserved' | 'sold';
}
const UnitsContext = createContext<Map<string, UnitInfo>>(new Map());

function useLeadUnit(unitName: string | null | undefined): UnitInfo | undefined {
  const units = useContext(UnitsContext);
  if (!unitName) return undefined;
  const key = unitName.trim();
  return units.get(key) ?? units.get(key.replace(/^unidad\s+/i, ''));
}

function unitTypology(u: UnitInfo): string | null {
  if (u.bedrooms && u.bedrooms > 0) return `${u.bedrooms} dorm.`;
  return u.model_name || u.type || null;
}

const STATUS_PILL: Record<UnitInfo['status'], { label: string; cls: string }> = {
  available: { label: 'Disponible', cls: 'bg-brand-100 text-brand-800' },
  reserved: { label: 'Reservada', cls: 'bg-amber-100 text-amber-800' },
  sold: { label: 'Vendida', cls: 'bg-gray-900 text-white' },
};

const COLUMNS = [
  { id: 'nuevo', label: 'Nuevos', dot: '#37463F', next: 'Marcar como contactado' },
  { id: 'contactado', label: 'Contactados', dot: '#9DB3A5', next: 'Pasar a negociación' },
  { id: 'negociacion', label: 'En negociación', dot: '#E3B567', next: 'Marcar venta cerrada' },
  { id: 'cerrado', label: 'Venta cerrada', dot: '#17191A', next: '' },
] as const;


type Filtro = 'todos' | 'sin' | 'calientes' | '7d';
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'sin', label: 'Sin contactar' },
  { id: 'calientes', label: 'Calientes' },
  { id: '7d', label: 'Últimos 7 días' },
];

const METHOD_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', phone: 'Llamada', telefono: 'Llamada', form: 'Formulario', formulario: 'Formulario' };
// Orígenes conocidos con su nombre legible (el resto se muestra capitalizado).
const SOURCE_LABEL: Record<string, string> = { whatsapp_bot: 'Bot de WhatsApp', sitio: 'Sitio', web: 'Sitio' };

/** Origen en una sola etiqueta corta: "WhatsApp · Bot", "Formulario · Sitio". */
function origenCorto(lead: Lead): string | null {
  if (lead.source?.toLowerCase() === 'whatsapp_bot') return 'WhatsApp · Bot';
  const t = leadTags(lead);
  return t.length ? t.join(' · ') : null;
}

/** "ayer" o "hace 3 h": para frases. */
const haceFrase = (iso: string) => (hace(iso) === 'ayer' ? 'ayer' : `hace ${hace(iso)}`);

const estadoDe = (l: Lead) => l.status || 'nuevo';

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function leadTags(lead: Lead): string[] {
  const tags: string[] = [];
  if (lead.method) tags.push(METHOD_LABEL[lead.method.toLowerCase()] ?? lead.method);
  if (lead.source) {
    const s = SOURCE_LABEL[lead.source.toLowerCase()] ?? lead.source.charAt(0).toUpperCase() + lead.source.slice(1).replace(/_/g, ' ');
    if (!tags.includes(s)) tags.push(s);
  }
  return tags;
}

/** Próxima visita (no cancelada) de cada lead, por lead o por su chat de WhatsApp. */
type ProximaVisita = { visita: WaVisita; texto: string; porConfirmar: boolean };
const ProximasContext = createContext<(lead: Lead) => ProximaVisita | null>(() => null);

function textoVisita(v: WaVisita): string {
  const [dia, fecha, hora] = textoTurno(new Date(v.inicio)).split(' ');
  return `${dia} ${fecha} · ${hora}`;
}

function filtrar(leads: Lead[], filtro: Filtro, q: string): Lead[] {
  return leads.filter(l => {
    if (q && !`${l.name ?? ''} ${l.unit_name ?? ''} ${l.phone ?? ''} ${l.email ?? ''}`.toLowerCase().includes(q)) return false;
    if (filtro === 'sin') return estadoDe(l) === 'nuevo';
    if (filtro === 'calientes') return l.calificacion?.temperatura === 'caliente';
    if (filtro === '7d') return daysSince(l.created_at) <= 7;
    return true;
  });
}

/** Cuerpo de la tarjeta: nombre, unidad y etiquetas. Es la parte que se arrastra. */
function LeadCardBody({ lead }: { lead: Lead }) {
  const origen = origenCorto(lead);
  const unit = useLeadUnit(lead.unit_name);
  const typology = unit ? unitTypology(unit) : null;
  return (
    <>
      <span className="flex justify-between items-baseline gap-2">
        <span className="text-[15px] font-semibold text-gray-900 truncate">{lead.name ?? 'Sin nombre'}</span>
        <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">{hace(lead.created_at)}</span>
      </span>
      <span className="text-sm text-gray-700 truncate">{lead.unit_name ? `${unit?.code ?? lead.unit_name}${typology ? ` · ${typology}` : ''}` : 'Consulta general'}</span>
      {(origen || lead.calificacion) && (
        <span className="flex gap-1.5 flex-wrap">
          {lead.calificacion && <PillInteres t={lead.calificacion.temperatura} />}
          {origen && <Etiqueta>{origen}</Etiqueta>}
        </span>
      )}
    </>
  );
}

/**
 * Pie de la tarjeta (debajo de la línea punteada): la próxima visita y "Ver chat".
 * Va FUERA de la parte arrastrable: esa es un role="button" de dnd-kit y un
 * botón no puede vivir dentro de otro. `replica` es la versión inerte del DragOverlay.
 */
function LeadCardPie({ lead, onVerChat, replica }: { lead: Lead; onVerChat?: (id: string) => void; replica?: boolean }) {
  const proxima = useContext(ProximasContext)(lead);
  const conv = lead.wa_conversacion_id;
  if (!proxima && !conv) return null;
  return (
    <div className="mx-3.5 py-2.5 border-t border-dashed border-gray-200 flex items-center gap-2 text-[13px] text-gray-700">
      <CalendarDays className="w-4 h-4 shrink-0 text-gray-500" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">
        {proxima
          ? <span title={proxima.porConfirmar ? 'Visita por confirmar' : 'Visita confirmada'}><span className="sr-only">Visita </span><span className="inline-block first-letter:uppercase">{proxima.texto}</span>{proxima.porConfirmar && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" aria-hidden="true" />}</span>
          : <span className="text-gray-500">Sin visita</span>}
      </span>
      {conv && (replica
        ? <span aria-hidden="true" className="text-xs font-semibold text-brand-700">Ver chat</span>
        : (
          <button type="button" onClick={() => onVerChat?.(conv)} className="min-h-[28px] px-1 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline" title="Ver la conversación de WhatsApp">
            Ver chat
          </button>
        ))}
    </div>
  );
}

const CARD_CLASS = 'bg-white rounded-xl flex flex-col transition-shadow';

function DraggableLeadCard({ lead, selected, onSelect, onVerChat }: { lead: Lead; selected: boolean; onSelect: () => void; onVerChat: (conversacionId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  // dnd-kit mide el bloque entero (para que el DragOverlay tenga el mismo alto),
  // pero se arrastra y se abre solo desde el cuerpo.
  return (
    <div
      ref={setNodeRef}
      className={`${CARD_CLASS} ${selected ? 'border-[1.5px] border-gray-900 shadow-[0_0_0_3px_rgba(55,70,63,0.14)]' : 'border border-gray-200 shadow-[0_1px_2px_rgba(23,25,26,0.04)] hover:shadow-[0_4px_14px_rgba(23,25,26,.10)]'}`}
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={onSelect}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
        aria-pressed={selected}
        aria-label={`${lead.name ?? 'Sin nombre'}${lead.unit_name ? `, ${lead.unit_name}` : ''}`}
        className="px-3.5 pt-3.5 pb-3 flex flex-col gap-2 text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        <LeadCardBody lead={lead} />
      </div>
      <LeadCardPie lead={lead} onVerChat={onVerChat} />
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="flex-1 flex flex-col gap-2.5 rounded-xl min-h-[80px]"
      style={{
        background: isOver ? 'rgba(23,25,26,.05)' : undefined,
        outline: isOver ? '2px dashed rgba(23,25,26,.18)' : '2px solid transparent',
        outlineOffset: -2,
        transition: 'background .15s, outline-color .15s',
      }}
    >
      {children}
    </div>
  );
}

/** Celular: tarjeta de un lead sin contactar, con sus atajos (Ver chat, Llamar, Contactado). */
function TarjetaMovil({ lead, onAbrir, onVerChat, onContactado }: { lead: Lead; onAbrir: () => void; onVerChat: (id: string) => void; onContactado: () => void }) {
  const proxima = useContext(ProximasContext)(lead);
  const unit = useLeadUnit(lead.unit_name);
  const tags = leadTags(lead);
  const btn = 'min-h-[44px] rounded-[10px] border border-gray-300 bg-white text-sm font-medium text-gray-900 flex items-center justify-center gap-1.5';
  return (
    <article className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button type="button" onClick={onAbrir} className="w-full text-left flex items-center gap-3 p-3.5">
        <Avatar nombre={lead.name} size={44} />
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-base font-semibold text-gray-900 truncate">{lead.name ?? 'Sin nombre'}</span>
          <span className="text-[13px] text-gray-600 truncate">
            {[unit?.code ?? lead.unit_name ?? 'Consulta general', haceFrase(lead.created_at), tags[0]].filter(Boolean).join(' · ')}
          </span>
        </span>
        {lead.calificacion && <PillInteres t={lead.calificacion.temperatura} />}
      </button>
      {proxima && (
        <div className="mx-3.5 mb-3 flex items-center gap-2 rounded-[10px] bg-gray-100 px-3 py-2 text-[13px] text-gray-900">
          <CalendarDays className="w-4 h-4 shrink-0 text-gray-600" aria-hidden="true" />
          <span className="flex-1 min-w-0 truncate">Visita <b className="font-semibold">{proxima.texto}</b></span>
          {proxima.porConfirmar && <span className="text-xs font-semibold text-amber-800">Por confirmar</span>}
        </div>
      )}
      <div className="grid grid-cols-[1fr_44px_1fr] gap-2 px-3.5 pb-3.5">
        {lead.wa_conversacion_id
          ? <button type="button" onClick={() => onVerChat(lead.wa_conversacion_id!)} className={btn}><MessageCircle className="w-4 h-4" aria-hidden="true" />Ver chat</button>
          : <span />}
        {lead.phone
          ? <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} aria-label={`Llamar a ${lead.name ?? 'este lead'}`} className={btn}><Phone className="w-4 h-4" aria-hidden="true" /></a>
          : <span />}
        <button type="button" onClick={onContactado} className={`${btn} border-gray-900`}><Check className="w-4 h-4" aria-hidden="true" />Contactado</button>
      </div>
    </article>
  );
}

export default function TableroLeads() {
  const activeProjectId = useActiveProjectId();
  // Leads es de gestor para arriba (la API responde 401 por debajo). La guarda
  // vive acá, en el cliente, y no en un layout que lea la cookie: el rol sale
  // del contexto de ESTA pestaña, que coincide con su proyecto.
  const router = useRouter();
  const searchParams = useSearchParams();
  const canSeeLeads = hasRole(useProjectRole(), 'gestor');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('lead'));
  const [query, setQuery] = useState('');
  const [unitsByCode, setUnitsByCode] = useState<Map<string, UnitInfo>>(() => new Map());
  const [visitas, setVisitas] = useState<WaVisita[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());

  // Las unidades y las visitas son un extra (tipología, próxima visita): si
  // fallan, los leads se ven igual.
  useEffect(() => {
    if (!canSeeLeads) return;
    fetch(withActiveProject('/api/admin/units', activeProjectId))
      .then(res => (res.ok ? res.json() : []))
      .then((list: UnitInfo[]) => {
        if (Array.isArray(list)) setUnitsByCode(new Map(list.map(u => [u.code, u])));
      })
      .catch(() => {});
    fetch(withActiveProject('/api/admin/whatsapp-bot/visitas', activeProjectId))
      .then(res => (res.ok ? res.json() : null))
      .then((d: { visitas?: WaVisita[] } | null) => {
        if (Array.isArray(d?.visitas)) {
          setVisitas(d.visitas);
          setAhora(Date.now());
        }
      })
      .catch(() => {});
  }, [activeProjectId, canSeeLeads]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const fetchLeads = () => {
    startTransition(() => {
      setLoading(true);
      setError(false);
    });
    fetch(withActiveProject('/api/admin/leads', activeProjectId))
      .then(res => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then(data => {
        setLeads(data);
        setLoading(false);
      })
      .catch(error => {
        console.error(error);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!canSeeLeads) {
      router.replace('/admin');
      return;
    }
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, canSeeLeads]);

  // La ficha se cierra con Escape.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const proximaDe = useMemo(() => {
    const proximas = visitas
      .filter(v => v.estado !== 'cancelada' && new Date(v.fin).getTime() >= ahora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    return (lead: Lead): ProximaVisita | null => {
      const v = proximas.find(x => (x.lead_id && x.lead_id === lead.id) || (x.conversacion_id && x.conversacion_id === lead.wa_conversacion_id));
      return v ? { visita: v, texto: textoVisita(v), porConfirmar: v.estado === 'agendada' } : null;
    };
  }, [visitas, ahora]);

  const handleWhatsApp = (lead: Lead) => {
    // Si vino del bot, se sigue la charla en Conversaciones; si no, wa.me.
    if (lead.wa_conversacion_id) return handleVerChat(lead.wa_conversacion_id);
    if (!lead.phone) return;
    const text = encodeURIComponent(`Hola ${lead.name ?? ''}, te escribo por tu consulta sobre el proyecto...`);
    window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
  };

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } catch (error) {
      console.error(error);
    }
  };

  // "Ver chat": pasa a la pestaña Conversaciones con ese chat abierto.
  function handleVerChat(conversacionId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'conversaciones');
    next.set('c', conversacionId);
    next.delete('lead');
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const lead = leads.find(l => l.id === active.id);
    if (!lead) return;
    const newStatus = String(over.id);
    if (estadoDe(lead) !== newStatus) {
      updateLeadStatus(lead.id, newStatus);
    }
  };

  if (!canSeeLeads) return null;
  if (loading) return <LoadingSpinner text="Cargando leads..." tone="light" />;
  if (error) return <ErrorState message="No se pudieron cargar los leads." onRetry={fetchLeads} />;

  const q = query.trim().toLowerCase();
  const visibleLeads = filtrar(leads, filtro, q);
  const sinContactar = leads.filter(l => estadoDe(l) === 'nuevo');
  const masVieja = sinContactar.reduce<string | null>((min, l) => (!min || l.created_at < min ? l.created_at : min), null);
  const calientes = leads.filter(l => l.calificacion?.temperatura === 'caliente').length;
  const proximasVisitas = visitas.filter(v => v.estado !== 'cancelada' && new Date(v.fin).getTime() >= ahora);
  const conChat = leads.filter(l => l.wa_conversacion_id).length;

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;
  const selected = selectedId ? leads.find(l => l.id === selectedId) ?? null : null;
  const sorted = [...visibleLeads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const exportCsv = () => {
    downloadCsv('leads.csv', [
      ['Nombre', 'Email', 'Teléfono', 'Unidad', 'Medio', 'Origen', 'Estado', 'Interés', 'Mensaje', 'Fecha'],
      ...leads.map(l => [l.name ?? '', l.email ?? '', l.phone ?? '', l.unit_name ?? '', l.method ?? '', l.source ?? '', COLUMNS.find(c => c.id === estadoDe(l))?.label ?? l.status, l.calificacion ? TEMPERATURA_LABEL[l.calificacion.temperatura] : '', l.message ?? '', new Date(l.created_at).toLocaleString('es-AR')]),
    ]);
  };

  const diasVisitas = [...new Set(proximasVisitas.slice().sort((a, b) => a.inicio.localeCompare(b.inicio)).map(v => textoTurno(new Date(v.inicio)).split(' ').slice(0, 2).join(' ')))];

  return (
    <UnitsContext.Provider value={unitsByCode}>
    <ProximasContext.Provider value={proximaDe}>
    <div className="flex flex-col gap-6">
      {leads.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cifra label="Consultas" valor={leads.length} detalle={conChat > 0 ? `${conChat} por WhatsApp` : 'Del sitio'} />
          <Cifra tono="brand" label="Sin contactar" valor={sinContactar.length} detalle={masVieja ? `La más vieja llegó ${haceFrase(masVieja)}` : 'Al día'} />
          <Cifra label="Calientes" valor={calientes} detalle="Según el bot" />
          <Cifra label="Visitas próximas" valor={proximasVisitas.length} detalle={diasVisitas.length ? diasVisitas.slice(0, 2).join(' y ') : 'Ninguna agendada'} />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 bg-white w-full sm:w-[300px] focus-within:border-brand-700">
          <Search className="w-4 h-4 shrink-0 text-gray-500" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o unidad" aria-label="Buscar por nombre o unidad"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-500" />
        </label>
        {leads.length > 0 && (
          <div role="group" aria-label="Filtrar leads" className="flex gap-1.5 overflow-x-auto max-w-full -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
            {FILTROS.map(f => (
              <ChipFiltro key={f.id} activo={filtro === f.id} onClick={() => setFiltro(f.id)} cantidad={filtrar(leads, f.id, q).length}>{f.label}</ChipFiltro>
            ))}
          </div>
        )}
        {leads.length > 0 && <button type="button" onClick={exportCsv} className={`${btnSecondary} max-sm:hidden sm:ml-auto`}>Exportar CSV</button>}
      </div>

      {leads.length === 0 ? (
        <Card className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Todavía no hay leads.</h2>
          <p className="m-0 text-sm text-gray-600">Van a aparecer acá apenas alguien complete el formulario de contacto en el sitio o el bot de WhatsApp avise de un interesado.</p>
        </Card>
      ) : (
        <>
          {/* Escritorio: tablero por etapa, con arrastrar y soltar. */}
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="hidden md:block overflow-x-auto pb-2 -mx-1 px-1">
              <div className="grid gap-3.5 items-start" style={{ gridTemplateColumns: 'repeat(4, minmax(232px, 1fr))', minWidth: 976 }}>
                {COLUMNS.map((column, ci) => {
                  const columnLeads = visibleLeads.filter(l => estadoDe(l) === column.id);
                  return (
                    <section key={column.id} aria-label={column.label} className="flex flex-col gap-2.5 rounded-2xl p-3 bg-[#ECE9E3] min-h-[440px]">
                      <div className="flex items-center gap-2 px-1.5 pt-1.5 pb-1">
                        <span className="w-[9px] h-[9px] rounded-full" style={{ background: column.dot }} aria-hidden="true" />
                        <h2 className="m-0 flex-1 text-[15px] font-semibold text-gray-900">{column.label}</h2>
                        <Contador tono="white">{columnLeads.length}</Contador>
                      </div>
                      <DroppableColumn id={column.id}>
                        {columnLeads.map(lead => (
                          <DraggableLeadCard key={lead.id} lead={lead} selected={selected?.id === lead.id} onSelect={() => setSelectedId(lead.id)} onVerChat={handleVerChat} />
                        ))}
                        {columnLeads.length === 0 && (
                          <div className="rounded-xl px-3 py-5 text-center text-[13px] leading-relaxed text-gray-500 border-[1.5px] border-dashed border-gray-300">
                            {ci === 0 ? 'Los leads nuevos entran acá.' : 'Arrastrá una tarjeta hasta acá.'}
                          </div>
                        )}
                      </DroppableColumn>
                    </section>
                  );
                })}
              </div>
            </div>

            <DragOverlay>
              {activeLead ? (
                <div style={{ width: 232 }} className={`${CARD_CLASS} border border-gray-200 shadow-[0_14px_30px_rgba(23,25,26,.22)] cursor-grabbing`}>
                  <div className="px-3.5 pt-3.5 pb-3 flex flex-col gap-2"><LeadCardBody lead={activeLead} /></div>
                  <LeadCardPie lead={activeLead} replica />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Celular: primero los que esperan respuesta, después el resto. */}
          <div className="md:hidden flex flex-col gap-6">
            {(() => {
              const nuevos = sorted.filter(l => estadoDe(l) === 'nuevo');
              const resto = sorted.filter(l => estadoDe(l) !== 'nuevo');
              return (
                <>
                  {nuevos.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <div className="flex items-baseline gap-2 px-1">
                        <h2 className="m-0 text-base font-semibold text-gray-900">Sin contactar</h2>
                        <span className="text-[13px] text-gray-600">{nuevos.length} · respondé primero</span>
                      </div>
                      {nuevos.map(l => (
                        <TarjetaMovil key={l.id} lead={l} onAbrir={() => setSelectedId(l.id)} onVerChat={handleVerChat} onContactado={() => updateLeadStatus(l.id, 'contactado')} />
                      ))}
                    </section>
                  )}
                  {resto.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <div className="flex items-baseline gap-2 px-1">
                        <h2 className="m-0 text-base font-semibold text-gray-900">En seguimiento</h2>
                        <span className="text-[13px] text-gray-600">{resto.length}</span>
                      </div>
                      <ul className="m-0 p-0 list-none rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
                        {resto.map(l => {
                          const col = COLUMNS.find(c => c.id === estadoDe(l)) ?? COLUMNS[0];
                          return (
                            <li key={l.id}>
                              <button type="button" onClick={() => setSelectedId(l.id)} className="w-full text-left flex items-center gap-3 px-3.5 py-3 min-h-[64px]">
                                <Avatar nombre={l.name} tono="neutral" size={40} />
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                  <span className="text-[15px] font-semibold text-gray-900 truncate">{l.name ?? 'Sin nombre'}</span>
                                  <span className="flex items-center gap-1.5 text-[13px] text-gray-600 truncate">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.dot }} aria-hidden="true" />
                                    {col.label}{l.unit_name ? ` · ${l.unit_name}` : ''}
                                  </span>
                                </span>
                                <span className="text-xs text-gray-500 shrink-0">{hace(l.created_at)}</span>
                                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                  {sorted.length === 0 && <p className="m-0 text-[13px] text-gray-600 px-1">No hay leads que coincidan.</p>}
                </>
              );
            })()}
          </div>
        </>
      )}

      {selected && (
        <LeadDetail
          lead={selected}
          proxima={proximaDe(selected)}
          onClose={() => setSelectedId(null)}
          onWhatsApp={() => handleWhatsApp(selected)}
          onMove={status => updateLeadStatus(selected.id, status)}
          onVerVisitas={() => router.replace('?tab=visitas', { scroll: false })}
        />
      )}
    </div>
    </ProximasContext.Provider>
    </UnitsContext.Provider>
  );
}

/** Ficha del lead elegido: panel a la derecha (en el celular, pantalla completa con acciones abajo). */
function LeadDetail({ lead, proxima, onClose, onWhatsApp, onMove, onVerVisitas }: {
  lead: Lead;
  proxima: ProximaVisita | null;
  onClose: () => void;
  onWhatsApp: () => void;
  onMove: (status: string) => void;
  onVerVisitas: () => void;
}) {
  const ci = Math.max(0, COLUMNS.findIndex(c => c.id === estadoDe(lead)));
  const column = COLUMNS[ci];
  const unit = useLeadUnit(lead.unit_name);
  const typology = unit ? unitTypology(unit) : null;
  const area = unit ? (unit.total_area ?? unit.inner_area) : null;
  const unitHref = unit?.building_id ? `/admin/edificios/${unit.building_id}/pisos/${unit.floor_id}/unidades/${unit.id}` : '/admin/inventory';
  const contactBtn = 'min-h-[44px] px-3 rounded-[10px] text-sm flex items-center justify-center gap-2';
  const tags = leadTags(lead);
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cerrarRef.current?.focus();
  }, [lead.id]);

  return (
    <aside
      aria-label="Ficha del lead"
      className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-50 w-full sm:w-[420px] bg-white sm:border-l border-gray-200 shadow-[-24px_0_48px_rgba(23,25,26,0.10)] overflow-y-auto flex flex-col"
    >
      <div className="flex-1 flex flex-col gap-6 px-5 sm:px-7 pt-5 sm:pt-6 pb-28 sm:pb-8">
        <div className="flex items-start gap-3.5">
          <Avatar nombre={lead.name} size={52} />
          <div className="flex-1 min-w-0">
            <h2 className="m-0 font-display text-2xl leading-tight font-semibold tracking-[-0.02em] text-gray-900 break-words">{lead.name ?? 'Sin nombre'}</h2>
            <div className="text-sm text-gray-600 mt-1">Llegó {haceFrase(lead.created_at)}{lead.unit_name ? ` · desde la ficha de ${lead.unit_name}` : tags[0] ? ` · ${tags[0]}` : ''}</div>
          </div>
          <button ref={cerrarRef} type="button" onClick={onClose} aria-label="Cerrar ficha" className="w-10 h-10 shrink-0 rounded-[10px] border border-gray-200 bg-white flex items-center justify-center text-gray-900 hover:border-gray-400">
            <X className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>

        {/* Contacto: arriba en la computadora, fijo abajo en el celular. */}
        <div className="fixed sm:static left-0 right-0 bottom-0 z-10 bg-white border-t sm:border-0 border-gray-200 px-4 pt-3 pb-5 sm:p-0 grid grid-cols-[1fr_auto_auto] sm:grid-cols-3 gap-2">
          {(lead.phone || lead.wa_conversacion_id)
            ? <button type="button" onClick={onWhatsApp} className={`${contactBtn} bg-brand-700 text-white font-semibold hover:bg-brand-800`}><MessageCircle className="w-[18px] h-[18px]" aria-hidden="true" />WhatsApp</button>
            : <span className="hidden sm:block" />}
          {lead.phone
            ? <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} aria-label="Llamar" className={`${contactBtn} min-w-[48px] border border-gray-300 bg-white text-gray-900 font-medium hover:border-gray-400`}><Phone className="w-[18px] h-[18px]" aria-hidden="true" /><span className="hidden sm:inline">Llamar</span></a>
            : <span className="hidden sm:block" />}
          {lead.email
            ? <a href={`mailto:${lead.email}`} aria-label="Email" className={`${contactBtn} min-w-[48px] border border-gray-300 bg-white text-gray-900 font-medium hover:border-gray-400`}><Mail className="w-[18px] h-[18px]" aria-hidden="true" /><span className="hidden sm:inline">Email</span></a>
            : <span className="hidden sm:block" />}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center gap-3">
            <h3 className="m-0 text-sm font-semibold text-gray-900">Etapa</h3>
            {lead.calificacion && <PillInteres t={lead.calificacion.temperatura} />}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {COLUMNS.map((c, i) => (
              <div key={c.id} className="flex flex-col gap-1.5 min-w-0">
                <span aria-hidden="true" className={`block h-1.5 rounded-full ${i <= ci ? 'bg-brand-700' : 'bg-gray-200'}`} />
                <span className={`text-xs leading-tight ${i === ci ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{c.label}</span>
              </div>
            ))}
          </div>
          {column.next && (
            <button type="button" onClick={() => onMove(COLUMNS[ci + 1].id)} className="min-h-[44px] rounded-[10px] border border-gray-900 bg-white text-sm font-semibold text-gray-900 flex items-center justify-center gap-2 hover:bg-gray-50">
              {column.next}<ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {ci > 0 && (
            <button type="button" onClick={() => onMove(COLUMNS[ci - 1].id)} className="self-start min-h-[32px] text-[13px] text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">
              Volver a {COLUMNS[ci - 1].label.toLowerCase()}
            </button>
          )}
        </div>

        {proxima && (
          <button type="button" onClick={onVerVisitas} className="flex gap-3 items-center rounded-xl bg-gray-100 px-4 py-3.5 text-left hover:bg-[#ECE9E3]">
            <span className="w-10 h-10 rounded-[10px] bg-white flex items-center justify-center text-brand-700 shrink-0"><CalendarDays className="w-5 h-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-gray-600">{proxima.porConfirmar ? 'Visita · por confirmar' : 'Visita confirmada'}</span>
              <span className="block text-[15px] font-semibold text-gray-900 mt-0.5 first-letter:uppercase">{proxima.texto}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
          </button>
        )}

        {(lead.unit_name || lead.message) && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            {lead.unit_name && (
              <div className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold text-gray-900">Unidad {unit?.code ?? lead.unit_name}{typology ? ` · ${typology}` : ''}</span>
                  <Link href={unitHref} className="shrink-0 text-sm font-medium text-gray-900 underline underline-offset-2">Abrir</Link>
                </div>
                {unit && (
                  <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-[13px] text-gray-600">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[unit.status].cls}`}>{STATUS_PILL[unit.status].label}</span>
                    {area ? <span>{Math.round(area)} m²</span> : null}
                    {unit.price ? <span className="font-semibold text-gray-900">{unit.currency ?? 'USD'} {new Intl.NumberFormat('es-AR').format(unit.price)}</span> : null}
                  </div>
                )}
              </div>
            )}
            {lead.message && (
              <p className={`m-0 px-4 py-3 text-sm leading-relaxed text-gray-700 ${lead.unit_name ? 'border-t border-gray-100' : ''}`}>“{lead.message}”</p>
            )}
          </div>
        )}

        {lead.calificacion && (
          <div className="flex flex-col gap-2.5">
            <h3 className="m-0 text-sm font-semibold text-gray-900">Lo que contó por WhatsApp</h3>
            <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
              {filasCalificacion(lead.calificacion).filter(([k]) => k !== 'Interés').map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="text-gray-600">{k}</dt>
                  <dd className="m-0 font-medium text-gray-900 first-letter:uppercase">{v}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        )}

        <div className="flex flex-col gap-2.5 pt-5 border-t border-gray-100">
          <h3 className="m-0 text-sm font-semibold text-gray-900">Contacto</h3>
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
            {lead.phone && <><dt className="text-gray-600">Teléfono</dt><dd className="m-0 text-gray-900 truncate tabular-nums">{lead.phone}</dd></>}
            {lead.email && <><dt className="text-gray-600">Email</dt><dd className="m-0 text-gray-900 truncate">{lead.email}</dd></>}
            {tags.length > 0 && <><dt className="text-gray-600">Origen</dt><dd className="m-0 text-gray-900">{tags.join(' · ')}</dd></>}
            <dt className="text-gray-600">Fecha</dt><dd className="m-0 text-gray-900">{new Date(lead.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd>
          </dl>
        </div>
      </div>
    </aside>
  );
}
