'use client';

import { useState, useEffect, startTransition } from 'react';
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
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import type { Lead } from '@/types';
import { poppins, LEAD_BADGE, CHIP_CLASS, chipStyle } from '@/lib/panel-comercial-style';

const DARK_BG = '#101828';

const COLUMNS = [
  { id: 'nuevo', label: 'Nuevos', note: 'Contactar dentro de 24 h' },
  { id: 'contactado', label: 'Contactados', note: 'Esperando respuesta' },
  { id: 'negociacion', label: 'En negociación', note: 'Con unidad reservada o propuesta' },
  { id: 'cerrado', label: 'Venta cerrada', note: 'Pasar la unidad a Vendido' },
] as const;

const LEAD_FILTERS = ['Todos', 'Sin contactar', 'Últimos 7 días'] as const;

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function LeadCard({
  lead,
  ci,
  onWhatsApp,
  onMoveBack,
  onMoveNext,
  dragRef,
  dragAttributes,
  dragListeners,
  isDragging,
  isOverlay,
}: {
  lead: Lead;
  ci: number;
  onWhatsApp: (phone: string | null, name: string | null) => void;
  onMoveBack?: () => void;
  onMoveNext?: () => void;
  dragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  isDragging?: boolean;
  isOverlay?: boolean;
}) {
  const days = daysSince(lead.created_at);
  const stale = days > 7 && COLUMNS[ci].id !== 'cerrado';

  const draggable = Boolean(dragListeners);

  return (
    <div
      ref={dragRef}
      {...dragAttributes}
      {...dragListeners}
      className={`bg-white rounded-[10px] p-[12px_13px] flex flex-col gap-[9px] transition-shadow ${draggable ? 'hover:shadow-[0_4px_14px_rgba(16,24,40,.12)]' : ''}`}
      style={{
        border: '1px solid rgba(16,24,40,.09)',
        opacity: isDragging ? 0.35 : 1,
        boxShadow: isOverlay ? '0 14px 30px rgba(16,24,40,.22)' : undefined,
        cursor: isOverlay ? 'grabbing' : draggable ? 'grab' : undefined,
        touchAction: draggable ? 'none' : undefined,
      }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="text-[12.5px] font-semibold text-[#101828] truncate">{lead.name ?? 'Sin nombre'}</div>
        <div className="text-[9.5px] font-medium shrink-0" style={{ color: 'rgba(16,24,40,.38)' }}>
          {new Date(lead.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
        </div>
      </div>

      <div className="text-[11px]" style={{ color: 'rgba(16,24,40,.6)' }}>{lead.phone}</div>
      {lead.unit_name && (
        <div className="text-[10.5px] w-fit rounded-md px-2 py-[5px]" style={{ background: '#f4f6f4', color: 'rgba(16,24,40,.62)' }}>
          {lead.unit_name}
        </div>
      )}
      <div className="text-[10px] font-medium" style={{ color: stale ? '#a06a12' : 'rgba(16,24,40,.42)' }}>
        {stale ? `Sin movimiento hace ${days} días` : `Actualizado hace ${days} día${days === 1 ? '' : 's'}`}
      </div>

      <div className="flex items-center gap-1.5 pt-[9px]" style={{ borderTop: '1px solid rgba(16,24,40,.07)' }}>
        <button
          onClick={() => onWhatsApp(lead.phone, lead.name)}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-[29px] px-2.5 flex items-center gap-1.5 rounded-[7px] text-[11px] font-medium transition-colors"
          style={{ background: 'rgba(37,211,102,.12)', color: '#128c4a' }}
          title="Contactar por WhatsApp"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          WhatsApp
        </button>
        <div className="flex-1" />
        {onMoveBack && (
          <button
            onClick={onMoveBack}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={ci === 0}
            className="w-[29px] h-[29px] flex items-center justify-center rounded-[7px] text-[12px] transition-colors"
            style={ci > 0 ? { border: '1px solid rgba(16,24,40,.13)', color: 'rgba(16,24,40,.5)' } : { border: '1px solid rgba(16,24,40,.08)', color: 'rgba(16,24,40,.2)' }}
            title="Mover a la columna anterior"
          >
            ←
          </button>
        )}
        {onMoveNext && (
          <button
            onClick={onMoveNext}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={ci === COLUMNS.length - 1}
            className="h-[29px] px-2.5 flex items-center rounded-[7px] text-[11px] font-medium whitespace-nowrap transition-colors"
            style={ci < COLUMNS.length - 1 ? { background: DARK_BG, color: '#fff' } : { background: '#f1f3f0', color: 'rgba(16,24,40,.4)' }}
          >
            {ci < COLUMNS.length - 1 ? 'Mover →' : 'Cerrado'}
          </button>
        )}
      </div>
    </div>
  );
}

function DraggableLeadCard({
  lead,
  ci,
  onWhatsApp,
  onMoveBack,
  onMoveNext,
}: {
  lead: Lead;
  ci: number;
  onWhatsApp: (phone: string | null, name: string | null) => void;
  onMoveBack: () => void;
  onMoveNext: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });

  return (
    <LeadCard
      lead={lead}
      ci={ci}
      onWhatsApp={onWhatsApp}
      onMoveBack={onMoveBack}
      onMoveNext={onMoveNext}
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
      className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-0.5 rounded-lg"
      style={{
        background: isOver ? 'rgba(16,24,40,.05)' : undefined,
        outline: isOver ? '2px dashed rgba(16,24,40,.18)' : '2px solid transparent',
        outlineOffset: -2,
        transition: 'background .15s, outline-color .15s',
      }}
    >
      {children}
    </div>
  );
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<typeof LEAD_FILTERS[number]>('Todos');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const fetchLeads = () => {
    startTransition(() => {
      setLoading(true);
      setError(false);
    });
    fetch('/api/admin/leads')
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
  }, []);

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

  if (loading) return <LoadingSpinner text="Cargando leads..." tone="light" />;
  if (error) return <ErrorState message="No se pudieron cargar los leads." onRetry={fetchLeads} />;

  const newLeadsCount = leads.filter(l => (l.status || 'nuevo') === 'nuevo').length;
  const visibleLeads = leads.filter(l => {
    if (filter === 'Sin contactar') return (l.status || 'nuevo') === 'nuevo';
    if (filter === 'Últimos 7 días') return daysSince(l.created_at) <= 7;
    return true;
  });

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null;
  const activeCi = activeLead ? COLUMNS.findIndex(c => c.id === (activeLead.status || 'nuevo')) : -1;

  return (
    <div className={`${poppins.className} h-[calc(100vh-8rem)] flex flex-col gap-3.5`}>
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <div className="text-[22px] font-semibold leading-tight text-[#101828]">Leads</div>
          <p className="text-xs leading-relaxed mt-[5px]" style={{ color: 'rgba(16,24,40,.55)' }}>
            {newLeadsCount} sin contactar · {leads.length} en el embudo · el CRM se llena con el formulario del sitio
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {LEAD_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={CHIP_CLASS}
              style={chipStyle(filter === f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState title="Todavía no hay leads." description="Van a aparecer acá apenas alguien complete el formulario de contacto en el sitio." />
      ) : (
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto pb-1">
          <div className="grid gap-3 h-full" style={{ gridTemplateColumns: 'repeat(4, minmax(238px, 1fr))', minWidth: 1000 }}>
            {COLUMNS.map((column, ci) => {
              const columnLeads = visibleLeads.filter(l => (l.status || 'nuevo') === column.id);
              const tone = LEAD_BADGE[column.id];
              return (
                <div key={column.id} className="flex flex-col gap-2.5 rounded-xl p-3" style={{ background: '#f2f4f5', border: '1px solid rgba(16,24,40,.07)', minHeight: 420 }}>
                  <div className="flex justify-between items-center gap-2 px-[3px]">
                    <div className="text-[12.5px] font-semibold text-[#101828]">{column.label}</div>
                    <span className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: tone.bg, color: tone.color }}>
                      {columnLeads.length}
                    </span>
                  </div>
                  <p className="text-[10.5px] px-[3px] -mt-1.5" style={{ color: 'rgba(16,24,40,.45)' }}>{column.note}</p>

                  <DroppableColumn id={column.id}>
                    {columnLeads.map(lead => (
                      <DraggableLeadCard
                        key={lead.id}
                        lead={lead}
                        ci={ci}
                        onWhatsApp={handleWhatsApp}
                        onMoveBack={() => ci > 0 && updateLeadStatus(lead.id, COLUMNS[ci - 1].id)}
                        onMoveNext={() => ci < COLUMNS.length - 1 && updateLeadStatus(lead.id, COLUMNS[ci + 1].id)}
                      />
                    ))}
                    {columnLeads.length === 0 && (
                      <div className="rounded-[10px] px-[13px] py-4 text-center text-[10.5px] leading-relaxed" style={{ border: '1.5px dashed rgba(16,24,40,.15)', color: 'rgba(16,24,40,.45)' }}>
                        {ci === 0 ? 'Los leads del formulario del sitio entran acá.' : 'Arrastrá o usá "Mover →" desde la columna anterior.'}
                      </div>
                    )}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeLead && activeCi >= 0 ? (
            <div style={{ width: 238 }}>
              <LeadCard lead={activeLead} ci={activeCi} onWhatsApp={handleWhatsApp} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}
    </div>
  );
}
