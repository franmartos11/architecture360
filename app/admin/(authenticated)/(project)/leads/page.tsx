'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect, startTransition, createContext, useContext } from 'react';
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
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { PageSkeleton, Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import type { Lead } from '@/types';
import { downloadCsv } from '@/lib/csv';
import { PageHeader, Card, SegmentedTabs, btnSecondary } from '@/components/admin/panel-ui';

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

const LEAD_FILTERS = ['Todos', 'Sin contactar', 'Últimos 7 días'] as const;

const METHOD_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', phone: 'Llamada', telefono: 'Llamada', form: 'Formulario', formulario: 'Formulario' };
const AVATAR_TONES = ['#37463F', '#8A6A3A', '#4E5A6B', '#6B4E5A', '#55544F'];

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

/** "12 min", "3 h", "ayer", "4 d", "2 sem" — como las tarjetas del diseño. */
function ago(dateStr: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `${d} d`;
  return `${Math.floor(d / 7)} sem`;
}

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function leadTags(lead: Lead): string[] {
  const tags: string[] = [];
  if (lead.method) tags.push(METHOD_LABEL[lead.method.toLowerCase()] ?? lead.method);
  if (lead.source && !tags.includes(lead.source)) tags.push(lead.source.charAt(0).toUpperCase() + lead.source.slice(1));
  return tags;
}

function LeadCard({
  lead,
  selected,
  onSelect,
  dragRef,
  dragAttributes,
  dragListeners,
  isDragging,
  isOverlay,
}: {
  lead: Lead;
  selected?: boolean;
  onSelect?: () => void;
  dragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  isDragging?: boolean;
  isOverlay?: boolean;
}) {
  const draggable = Boolean(dragListeners);
  const tags = leadTags(lead);
  const unit = useLeadUnit(lead.unit_name);
  const typology = unit ? unitTypology(unit) : null;
  return (
    <div
      ref={dragRef}
      {...dragAttributes}
      {...dragListeners}
      onClick={onSelect}
      onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); } }}
      aria-pressed={selected}
      aria-label={`${lead.name ?? 'Sin nombre'}${lead.unit_name ? `, ${lead.unit_name}` : ''}`}
      className={`bg-white rounded-[10px] px-3 py-3 flex flex-col gap-1.5 text-left transition-shadow ${
        selected ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:shadow-[0_4px_14px_rgba(23,25,26,.10)]'
      }`}
      style={{
        opacity: isDragging ? 0.35 : 1,
        boxShadow: isOverlay ? '0 14px 30px rgba(23,25,26,.22)' : undefined,
        cursor: isOverlay ? 'grabbing' : draggable ? 'grab' : 'pointer',
        touchAction: draggable ? 'none' : undefined,
      }}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-sm font-semibold text-gray-900 truncate">{lead.name ?? 'Sin nombre'}</span>
        <span className="text-[11px] text-gray-500 shrink-0">{ago(lead.created_at)}</span>
      </div>
      <span className="text-xs text-gray-600 truncate">{lead.unit_name ? `${unit?.code ?? lead.unit_name}${typology ? ` · ${typology}` : ''}` : 'Consulta general'}</span>
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(t => <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700">{t}</span>)}
        </div>
      )}
    </div>
  );
}

function DraggableLeadCard({ lead, selected, onSelect }: { lead: Lead; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <LeadCard
      lead={lead}
      selected={selected}
      onSelect={onSelect}
      dragRef={setNodeRef}
      dragAttributes={attributes}
      dragListeners={listeners}
      isDragging={isDragging}
    />
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="flex-1 flex flex-col gap-2 rounded-lg min-h-[80px]"
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

export default function AdminLeads() {
  const contentIn = useContentIn();
  const activeProjectId = useActiveProjectId();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<typeof LEAD_FILTERS[number]>('Todos');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [unitsByCode, setUnitsByCode] = useState<Map<string, UnitInfo>>(() => new Map());

  // Las unidades son un extra (tipología, estado, m², precio): si fallan,
  // los leads se ven igual con el código que dejaron.
  useEffect(() => {
    fetch(withActiveProject('/api/admin/units', activeProjectId))
      .then(res => (res.ok ? res.json() : []))
      .then((list: UnitInfo[]) => {
        if (Array.isArray(list)) setUnitsByCode(new Map(list.map(u => [u.code, u])));
      })
      .catch(() => {});
  }, [activeProjectId]);

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
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const handleWhatsApp = (phone: string | null, name: string | null) => {
    if (!phone) return;
    const text = encodeURIComponent(`Hola ${name ?? ''}, te escribo por tu consulta sobre el proyecto...`);
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
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
    if ((lead.status || 'nuevo') !== newStatus) {
      updateLeadStatus(lead.id, newStatus);
    }
  };

  if (loading) return (
    <PageSkeleton actions={2}>
      <Skeleton className="h-11 w-[320px] max-w-full rounded-[10px]" />
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5 rounded-2xl p-2.5 bg-[#EFECE6] min-h-[320px]">
            <Skeleton className="h-4 w-24 m-1.5" />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
  if (error) return <ErrorState message="No se pudieron cargar los leads." onRetry={fetchLeads} />;

  const newLeadsCount = leads.filter(l => (l.status || 'nuevo') === 'nuevo').length;
  const q = query.trim().toLowerCase();
  const visibleLeads = leads.filter(l => {
    if (q && !`${l.name ?? ''} ${l.unit_name ?? ''} ${l.phone ?? ''} ${l.email ?? ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'Sin contactar') return (l.status || 'nuevo') === 'nuevo';
    if (filter === 'Últimos 7 días') return daysSince(l.created_at) <= 7;
    return true;
  });

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;
  const sorted = [...visibleLeads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const selected = leads.find(l => l.id === selectedId) ?? sorted[0] ?? null;

  const exportCsv = () => {
    downloadCsv('leads.csv', [
      ['Nombre', 'Email', 'Teléfono', 'Unidad', 'Medio', 'Origen', 'Estado', 'Mensaje', 'Fecha'],
      ...leads.map(l => [l.name ?? '', l.email ?? '', l.phone ?? '', l.unit_name ?? '', l.method ?? '', l.source ?? '', COLUMNS.find(c => c.id === (l.status || 'nuevo'))?.label ?? l.status, l.message ?? '', new Date(l.created_at).toLocaleString('es-AR')]),
    ]);
  };

  return (
    <UnitsContext.Provider value={unitsByCode}>
    <m.div {...contentIn} className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operación"
        title="Leads"
        description={<>{leads.length} consulta{leads.length === 1 ? '' : 's'} · <b className="font-semibold text-gray-900">{newLeadsCount} sin contactar</b> · el CRM se llena con el formulario del sitio</>}
        actions={
          <>
            <label className="flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-[10px] border border-gray-200 bg-white w-full sm:w-[244px] focus-within:border-brand-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B6A65" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o unidad" aria-label="Buscar por nombre o unidad"
                className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500" />
            </label>
            {leads.length > 0 && <button type="button" onClick={exportCsv} className={btnSecondary}>Exportar CSV</button>}
          </>
        }
      />

      {leads.length > 0 && (
        <div className="self-start max-w-full overflow-x-auto"><SegmentedTabs label="Filtrar leads" value={filter} onChange={setFilter} options={LEAD_FILTERS.map(f => ({ value: f, label: f }))} /></div>
      )}

      {leads.length === 0 ? (
        <Card className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Todavía no hay leads.</h2>
          <p className="m-0 text-sm text-gray-600">Van a aparecer acá apenas alguien complete el formulario de contacto en el sitio.</p>
        </Card>
      ) : (
      <div className="flex gap-5 flex-wrap items-start">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-[999_1_520px] min-w-0 overflow-x-auto pb-2 -mx-1 px-1">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(208px, 1fr))', minWidth: 872 }}>
              {COLUMNS.map((column, ci) => {
                const columnLeads = visibleLeads.filter(l => (l.status || 'nuevo') === column.id);
                return (
                  <div key={column.id} className="flex flex-col gap-2.5 rounded-2xl p-2.5 bg-[#EFECE6] min-h-[320px]">
                    <div className="flex items-center gap-2 px-1.5 pt-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: column.dot }} aria-hidden="true" />
                      <span className="flex-1 text-[13px] font-semibold text-gray-900">{column.label}</span>
                      <span className="text-xs text-gray-600">{columnLeads.length}</span>
                    </div>
                    <DroppableColumn id={column.id}>
                      {columnLeads.map(lead => (
                        <DraggableLeadCard key={lead.id} lead={lead} selected={selected?.id === lead.id} onSelect={() => setSelectedId(lead.id)} />
                      ))}
                      {columnLeads.length === 0 && (
                        <div className="rounded-[10px] px-3 py-4 text-center text-[11px] leading-relaxed text-gray-500 border-[1.5px] border-dashed border-gray-300">
                          {ci === 0 ? 'Los leads del formulario del sitio entran acá.' : 'Arrastrá una tarjeta hasta acá.'}
                        </div>
                      )}
                    </DroppableColumn>
                  </div>
                );
              })}
            </div>
          </div>

          <DragOverlay>
            {activeLead ? (
              <div style={{ width: 208 }}>
                <LeadCard lead={activeLead} isOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {selected && (
          <LeadDetail
            lead={selected}
            onWhatsApp={handleWhatsApp}
            onMove={status => updateLeadStatus(selected.id, status)}
            tone={AVATAR_TONES[Math.max(0, leads.indexOf(selected)) % AVATAR_TONES.length]}
          />
        )}
      </div>
      )}
    </m.div>
    </UnitsContext.Provider>
  );
}

/** Panel del lead elegido (diseño): contacto, etapa con atajo a la siguiente, unidad y mensaje. */
function LeadDetail({ lead, onWhatsApp, onMove, tone }: {
  lead: Lead;
  onWhatsApp: (phone: string | null, name: string | null) => void;
  onMove: (status: string) => void;
  tone: string;
}) {
  const ci = Math.max(0, COLUMNS.findIndex(c => c.id === (lead.status || 'nuevo')));
  const column = COLUMNS[ci];
  const unit = useLeadUnit(lead.unit_name);
  const typology = unit ? unitTypology(unit) : null;
  const area = unit ? (unit.total_area ?? unit.inner_area) : null;
  const unitHref = unit?.building_id ? `/admin/edificios/${unit.building_id}/pisos/${unit.floor_id}/unidades/${unit.id}` : '/admin/inventory';
  const contactBtn = 'flex-1 min-h-[44px] px-3 rounded-[10px] text-[13px] font-semibold flex items-center justify-center';
  return (
    <aside aria-label="Detalle del lead" className="flex-[1_1_300px] lg:max-w-[340px] min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col gap-5 lg:sticky lg:top-6">
      <div className="flex items-center gap-3.5">
        <span aria-hidden="true" className="w-[52px] h-[52px] rounded-full shrink-0 text-white text-base font-semibold flex items-center justify-center" style={{ background: tone }}>{initials(lead.name)}</span>
        <div className="min-w-0 flex flex-col">
          <span className="font-display text-[22px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 truncate">{lead.name ?? 'Sin nombre'}</span>
          <span className="text-xs text-gray-600">Llegó hace {ago(lead.created_at)}{lead.unit_name ? ` · desde la ficha de ${lead.unit_name}` : ''}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {lead.phone && <button type="button" onClick={() => onWhatsApp(lead.phone, lead.name)} className={`${contactBtn} bg-brand-700 text-white hover:bg-brand-800`}>WhatsApp</button>}
        {lead.email && <a href={`mailto:${lead.email}`} className={`${contactBtn} border border-gray-300 bg-white text-gray-900 hover:border-gray-400`}>Email</a>}
        {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className={`${contactBtn} border border-gray-300 bg-white text-gray-900 hover:border-gray-400`}>Llamar</a>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-gray-900">Etapa</span>
        <div className="flex gap-1" aria-hidden="true">
          {COLUMNS.map((c, i) => <span key={c.id} className={`flex-1 h-1.5 rounded-full ${i <= ci ? 'bg-brand-700' : 'bg-[#EAE7E0]'}`} />)}
        </div>
        <span className="text-xs text-gray-700 flex items-center gap-1.5 flex-wrap">
          {column.label}
          {column.next && (
            <>
              <span aria-hidden="true">→</span>
              <button type="button" onClick={() => onMove(COLUMNS[ci + 1].id)} className="min-h-[32px] font-semibold text-gray-900 underline underline-offset-2">{column.next}</button>
            </>
          )}
          {ci > 0 && (
            <button type="button" onClick={() => onMove(COLUMNS[ci - 1].id)} className="min-h-[32px] ml-auto text-gray-500 hover:text-gray-900">Volver a {COLUMNS[ci - 1].label.toLowerCase()}</button>
          )}
        </span>
      </div>

      {(lead.unit_name || lead.message) && (
        <div className="rounded-[14px] border border-gray-200 overflow-hidden">
          {lead.unit_name && (
            <div className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-[13px] font-semibold text-gray-900">Unidad {unit?.code ?? lead.unit_name}{typology ? ` · ${typology}` : ''}</span>
                <Link href={unitHref} className="shrink-0 text-[13px] font-semibold text-gray-900 underline underline-offset-2">Abrir</Link>
              </div>
              {unit && (
                <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-gray-600">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[unit.status].cls}`}>{STATUS_PILL[unit.status].label}</span>
                  {area ? <span>{Math.round(area)} m²</span> : null}
                  {unit.price ? <span className="font-semibold text-gray-900">{unit.currency ?? 'USD'} {new Intl.NumberFormat('es-AR').format(unit.price)}</span> : null}
                </div>
              )}
            </div>
          )}
          {lead.message && (
            <p className={`m-0 px-3.5 py-3 text-[13px] leading-relaxed text-gray-700 ${lead.unit_name ? 'border-t border-gray-200' : ''}`}>“{lead.message}”</p>
          )}
        </div>
      )}

      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        {lead.phone && <><dt className="text-gray-500">Teléfono</dt><dd className="m-0 text-gray-900 truncate">{lead.phone}</dd></>}
        {lead.email && <><dt className="text-gray-500">Email</dt><dd className="m-0 text-gray-900 truncate">{lead.email}</dd></>}
        {leadTags(lead).length > 0 && <><dt className="text-gray-500">Origen</dt><dd className="m-0 text-gray-900">{leadTags(lead).join(' · ')}</dd></>}
        <dt className="text-gray-500">Fecha</dt><dd className="m-0 text-gray-900">{new Date(lead.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd>
      </dl>
    </aside>
  );
}
