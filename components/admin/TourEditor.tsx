'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { TourData, TourNode, TourView } from '@/types';
import ImageUploader from './ImageUploader';
import BulkImageUploader, { type BulkUploadResult } from './BulkImageUploader';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { slugify } from '@/lib/slug';
import { setNodeInitialView } from '@/lib/tour-data';

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

interface SceneCardProps {
  node: TourNode;
  index: number;
  count: number;
  isActive: boolean;
  isInitial: boolean;
  isUnreachable: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
}

// Tarjeta de escena (columna "Escenas" del diseño): miniatura, nombre y
// "★ Inicial · N puntos" o "Sin conexión" si no llega nadie.
function SceneCard({ node, index, count, isActive, isInitial, isUnreachable, onSelect, onMove }: SceneCardProps) {
  const points = (node.linkHotspots?.length ?? 0) + (node.infoHotspots?.length ?? 0);
  return (
    <div className={`group relative shrink-0 w-[200px] lg:w-auto flex items-center gap-2.5 p-2 rounded-xl bg-white transition-colors ${isActive ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
      <button type="button" onClick={onSelect} aria-pressed={isActive} className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[44px]">
        <span className="w-14 h-10 shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          {node.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : null}
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[13px] font-semibold text-gray-900 truncate">{node.name}</span>
          <span className={`text-[11px] leading-snug ${isUnreachable ? 'text-amber-800 font-semibold' : 'text-gray-500'}`}>
            {isInitial ? `★ Inicial · ${points} punto${points === 1 ? '' : 's'}` : isUnreachable ? 'Sin conexión' : `${points} punto${points === 1 ? '' : 's'}`}
          </span>
        </span>
      </button>
      <span className="flex flex-col opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Subir ${node.name}`} className="w-9 h-8 sm:w-6 sm:h-5 text-[10px] sm:text-[9px] text-gray-500 hover:text-gray-900 disabled:opacity-25">▲</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Bajar ${node.name}`} className="w-9 h-8 sm:w-6 sm:h-5 text-[10px] sm:text-[9px] text-gray-500 hover:text-gray-900 disabled:opacity-25">▼</button>
      </span>
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
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(null);
  const [autoReturn, setAutoReturn] = useState(true);
  const captureRef = useRef<(() => void) | null>(null);

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
    setSelectedLinkIndex(null);
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

  const hasStart = tour.nodes.some(n => n.id === tour.initialNodeId);

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

  const handleSetInitialView = async (id: string, view: TourView) => {
    const ok = await persist(setNodeInitialView(tour, id, view));
    if (ok) flash('Vista inicial guardada');
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

  // ── Punto seleccionado / nuevo (panel derecho del diseño) ──
  // Escenas a las que no llega ningún punto (salvo la inicial, que es la entrada).
  const incoming = new Set<string>();
  tour.nodes.forEach(n => (n.linkHotspots ?? []).forEach(h => incoming.add(h.targetNodeId)));
  const unreachable = tour.nodes.length > 1 ? tour.nodes.filter(n => n.id !== tour.initialNodeId && !incoming.has(n.id)) : [];
  const nodeName = (id: string) => tour.nodes.find(n => n.id === id)?.name ?? id;

  const selectedLink = activeNode && selectedLinkIndex !== null ? (activeNode.linkHotspots ?? [])[selectedLinkIndex] ?? null : null;

  const handleUpdateLinkHotspot = async (index: number, patch: { label?: string; targetNodeId?: string }) => {
    if (!activeNode) return;
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id
        ? { ...n, linkHotspots: (n.linkHotspots ?? []).map((h, i) => (i === index ? { ...h, ...patch, label: patch.label !== undefined ? (patch.label || undefined) : h.label } : h)) }
        : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  // "Crear la vuelta automáticamente": además del punto en esta escena,
  // agrega uno en la escena destino que vuelve acá, ubicado "de espaldas"
  // (yaw + 180°) — se puede mover después arrastrándolo.
  const confirmAddLinkWithReturn = async () => {
    if (!activeNode || !pendingPoint || !linkTarget) return;
    const hotspot = { yaw: pendingPoint.yaw, pitch: pendingPoint.pitch, targetNodeId: linkTarget, label: linkLabel || undefined };
    const backYaw = Math.atan2(Math.sin(pendingPoint.yaw + Math.PI), Math.cos(pendingPoint.yaw + Math.PI));
    const nextNodes = tour.nodes.map(n => {
      if (n.id === activeNode.id) return { ...n, linkHotspots: [...(n.linkHotspots ?? []), hotspot] };
      if (autoReturn && n.id === linkTarget && !(n.linkHotspots ?? []).some(h => h.targetNodeId === activeNode.id)) {
        return { ...n, linkHotspots: [...(n.linkHotspots ?? []), { yaw: backYaw, pitch: 0, targetNodeId: activeNode.id }] };
      }
      return n;
    });
    const ok = await persist({ ...tour, nodes: nextNodes });
    if (ok) cancelPending();
  };

  const connectScene = (targetId: string) => {
    setSelectedLinkIndex(null);
    setLinkTarget(targetId);
    setLinkLabel(nodeName(targetId));
    setPlacing('link');
    setPendingPoint(null);
  };

  const sideLabel = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500';
  const field = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 bg-white text-sm text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30';
  const toolBtn = (on: boolean) => `min-h-[40px] px-3.5 rounded-[10px] text-[13px] font-semibold border transition-colors ${on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-300 text-gray-900 hover:border-gray-400'}`;

  const orphanWarning = unreachable.length > 0 && (
    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs leading-relaxed text-amber-800">
      <b>{unreachable[0].name}</b> no tiene ningún punto que llegue a ella{unreachable.length > 1 ? ` (y ${unreachable.length - 1} más)` : ''}.{' '}
      {activeNode && activeNode.id !== unreachable[0].id && (
        <button type="button" onClick={() => connectScene(unreachable[0].id)} className="inline-flex items-center min-h-[36px] px-1 font-semibold underline underline-offset-2">Conectarla</button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {tour.nodes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-[15px] font-semibold text-gray-900">Escenas del recorrido</h3>
            <p className="m-0 text-[13px] text-gray-600">Subí las panorámicas 2:1 (una por ambiente). El nombre de cada escena sale del archivo.</p>
          </div>
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
        <>
        {!hasStart && (
          <p role="status" className="m-0 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
            Falta elegir la escena inicial: abrí una escena y tocá “Marcar como inicial”.
          </p>
        )}
        <div className="grid gap-4 items-start grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_280px]">
          {/* Escenas */}
          <aside aria-label="Escenas" className="flex flex-col gap-2 min-w-0">
            <div className="flex items-baseline justify-between px-0.5">
              <span className="text-sm font-semibold text-gray-900">Escenas</span>
              <span className="text-xs text-gray-500">{tour.nodes.length}</span>
            </div>
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible -mx-1 px-1 pb-1 lg:pb-0">
              {tour.nodes.map((n, i) => (
                <SceneCard
                  key={n.id}
                  node={n}
                  index={i}
                  count={tour.nodes.length}
                  isActive={activeNodeId === n.id}
                  isInitial={tour.initialNodeId === n.id}
                  isUnreachable={unreachable.some(u => u.id === n.id)}
                  onSelect={() => { setActiveNodeId(n.id); cancelPending(); setSelectedLinkIndex(null); }}
                  onMove={dir => handleMoveNode(n.id, dir)}
                />
              ))}
            </div>
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
          </aside>

          {/* Visor */}
          <div className="flex flex-col gap-3 min-w-0">
            {showGraph ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-wrap content-start gap-2 min-h-[320px]">
                {tour.nodes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { setActiveNodeId(n.id); setShowGraph(false); }}
                    className={`text-left max-w-[240px] px-3 py-2 rounded-xl border transition-colors ${
                      (n.linkHotspots ?? []).length ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-amber-300 bg-amber-50 hover:border-amber-400'
                    }`}
                  >
                    <p className="m-0 text-[13px] font-semibold text-gray-900 truncate">{n.name}</p>
                    <p className="m-0 text-[11px] text-gray-600 truncate">
                      {(n.linkHotspots ?? []).length
                        ? (n.linkHotspots ?? []).map(h => nodeName(h.targetNodeId)).join(' · ')
                        : 'sin salidas'}
                    </p>
                  </button>
                ))}
              </div>
            ) : activeNode ? (
              <div className="relative">
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
                  initialView={activeNode.initialView}
                  onCaptureView={v => handleSetInitialView(activeNode.id, v)}
                  captureRef={captureRef}
                  hideCaptureButton
                />
                <div className="absolute left-3 top-3 right-3 flex gap-2 flex-wrap pointer-events-none">
                  <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-900/80 text-white">
                    {activeNode.name}{tour.initialNodeId === activeNode.id ? ' · escena inicial' : ''}
                  </span>
                  <span className="hidden sm:inline text-xs px-2.5 py-1.5 rounded-lg bg-gray-900/70 text-white">
                    {placing ? 'Clic donde va el punto · llevalo a un borde para girar' : 'Arrastrá para mirar · elegí "+ Punto" para agregar'}
                  </span>
                </div>
              </div>
            ) : null}

            {activeNode && !showGraph && (
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => captureRef.current?.()} disabled={!!placing} className={toolBtn(false)}>Fijar vista inicial</button>
                <button type="button" onClick={() => { setPlacing(placing === 'link' ? null : 'link'); setPendingPoint(null); setSelectedLinkIndex(null); }} className={toolBtn(placing === 'link')}>+ Punto de paso</button>
                <button type="button" onClick={() => { setPlacing(placing === 'info' ? null : 'info'); setPendingPoint(null); setSelectedLinkIndex(null); }} className={toolBtn(placing === 'info')}>+ Punto de info</button>
                <span className="flex-1" />
                {message && <span role="status" className="text-[13px] font-medium text-brand-700">{message}</span>}
                <button type="button" onClick={() => setShowGraph(g => !g)} className="min-h-[40px] px-3 text-[13px] font-medium text-gray-700 underline underline-offset-2">
                  {showGraph ? 'Volver al visor' : 'Mapa de conexiones'}
                </button>
                <button type="button" onClick={() => setPreviewing(true)} className="min-h-[40px] px-4 rounded-[10px] bg-gray-900 text-white text-[13px] font-semibold hover:bg-black">Probar recorrido</button>
              </div>
            )}
          </div>

          {/* Panel del punto / de la escena */}
          {activeNode && !showGraph && (
            <aside aria-label="Detalle" className="lg:col-span-2 xl:col-span-1 rounded-2xl border border-gray-200 bg-white p-5 flex flex-col gap-4 min-w-0">
              {pendingPoint && placing === 'link' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className={sideLabel}>Punto de paso nuevo</span>
                    <span className="font-display text-lg font-semibold text-gray-900">{activeNode.name} → {linkTarget ? nodeName(linkTarget) : '…'}</span>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-700">Lleva a</span>
                    <select value={linkTarget} onChange={e => { setLinkTarget(e.target.value); if (!linkLabel) setLinkLabel(nodeName(e.target.value)); }} className={field}>
                      <option value="">Elegir escena…</option>
                      {addLinkTargetOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-700">Etiqueta</span>
                    <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Piscina" className={field} />
                  </label>
                  <label className="flex items-center gap-2.5 text-[13px] text-gray-900 min-h-[32px]">
                    <input type="checkbox" checked={autoReturn} onChange={e => setAutoReturn(e.target.checked)} className="w-4 h-4 accent-brand-700" />
                    Crear la vuelta automáticamente
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={confirmAddLinkWithReturn} disabled={!linkTarget || saving} className="flex-1 min-h-[44px] rounded-[10px] bg-gray-900 text-white text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-400">Agregar punto</button>
                    <button type="button" onClick={cancelPending} className="min-h-[44px] px-3 text-sm text-gray-700">Cancelar</button>
                  </div>
                </>
              ) : pendingPoint && placing === 'info' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className={sideLabel}>Punto de info nuevo</span>
                    <span className="font-display text-lg font-semibold text-gray-900">{activeNode.name}</span>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-700">Título</span>
                    <input value={infoTitle} onChange={e => setInfoTitle(e.target.value)} placeholder="Terminaciones" className={field} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-700">Descripción (opcional)</span>
                    <input value={infoDesc} onChange={e => setInfoDesc(e.target.value)} placeholder="Piso de porcelanato" className={field} />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={confirmAddInfo} disabled={!infoTitle || saving} className="flex-1 min-h-[44px] rounded-[10px] bg-gray-900 text-white text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-400">Agregar punto</button>
                    <button type="button" onClick={cancelPending} className="min-h-[44px] px-3 text-sm text-gray-700">Cancelar</button>
                  </div>
                </>
              ) : selectedLink && selectedLinkIndex !== null ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className={sideLabel}>Punto de paso</span>
                      <span className="font-display text-lg font-semibold text-gray-900 truncate">{activeNode.name} → {nodeName(selectedLink.targetNodeId)}</span>
                    </div>
                    <button type="button" onClick={() => setSelectedLinkIndex(null)} aria-label="Volver a la escena" className="w-9 h-9 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100">✕</button>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-700">Etiqueta</span>
                    <input key={`label-${activeNode.id}-${selectedLinkIndex}`} defaultValue={selectedLink.label ?? ''} placeholder={nodeName(selectedLink.targetNodeId)}
                      onBlur={e => { if (e.target.value !== (selectedLink.label ?? '')) handleUpdateLinkHotspot(selectedLinkIndex, { label: e.target.value }); }}
                      className={field} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-700">Lleva a</span>
                    <select value={selectedLink.targetNodeId} onChange={e => handleUpdateLinkHotspot(selectedLinkIndex, { targetNodeId: e.target.value })} className={field}>
                      {addLinkTargetOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </label>
                  {orphanWarning}
                  <button type="button" onClick={async () => { await handleDeleteLinkHotspot(selectedLinkIndex); setSelectedLinkIndex(null); }}
                    className="self-start min-h-[40px] text-[13px] font-semibold text-red-700 hover:text-red-800">Borrar punto</button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className={sideLabel}>Escena {tour.nodes.findIndex(n => n.id === activeNode.id) + 1} de {tour.nodes.length}</span>
                    <input
                      aria-label="Nombre de la escena"
                      value={selName}
                      onChange={e => setSelName(e.target.value)}
                      onBlur={() => { if (selName.trim() && selName !== activeNode.name) handleRenameNode(activeNode.id, selName.trim()); else setSelName(activeNode.name); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className={`${field} font-semibold`}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className={sideLabel}>Puntos de paso · {(activeNode.linkHotspots ?? []).length}</span>
                    {(activeNode.linkHotspots ?? []).length === 0 ? (
                      <p className="m-0 text-xs text-gray-600">Todavía no hay salidas desde acá. Usá “+ Punto de paso” y tocá la puerta en la panorámica.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {(activeNode.linkHotspots ?? []).map((h, i) => (
                          <button key={`link-${i}`} type="button" onClick={() => { setSelectedLinkIndex(i); cancelPending(); }}
                            className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-[10px] border border-gray-200 bg-white text-left hover:border-gray-300">
                            <span aria-hidden className="w-6 h-6 rounded-full border-2 border-gray-900 flex items-center justify-center text-[11px]">→</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-semibold text-gray-900 truncate">{nodeName(h.targetNodeId)}</span>
                              {h.label && h.label !== nodeName(h.targetNodeId) && <span className="block text-[11px] text-gray-500 truncate">“{h.label}”</span>}
                            </span>
                            <span className="text-[11px] text-gray-500">Editar</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {(activeNode.infoHotspots ?? []).length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className={sideLabel}>Puntos de info · {(activeNode.infoHotspots ?? []).length}</span>
                      {(activeNode.infoHotspots ?? []).map((h, i) => (
                        <div key={`info-${i}`} className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-[10px] border border-gray-200 bg-white">
                          <span aria-hidden className="w-6 h-6 rounded-full bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center">i</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-semibold text-gray-900 truncate">{h.title}</span>
                            {h.description && <span className="block text-[11px] text-gray-500 truncate">{h.description}</span>}
                          </span>
                          <button type="button" onClick={() => handleDeleteInfoHotspot(i)} aria-label={`Quitar ${h.title}`} className="w-8 h-8 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {orphanWarning}

                  <div className="flex flex-col gap-2">
                    <span className={sideLabel}>Panorámica</span>
                    {replacingImage ? (
                      <div className="flex flex-col gap-2">
                        <ImageUploader value={activeNode.imageUrl} onChange={url => handleReplaceImage(activeNode.id, url)} folder="tours" />
                        <button type="button" onClick={() => setReplacingImage(false)} className="self-start min-h-[32px] text-xs text-gray-600 hover:text-gray-900">Cancelar</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setReplacingImage(true)} className="self-start min-h-[36px] text-[13px] font-semibold text-gray-900 underline underline-offset-2">Reemplazar panorámica</button>
                    )}
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className={sideLabel}>Texto en el visor</span>
                    <textarea
                      value={selNote}
                      onChange={e => setSelNote(e.target.value)}
                      onBlur={() => { if (selNote !== (activeNode.note ?? '')) handleSetNote(activeNode.id, selNote); }}
                      rows={2}
                      placeholder="Opcional — cartel corto que aparece al entrar."
                      className={`${field} py-2.5 resize-y`}
                    />
                  </label>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => handleSetInitial(activeNode.id)}
                      disabled={tour.initialNodeId === activeNode.id}
                      className={`min-h-[40px] px-3 rounded-[10px] text-[13px] font-semibold whitespace-nowrap ${tour.initialNodeId === activeNode.id ? 'bg-brand-100 text-brand-800' : 'border border-gray-300 bg-white text-gray-900 hover:border-gray-400'}`}
                    >
                      {tour.initialNodeId === activeNode.id ? '★ Escena inicial' : 'Marcar como inicial'}
                    </button>
                    <button type="button" onClick={() => handleDeleteNode(activeNode.id)} className="min-h-[40px] px-3 text-[13px] font-semibold whitespace-nowrap text-red-700 hover:text-red-800">Borrar escena</button>
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
        </>
      )}

      {previewing && (
        <div className="fixed inset-0 z-[200] bg-black">
          <button
            onClick={() => setPreviewing(false)}
            aria-label="Cerrar vista previa"
            className="absolute top-4 right-4 z-[210] w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white backdrop-blur transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
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
        className="w-full min-h-[52px] flex items-center justify-center gap-1.5 rounded-xl px-3 border border-dashed border-gray-300 text-[13px] font-medium text-gray-700 hover:border-gray-400 hover:text-gray-900 transition-colors"
      >
        + Panorámicas 2:1
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
