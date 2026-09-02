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

interface NodeRowProps {
  node: TourNode;
  index: number;
  count: number;
  isActive: boolean;
  isInitial: boolean;
  isOrphan: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
}

function NodeRow({ node, index, count, isActive, isInitial, isOrphan, onSelect, onMove }: NodeRowProps) {
  const linkCount = node.linkHotspots?.length ?? 0;
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2.5 rounded-xl px-2 py-2 cursor-pointer transition-colors ${
        isActive ? 'bg-brand-50 shadow-[inset_2px_0_0_var(--color-brand-500)]' : 'hover:bg-gray-50'
      }`}
    >
      <div className="relative w-[52px] h-[33px] shrink-0 rounded-md overflow-hidden border border-gray-200 bg-gray-100">
        {node.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : null}
        {isInitial && (
          <span className="absolute left-1 top-1 h-3.5 px-1 flex items-center rounded bg-gray-900 text-[8px] font-semibold text-white tracking-wide">
            INICIO
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-[12.5px] font-medium text-gray-900 truncate leading-tight">{node.name}</p>
        <p className={`text-[10px] leading-none ${isOrphan ? 'text-amber-700' : 'text-gray-400'}`}>
          {isOrphan ? 'sin salidas' : `${linkCount} salida${linkCount === 1 ? '' : 's'}`}
        </p>
      </div>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onMove(-1); }}
          disabled={index === 0}
          title="Subir"
          className="w-5 h-4 flex items-center justify-center rounded text-[9px] text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-25 disabled:hover:bg-transparent"
        >
          ▲
        </button>
        <button
          onClick={e => { e.stopPropagation(); onMove(1); }}
          disabled={index === count - 1}
          title="Bajar"
          className="w-5 h-4 flex items-center justify-center rounded text-[9px] text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-25 disabled:hover:bg-transparent"
        >
          ▼
        </button>
      </div>
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
  const [showGraph, setShowGraph] = useState(false);
  const [selName, setSelName] = useState(() => tour.nodes.find(n => n.id === activeNodeId)?.name ?? '');
  const [selNote, setSelNote] = useState(() => tour.nodes.find(n => n.id === activeNodeId)?.note ?? '');
  const [replacingImage, setReplacingImage] = useState(false);

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

  // Los inputs de nombre/nota del panel derecho son locales (no hacen un
  // PATCH por tecla) y solo se sincronizan con el nodo activo cuando
  // cambia CUÁL nodo está seleccionado — si no, escribir un carácter
  // dispararía un persist por letra. Se resuelve durante el render
  // comparando contra el id anterior (mismo patrón que
  // TourOrientationControl), no en un efecto, para no pisar lo que el
  // usuario esté tipeando con un setState síncrono de más.
  const [selNodeId, setSelNodeId] = useState(activeNodeId);
  if (activeNodeId !== selNodeId) {
    setSelNodeId(activeNodeId);
    setSelName(activeNode?.name ?? '');
    setSelNote(activeNode?.note ?? '');
    setReplacingImage(false);
  }

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
  const hasStart = tour.nodes.some(n => n.id === tour.initialNodeId);
  const totalLinks = tour.nodes.reduce((a, n) => a + (n.linkHotspots?.length ?? 0), 0) / 2;

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

  const handleSetNote = async (id: string, note: string) => {
    const nextNodes = tour.nodes.map(n => (n.id === id ? { ...n, note: note || undefined } : n));
    await persist({ ...tour, nodes: nextNodes });
  };

  const handleReplaceImage = async (id: string, url: string) => {
    const nextNodes = tour.nodes.map(n => (n.id === id ? { ...n, imageUrl: url } : n));
    const ok = await persist({ ...tour, nodes: nextNodes });
    if (ok) setReplacingImage(false);
  };

  const handleMoveNode = (id: string, dir: -1 | 1) => {
    const arr = tour.nodes.slice();
    const i = arr.findIndex(n => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
    persist({ ...tour, nodes: arr });
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

  const addLinkTargetOptions = activeNode
    ? tour.nodes.filter(n => n.id !== activeNode.id)
    : [];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 overflow-hidden">
      {/* Encabezado — fuente fija en 16px: a 18px (la base del resto del
          admin) los chips se apretujan entre sí. */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap" style={{ fontSize: '16px' }}>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-900">Ambientes del recorrido</h3>
            <span className="text-xs text-gray-400">
              {tour.nodes.length} ambiente{tour.nodes.length === 1 ? '' : 's'} · {totalLinks} conexion{totalLinks === 1 ? '' : 'es'}
            </span>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {orphanIds.size > 0 && (
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-medium bg-amber-50 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {orphanIds.size} ambiente{orphanIds.size === 1 ? '' : 's'} sin salidas
              </span>
            )}
            {!hasStart && tour.nodes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-medium bg-amber-50 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                Falta elegir el ambiente de inicio
              </span>
            )}
            {orphanIds.size === 0 && hasStart && tour.nodes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[11px] font-medium bg-brand-50 text-brand-700">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                Recorrido completo y listo para publicar
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {message && <span className="text-sm font-medium text-green-600">{message}</span>}
          <button
            onClick={() => setShowGraph(s => !s)}
            disabled={tour.nodes.length === 0}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-40 ${
              showGraph ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Ver mapa de conexiones
          </button>
          <button
            onClick={() => setPreviewing(true)}
            disabled={tour.nodes.length === 0}
            className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            ▶ Probar recorrido
          </button>
        </div>
      </div>

      {tour.nodes.length === 0 ? (
        <div className="p-4">
          <AddNodePanel
            newNodeName={newNodeName}
            setNewNodeName={setNewNodeName}
            newNodeImage={newNodeImage}
            setNewNodeImage={setNewNodeImage}
            onAdd={handleAddNode}
            onBulkAdd={handleBulkAdd}
            open
            onToggle={() => {}}
            hideToggle
          />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row items-stretch" style={{ minHeight: 420 }}>
          {/* Panel izquierdo — lista de ambientes */}
          <div className="lg:w-[260px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col">
            <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ambientes</span>
              <span className="text-[10px] text-gray-400">orden del recorrido</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 max-h-[50vh] lg:max-h-none">
              {tour.nodes.map((n, i) => (
                <NodeRow
                  key={n.id}
                  node={n}
                  index={i}
                  count={tour.nodes.length}
                  isActive={activeNodeId === n.id}
                  isInitial={tour.initialNodeId === n.id}
                  isOrphan={orphanIds.has(n.id)}
                  onSelect={() => { setActiveNodeId(n.id); cancelPending(); }}
                  onMove={dir => handleMoveNode(n.id, dir)}
                />
              ))}
            </div>
            <div className="border-t border-gray-200 p-3">
              <AddNodePanel
                newNodeName={newNodeName}
                setNewNodeName={setNewNodeName}
                newNodeImage={newNodeImage}
                setNewNodeImage={setNewNodeImage}
                onAdd={handleAddNode}
                onBulkAdd={handleBulkAdd}
                open={addNodeOpen}
                onToggle={() => setAddNodeOpen(o => !o)}
              />
            </div>
          </div>

          {/* Panel central — panorámica o mapa de conexiones */}
          <div className="flex-1 min-w-0 bg-gray-50/60 flex flex-col">
            {showGraph ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-wrap content-start gap-2">
                {tour.nodes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { setActiveNodeId(n.id); setShowGraph(false); }}
                    className={`text-left max-w-[240px] px-3 py-2 rounded-xl border transition-colors ${
                      (n.linkHotspots ?? []).length ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-amber-300 bg-amber-50/60 hover:border-amber-400'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{n.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {(n.linkHotspots ?? []).length
                        ? (n.linkHotspots ?? []).map(h => tour.nodes.find(t => t.id === h.targetNodeId)?.name ?? '?').join(' · ')
                        : 'sin salidas'}
                    </p>
                  </button>
                ))}
              </div>
            ) : activeNode ? (
              <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { setPlacing(placing === 'link' ? null : 'link'); setPendingPoint(null); }}
                    className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${placing === 'link' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                  >
                    + Ir a otro ambiente
                  </button>
                  <button
                    onClick={() => { setPlacing(placing === 'info' ? null : 'info'); setPendingPoint(null); }}
                    className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${placing === 'info' ? 'bg-amber-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
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
                        {addLinkTargetOptions.map(n => (
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
            ) : null}
          </div>

          {/* Panel derecho — detalle del ambiente seleccionado */}
          {activeNode && !showGraph && (
            <div className="lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Ambiente {tour.nodes.findIndex(n => n.id === activeNode.id) + 1} de {tour.nodes.length}
                </span>
                <input
                  value={selName}
                  onChange={e => setSelName(e.target.value)}
                  onBlur={() => { if (selName.trim() && selName !== activeNode.name) handleRenameNode(activeNode.id, selName.trim()); else setSelName(activeNode.name); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="text-[13.5px] font-medium text-gray-900 h-9 px-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 flex flex-col gap-4 max-h-[70vh] lg:max-h-none">
                {/* Salidas */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Salidas desde acá</span>
                    <span className="text-[10px] text-gray-400">{(activeNode.linkHotspots ?? []).length} salida(s)</span>
                  </div>

                  {(activeNode.linkHotspots ?? []).length === 0 ? (
                    <div className="p-3 border border-dashed border-amber-300 rounded-xl bg-amber-50/60 flex flex-col gap-1">
                      <p className="text-[11.5px] font-medium text-amber-800">Este ambiente no tiene salidas</p>
                      <p className="text-[10.5px] text-gray-500 leading-relaxed">Nadie puede llegar ni salir de acá en el visor. Agregá al menos una salida.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {(activeNode.linkHotspots ?? []).map((h, i) => (
                        <div key={`link-${i}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-gray-200 bg-white">
                          <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-gray-900 truncate">→ {tour.nodes.find(n => n.id === h.targetNodeId)?.name ?? h.targetNodeId}</p>
                            {h.label && <p className="text-[10px] text-gray-400 truncate">&quot;{h.label}&quot;</p>}
                          </div>
                          <button
                            onClick={() => handleDeleteLinkHotspot(i)}
                            title="Quitar salida"
                            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <select value={linkTarget && placing === 'link' ? linkTarget : ''} onChange={e => { setLinkTarget(e.target.value); }} className="flex-1 min-w-0 h-[33px] px-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                      <option value="">Elegí un ambiente…</option>
                      {addLinkTargetOptions.filter(n => !(activeNode.linkHotspots ?? []).some(l => l.targetNodeId === n.id)).map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { setPlacing('link'); setPendingPoint(null); }}
                      disabled={!linkTarget}
                      className="shrink-0 h-[33px] px-3 flex items-center rounded-lg text-xs font-medium bg-gray-900 text-white disabled:opacity-30 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                    >
                      Ubicar en la foto
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">Elegí un destino y después clickeá dónde está la puerta o el paso en la panorámica.</p>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Puntos de info */}
                {(activeNode.infoHotspots ?? []).length > 0 && (
                  <>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Puntos de info</span>
                      <div className="flex flex-col gap-1.5">
                        {(activeNode.infoHotspots ?? []).map((h, i) => (
                          <div key={`info-${i}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-gray-200 bg-white">
                            <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-serif font-bold flex items-center justify-center shrink-0 text-xs">i</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-gray-900 truncate">{h.title}</p>
                              {h.description && <p className="text-[10px] text-gray-400 truncate">{h.description}</p>}
                            </div>
                            <button
                              onClick={() => handleDeleteInfoHotspot(i)}
                              title="Quitar punto de info"
                              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="h-px bg-gray-100" />
                  </>
                )}

                {/* Foto panorámica */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Foto panorámica</span>
                  {replacingImage ? (
                    <div className="flex flex-col gap-2">
                      <ImageUploader value={activeNode.imageUrl} onChange={url => handleReplaceImage(activeNode.id, url)} folder="tours" />
                      <button onClick={() => setReplacingImage(false)} className="self-start text-[11px] text-gray-400 hover:text-gray-700">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex gap-2.5 items-start">
                      <div className="w-[76px] h-[38px] shrink-0 rounded-md border border-gray-200 overflow-hidden bg-gray-100">
                        {activeNode.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={activeNode.imageUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <p className="text-[11px] font-medium text-gray-900 truncate">{activeNode.name}</p>
                        <button onClick={() => setReplacingImage(true)} className="text-[10.5px] text-brand-600 hover:text-brand-800 text-left">Reemplazar panorámica</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-100" />

                {/* Texto en el visor */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Texto en el visor</span>
                  <textarea
                    value={selNote}
                    onChange={e => setSelNote(e.target.value)}
                    onBlur={() => { if (selNote !== (activeNode.note ?? '')) handleSetNote(activeNode.id, selNote); }}
                    rows={2}
                    placeholder="Opcional — cartel corto que aparece al entrar al ambiente."
                    className="text-xs leading-relaxed p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-y"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-2.5 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleSetInitial(activeNode.id)}
                  disabled={tour.initialNodeId === activeNode.id}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    tour.initialNodeId === activeNode.id
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {tour.initialNodeId === activeNode.id ? '✓ Es el ambiente de inicio' : 'Marcar como inicio'}
                </button>
                <button
                  onClick={() => handleDeleteNode(activeNode.id)}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                >
                  Borrar
                </button>
              </div>
            </div>
          )}
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

interface AddNodePanelProps {
  newNodeName: string;
  setNewNodeName: (v: string) => void;
  newNodeImage: string;
  setNewNodeImage: (v: string) => void;
  onAdd: () => void;
  onBulkAdd: (files: BulkUploadResult[]) => void;
  open: boolean;
  onToggle: () => void;
  hideToggle?: boolean;
}

function AddNodePanel({ newNodeName, setNewNodeName, newNodeImage, setNewNodeImage, onAdd, onBulkAdd, open, onToggle, hideToggle }: AddNodePanelProps) {
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        + Agregar ambiente
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {!hideToggle && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Nuevo ambiente</span>
          <button onClick={onToggle} className="text-[10px] text-gray-400 hover:text-gray-700">– Cerrar</button>
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={newNodeName}
          onChange={e => setNewNodeName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd(); }}
          placeholder="Nombre (ej: Pileta)"
          className="flex-1 min-w-0 text-xs px-2.5 h-[33px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
        />
        <button
          onClick={onAdd}
          disabled={!newNodeName.trim() || !newNodeImage.trim()}
          className="shrink-0 w-[33px] h-[33px] flex items-center justify-center rounded-lg text-lg font-normal bg-gray-900 text-white disabled:opacity-30 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          +
        </button>
      </div>
      <ImageUploader value={newNodeImage} onChange={setNewNodeImage} folder="tours" />

      <div className="flex items-center gap-2.5 pt-0.5">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[10px] text-gray-400">o subí varias de una</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <BulkImageUploader
        folder="tours"
        onComplete={onBulkAdd}
        hint="El nombre de cada ambiente sale del nombre del archivo — lo podés corregir después. Si vienen en formato estéreo (dos mitades apiladas), las recortamos solas."
      />
    </div>
  );
}
