'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { TourData, TourNode } from '@/types';
import ImageUploader from './ImageUploader';

const TourNodeViewer = dynamic(() => import('./TourNodeViewer'), { ssr: false });

interface TourEditorProps {
  initialTourData: TourData | null;
  onPersist: (tourData: TourData) => Promise<boolean>;
}

const EMPTY_TOUR: TourData = { initialNodeId: '', nodes: [] };

function slugify(text: string): string {
  return (
    text
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'nodo'
  );
}

export default function TourEditor({ initialTourData, onPersist }: TourEditorProps) {
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

  const activeNode = tour.nodes.find(n => n.id === activeNodeId) ?? null;

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
    const id = slugify(newNodeName);
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

  const handleDeleteNode = async (id: string) => {
    if (!confirm('¿Borrar este nodo? Los hotspots de otros nodos que apunten acá van a quedar rotos.')) return;
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
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, linkHotspots: (n.linkHotspots ?? []).filter((_, i) => i !== index) } : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  const handleDeleteInfoHotspot = async (index: number) => {
    if (!activeNode) return;
    const nextNodes = tour.nodes.map(n =>
      n.id === activeNode.id ? { ...n, infoHotspots: (n.infoHotspots ?? []).filter((_, i) => i !== index) } : n
    );
    await persist({ ...tour, nodes: nextNodes });
  };

  return (
    <div className="space-y-6">
      {/* Nodos */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Ambientes / nodos del recorrido</h3>
          {message && <span className="text-sm font-medium text-green-600">{message}</span>}
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {tour.nodes.map(n => (
            <div
              key={n.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-sm cursor-pointer transition-colors
                ${activeNodeId === n.id ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}
              onClick={() => { setActiveNodeId(n.id); cancelPending(); }}
            >
              <span className="font-medium">{n.name}</span>
              {tour.initialNodeId === n.id && (
                <span className="text-[10px] uppercase tracking-wide bg-gray-900 text-white rounded-full px-2 py-0.5">inicial</span>
              )}
              {tour.initialNodeId !== n.id && (
                <button onClick={e => { e.stopPropagation(); handleSetInitial(n.id); }} className="text-[10px] text-gray-400 hover:text-gray-700">
                  marcar inicial
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); handleDeleteNode(n.id); }} className="text-gray-400 hover:text-red-500">×</button>
            </div>
          ))}
        </div>
        <div className="p-4 bg-gray-50/50 space-y-3">
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
        </div>
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
              {placing && <span className="text-xs text-gray-500">Hacé click sobre la panorámica para ubicarlo</span>}
            </div>

            <TourNodeViewer
              imageUrl={activeNode.imageUrl}
              linkHotspots={activeNode.linkHotspots ?? []}
              infoHotspots={activeNode.infoHotspots ?? []}
              placing={placing}
              onPlace={handlePlace}
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
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 text-sm">Hotspots de "{activeNode.name}"</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {(activeNode.linkHotspots ?? []).map((h, i) => (
                <div key={`link-${i}`} className="p-3 flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 truncate">→ {tour.nodes.find(n => n.id === h.targetNodeId)?.name ?? h.targetNodeId}</p>
                    {h.label && <p className="text-xs text-gray-400 truncate">{h.label}</p>}
                  </div>
                  <button onClick={() => handleDeleteLinkHotspot(i)} className="text-gray-400 hover:text-red-500 shrink-0">×</button>
                </div>
              ))}
              {(activeNode.infoHotspots ?? []).map((h, i) => (
                <div key={`info-${i}`} className="p-3 flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">i</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 truncate">{h.title}</p>
                    {h.description && <p className="text-xs text-gray-400 truncate">{h.description}</p>}
                  </div>
                  <button onClick={() => handleDeleteInfoHotspot(i)} className="text-gray-400 hover:text-red-500 shrink-0">×</button>
                </div>
              ))}
              {(activeNode.linkHotspots ?? []).length === 0 && (activeNode.infoHotspots ?? []).length === 0 && (
                <div className="p-6 text-center text-gray-400 text-sm">Todavía no hay hotspots en este ambiente.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Agregá el primer ambiente arriba para empezar a armar el recorrido.
        </div>
      )}
    </div>
  );
}
