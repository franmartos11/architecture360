'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { TourData, TourNode } from '@/types';
import ImageUploader from './ImageUploader';
import BulkImageUploader, { type BulkUploadResult } from './BulkImageUploader';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { slugify } from '@/lib/slug';

const TourNodeViewer = dynamic(() => import('./TourNodeViewer'), { ssr: false });
const VirtualTour = dynamic(() => import('@/components/tour/VirtualTour'), { ssr: false });

interface TourEditorProps {
  initialTourData: TourData | null;
  onPersist: (tourData: TourData) => Promise<boolean>;
}

const EMPTY_TOUR: TourData = { initialNodeId: '', nodes: [] };

function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./]+$/, '');
  const spaced = base.replace(/[-_]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (!spaced) return 'Ambiente';
  return spaced.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  taken.add(id);
  return id;
}

interface NodeChipProps {
  node: TourNode;
  isActive: boolean;
  isInitial: boolean;
  isOrphan: boolean;
  onSelect: () => void;
  onRename: (id: string, name: string) => void;
  onSetInitial: () => void;
  onDelete: () => void;
}

// Un solo click navega al nodo (via onSelect, que burbujea desde el div de
// afuera); el nombre solo se vuelve editable con doble click, para que
// ambas acciones no se pisen entre sí.
function NodeChip({ node, isActive, isInitial, isOrphan, onSelect, onRename, onSetInitial, onDelete }: NodeChipProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);

  const commit = () => {
    setEditing(false);
    const val = draft.trim();
    if (val && val !== node.name) onRename(node.id, val);
    else setDraft(node.name);
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-sm cursor-pointer transition-colors
        ${isActive ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}
      onClick={onSelect}
    >
      {isOrphan && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Sin conectar al resto del recorrido" />
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onClick={e => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setDraft(node.name); setEditing(false); }
          }}
          className="font-medium bg-transparent border-b border-brand-500 outline-none w-auto min-w-[4ch]"
          style={{ width: `${Math.max(draft.length, 4)}ch` }}
        />
      ) : (
        <span
          onDoubleClick={e => { e.stopPropagation(); setDraft(node.name); setEditing(true); }}
          className="font-medium select-none"
          title="Doble clic para renombrar"
        >
          {node.name}
        </span>
      )}
      {isInitial && (
        <span className="text-[10px] uppercase tracking-wide bg-gray-900 text-white rounded-full px-2 py-0.5">inicial</span>
      )}
      {!isInitial && (
        <button onClick={e => { e.stopPropagation(); onSetInitial(); }} className="text-[10px] text-gray-400 hover:text-gray-700">
          marcar inicial
        </button>
      )}
      <button onClick={e => { e.stopPropagation(); onDelete(); }} className="text-gray-400 hover:text-red-500">×</button>
    </div>
  );
}

export default function TourEditor({ initialTourData, onPersist }: TourEditorProps) {
  const confirmDialog = useConfirm();
  const [tour, setTour] = useState<TourData>(initialTourData ?? EMPTY_TOUR);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(initialTourData?.nodes[0]?.id ?? null);
  const [placing, setPlacing] = useState<'link' | 'info' | null>(null);
  const [pendingPoint, setPendingPoint] = useState<{ yaw: number; pitch: number } | null>(null);
  const [linkTarget, setLinkTarget] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [infoTitle, setInfoTitle] = useState('');
  const [infoDesc, setInfoDesc] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeImage, setNewNodeImage] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [addNodeOpen, setAddNodeOpen] = useState((initialTourData?.nodes.length ?? 0) === 0);

  // La vista previa es un overlay propio (no pasa por CommonAreasTour, que
  // ya maneja Escape del lado público) — antes la única salida era la X.
  useEffect(() => {
    if (!previewing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewing(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewing]);

  const activeNode = tour.nodes.find(n => n.id === activeNodeId) ?? null;

  // Memoizados por referencia de activeNode (que solo cambia cuando tour
  // realmente se reemplaza vía persist, no en cada render) — si no,
  // reconstruir estos arrays con .map() en cada render (ej. cuando se
  // borra solo el cartel de "Guardado." a los 3 segundos) le pasa a
  // TourNodeViewer una referencia "nueva" y le hace destruir y recrear
  // todos los pines de Marzipano en medio de un arrastre.
  const linkHotspotMarkers = useMemo(
    () => (activeNode?.linkHotspots ?? []).map(h => ({
      yaw: h.yaw,
      pitch: h.pitch,
      label: h.label || tour.nodes.find(n => n.id === h.targetNodeId)?.name || 'Ir a...',
    })),
    [activeNode, tour.nodes]
  );
  const infoHotspotMarkers = useMemo(
    () => (activeNode?.infoHotspots ?? []).map(h => ({ yaw: h.yaw, pitch: h.pitch, label: h.title })),
    [activeNode]
  );

  // Un nodo está "conectado" si es origen o destino de al menos un link hotspot.
  // Con un solo nodo no aplica: es el único ambiente, no necesita conexión.
  const connectedIds = new Set<string>();
  tour.nodes.forEach(n => (n.linkHotspots ?? []).forEach(h => { connectedIds.add(n.id); connectedIds.add(h.targetNodeId); }));
  const orphanIds = new Set(tour.nodes.length > 1 ? tour.nodes.filter(n => !connectedIds.has(n.id)).map(n => n.id) : []);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const persist = async (next: TourData) => {
    setSaving(true);
    const ok = await onPersist(next);
    setSaving(false);
    if (ok) {
      setTour(next);
      flash('Guardado.');
    } else {
      flash('Error al guardar.');
    }
    return ok;
  };

  const handleAddNode = async () => {
    if (!newNodeName.trim() || !newNodeImage.trim()) return;
    const id = slugify(newNodeName) || 'nodo';
    if (tour.nodes.some(n => n.id === id)) {
      flash('Ya existe un nodo con ese nombre.');
      return;
    }
    const node: TourNode = {
      id,
      name: newNodeName.trim(),
      imageUrl: newNodeImage.trim(),
      initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 },
    };
    const next: TourData = { initialNodeId: tour.initialNodeId || id, nodes: [...tour.nodes, node] };
    const ok = await persist(next);
    if (ok) {
      setActiveNodeId(id);
      setNewNodeName('');
      setNewNodeImage('');
    }
  };

  const handleBulkAdd = async (files: BulkUploadResult[]) => {
    const taken = new Set(tour.nodes.map(n => n.id));
    const newNodes: TourNode[] = files.map(f => {
      const name = nameFromFileName(f.fileName);
      const id = uniqueId(slugify(name) || 'nodo', taken);
      return { id, name, imageUrl: f.url, initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 } };
    });
    const next: TourData = {
      initialNodeId: tour.initialNodeId || newNodes[0]?.id || '',
      nodes: [...tour.nodes, ...newNodes],
    };
    const ok = await persist(next);
    if (ok) {
      setActiveNodeId(newNodes[0]?.id ?? activeNodeId);
      flash(`${newNodes.length} ambiente${newNodes.length === 1 ? '' : 's'} agregado${newNodes.length === 1 ? '' : 's'}. Revisá los nombres y armá las conexiones.`);
    }
  };

  const handleDeleteNode = async (id: string) => {
    const confirmed = await confirmDialog({ message: '¿Borrar este nodo? Los hotspots de otros nodos que apunten acá van a quedar rotos.', confirmLabel: 'Borrar nodo', danger: true });
    if (!confirmed) return;
    const nextNodes = tour.nodes.filter(n => n.id !== id);
    const next: TourData = {
      initialNodeId: tour.initialNodeId === id ? (nextNodes[0]?.id ?? '') : tour.initialNodeId,
      nodes: nextNodes,
    };
    const ok = await persist(next);
    if (ok && activeNodeId === id) setActiveNodeId(nextNodes[0]?.id ?? null);
  };

  const handleSetInitial = async (id: string) => {
    await persist({ ...tour, initialNodeId: id });
  };

  const handleRenameNode = async (id: string, name: string) => {
    const nextNodes = tour.nodes.map(n => (n.id === id ? { ...n, name } : n));
    await persist({ ...tour, nodes: nextNodes });
  };

  const handlePlace = (yaw: number, pitch: number) => {
    setPendingPoint({ yaw, pitch });
  };

  const cancelPending = () => {
    setPendingPoint(null);
    setPlacing(null);
    setLinkTarget('');
    setLinkLabel('');
    setInfoTitle('');
    setInfoDesc('');
  };

  const confirmAddLink = async () => {
    if (!activeNode || !pendingPoint || !linkTarget) return;
    const hotspot = { yaw: pendingPoint.yaw, pitch: pendingPoint.pitch, targetNodeId: linkTarget, label: linkLabel || undefined };
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, linkHotspots: [...(n.linkHotspots ?? []), hotspot] } : n
    );
    const ok = await persist({ ...tour, nodes: nextNodes });
    if (ok) cancelPending();
  };

  const confirmAddInfo = async () => {
    if (!activeNode || !pendingPoint || !infoTitle) return;
    const hotspot = { yaw: pendingPoint.yaw, pitch: pendingPoint.pitch, title: infoTitle, description: infoDesc || undefined };
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, infoHotspots: [...(n.infoHotspots ?? []), hotspot] } : n
    );
    const ok = await persist({ ...tour, nodes: nextNodes });
    if (ok) cancelPending();
  };

  const handleDeleteLinkHotspot = async (index: number) => {
    if (!activeNode) return;
    const ok = await confirmDialog({ message: '¿Borrar esta conexión?', confirmLabel: 'Borrar conexión', danger: true });
    if (!ok) return;
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, linkHotspots: (n.linkHotspots ?? []).filter((_, i) => i !== index) } : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  const handleDeleteInfoHotspot = async (index: number) => {
    if (!activeNode) return;
    const ok = await confirmDialog({ message: '¿Borrar este punto de info?', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, infoHotspots: (n.infoHotspots ?? []).filter((_, i) => i !== index) } : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  // Corregir la posición de un hotspot ya confirmado (arrastrándolo de su
  // ícono) — sin confirmación, a diferencia de borrar: es reversible con
  // solo volver a arrastrarlo.
  const handleMoveLinkHotspot = async (index: number, yaw: number, pitch: number) => {
    if (!activeNode) return;
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, linkHotspots: (n.linkHotspots ?? []).map((h, i) => (i === index ? { ...h, yaw, pitch } : h)) } : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  const handleMoveInfoHotspot = async (index: number, yaw: number, pitch: number) => {
    if (!activeNode) return;
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, infoHotspots: (n.infoHotspots ?? []).map((h, i) => (i === index ? { ...h, yaw, pitch } : h)) } : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  return (
    <div className="space-y-6">
      {/* Nodos — fuente fija en 16px: a 18px (la base del resto del admin)
          los chips de ambientes se superponen entre sí. */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden" style={{ fontSize: '16px' }}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Ambientes / nodos del recorrido</h3>
            {orphanIds.size > 0 && (
              <span className="text-xs font-medium text-amber-600">⚠ {orphanIds.size} sin conectar al resto del recorrido</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {message && <span className="text-sm font-medium text-green-600">{message}</span>}
            <button
              onClick={() => setPreviewing(true)}
              disabled={tour.nodes.length === 0}
              className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              ▶ Probar recorrido
            </button>
          </div>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {tour.nodes.map(n => (
            <NodeChip
              key={n.id}
              node={n}
              isActive={activeNodeId === n.id}
              isInitial={tour.initialNodeId === n.id}
              isOrphan={orphanIds.has(n.id)}
              onSelect={() => { setActiveNodeId(n.id); cancelPending(); }}
              onRename={handleRenameNode}
              onSetInitial={() => handleSetInitial(n.id)}
              onDelete={() => handleDeleteNode(n.id)}
            />
          ))}
          <button
            onClick={() => setAddNodeOpen(open => !open)}
            aria-expanded={addNodeOpen}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 border text-sm font-medium transition-colors ${
              addNodeOpen ? 'border-gray-900 bg-gray-900 text-white' : 'border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
            }`}
          >
            {addNodeOpen ? '– Cerrar' : '+ Agregar ambiente'}
          </button>
        </div>
        {addNodeOpen && (
          <div className="p-4 bg-gray-50/50 space-y-3 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newNodeName}
                onChange={e => setNewNodeName(e.target.value)}
                placeholder="Nombre (ej: Living Comedor)"
                className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button onClick={handleAddNode} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap">
                + Agregar nodo
              </button>
            </div>
            <ImageUploader value={newNodeImage} onChange={setNewNodeImage} folder="tours" />

            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">o subí varias de una</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <BulkImageUploader
              folder="tours"
              onComplete={handleBulkAdd}
              hint="El nombre de cada ambiente sale del nombre del archivo — lo podés corregir después con doble clic sobre el nombre arriba. Si vienen en formato estéreo (dos mitades apiladas), las recortamos solas."
            />
          </div>
        )}
      </div>

      {/* Editor de la panorámica activa */}
      {activeNode ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setPlacing(placing === 'link' ? null : 'link'); setPendingPoint(null); }}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${placing === 'link' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                + Ir a otro ambiente
              </button>
              <button
                onClick={() => { setPlacing(placing === 'info' ? null : 'info'); setPendingPoint(null); }}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${placing === 'info' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                + Punto de info
              </button>
              {placing && <span className="text-xs text-gray-500">Arrastrá sobre la panorámica para ubicarlo — llevalo a un borde para rotar la cámara</span>}
            </div>

            <TourNodeViewer
              imageUrl={activeNode.imageUrl}
              linkHotspots={linkHotspotMarkers}
              infoHotspots={infoHotspotMarkers}
              placing={placing}
              onPlace={handlePlace}
              onDeleteLink={handleDeleteLinkHotspot}
              onDeleteInfo={handleDeleteInfoHotspot}
              onMoveLink={handleMoveLinkHotspot}
              onMoveInfo={handleMoveInfoHotspot}
            />

            {pendingPoint && placing === 'link' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Destino</label>
                  <select value={linkTarget} onChange={e => setLinkTarget(e.target.value)} className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                    <option value="">Elegir ambiente...</option>
                    {tour.nodes.filter(n => n.id !== activeNode.id).map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Etiqueta (opcional)</label>
                  <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Ir al Living" className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmAddLink} disabled={!linkTarget || saving} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors">Agregar</button>
                  <button onClick={cancelPending} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">Cancelar</button>
                </div>
              </div>
            )}

            {pendingPoint && placing === 'info' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
                  <input value={infoTitle} onChange={e => setInfoTitle(e.target.value)} placeholder="Terminaciones" className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descripción (opcional)</label>
                  <input value={infoDesc} onChange={e => setInfoDesc(e.target.value)} placeholder="Piso de porcelanato" className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmAddInfo} disabled={!infoTitle || saving} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors">Agregar</button>
                  <button onClick={cancelPending} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Lista de hotspots del nodo activo */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Hotspots de &quot;{activeNode.name}&quot;</h3>
              <span className="text-xs text-gray-400 font-medium">
                {(activeNode.linkHotspots?.length ?? 0) + (activeNode.infoHotspots?.length ?? 0)}
              </span>
            </div>

            {(activeNode.linkHotspots ?? []).length === 0 && (activeNode.infoHotspots ?? []).length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm space-y-1">
                <p>Todavía no hay hotspots en este ambiente.</p>
                <p className="text-xs">Usá los botones de arriba para agregar uno, o clickeá directo sobre la panorámica.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {(activeNode.linkHotspots ?? []).length > 0 && (
                  <div>
                    <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ir a otro ambiente</p>
                    <div className="divide-y divide-gray-100">
                      {(activeNode.linkHotspots ?? []).map((h, i) => (
                        <div key={`link-${i}`} className="px-5 py-2.5 flex items-center gap-3 text-sm hover:bg-gray-50/70 transition-colors">
                          <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                            </svg>
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 font-medium truncate">{tour.nodes.find(n => n.id === h.targetNodeId)?.name ?? h.targetNodeId}</p>
                            {h.label && <p className="text-xs text-gray-400 truncate">&quot;{h.label}&quot;</p>}
                          </div>
                          <button
                            onClick={() => handleDeleteLinkHotspot(i)}
                            aria-label="Borrar conexión"
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(activeNode.infoHotspots ?? []).length > 0 && (
                  <div>
                    <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Puntos de info</p>
                    <div className="divide-y divide-gray-100">
                      {(activeNode.infoHotspots ?? []).map((h, i) => (
                        <div key={`info-${i}`} className="px-5 py-2.5 flex items-center gap-3 text-sm hover:bg-gray-50/70 transition-colors">
                          <span className="w-8 h-8 rounded-full bg-amber-600 text-white font-serif font-bold flex items-center justify-center shrink-0">i</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 font-medium truncate">{h.title}</p>
                            {h.description && <p className="text-xs text-gray-400 truncate">{h.description}</p>}
                          </div>
                          <button
                            onClick={() => handleDeleteInfoHotspot(i)}
                            aria-label="Borrar punto de info"
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Agregá el primer ambiente arriba para empezar a armar el recorrido.
        </div>
      )}

      {previewing && (
        <div className="fixed inset-0 z-[200] bg-black">
          <button
            onClick={() => setPreviewing(false)}
            aria-label="Cerrar vista previa"
            className="absolute top-4 right-4 z-[210] w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white backdrop-blur transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <VirtualTour tourData={tour} focusNodeId={activeNodeId ?? undefined} />
        </div>
      )}
    </div>
  );
}
