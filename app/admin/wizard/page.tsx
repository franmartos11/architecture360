'use client';

import { useState, useEffect, useCallback } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import FloorUnitsEditor from '@/components/admin/FloorUnitsEditor';
import FloorUnitsDelimiter from '@/components/admin/FloorUnitsDelimiter';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import DuplicateFloorModal from '@/components/admin/DuplicateFloorModal';
import ApplyTemplateModal from '@/components/admin/ApplyTemplateModal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Step = 'edificio' | 'piso' | 'unidades' | 'delimitacion' | 'ambientes';

const STEPS: { id: Step; label: string }[] = [
  { id: 'edificio', label: 'Edificio' },
  { id: 'piso', label: 'Piso' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'delimitacion', label: 'Delimitación' },
  { id: 'ambientes', label: 'Ambientes y Tour' },
];

const STORAGE_KEY = 'admin-wizard-state';

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

interface BuildingRow { id: string; slug: string; name: string; total_floors: number }
interface FloorRow { id: string; number: number; label: string; plan_image: string | null }
interface UnitRow { id: string; code: string }

type Screen = 'wizard' | 'continuar' | 'resumen';

export default function AdminWizardPage() {
  const [screen, setScreen] = useState<Screen>('wizard');
  const [step, setStep] = useState<Step>('edificio');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  const [newBuilding, setNewBuilding] = useState({ name: '', slug: '', totalFloors: 1 });
  const [creatingBuilding, setCreatingBuilding] = useState(false);

  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [newFloor, setNewFloor] = useState({ number: '', label: '', planImage: '' });
  const [creatingFloor, setCreatingFloor] = useState(false);

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);

  // Retoma donde quedó (o arranca de cero si es la primera vez).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.buildingId) setBuildingId(saved.buildingId);
      if (saved?.floorId) setFloorId(saved.floorId);
      if (saved?.step) setStep(saved.step);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ buildingId, floorId, step }));
  }, [buildingId, floorId, step]);

  const loadBuildings = useCallback(() => {
    setLoadingBuildings(true);
    fetch('/api/admin/buildings')
      .then(res => res.json())
      .then(data => {
        setBuildings(Array.isArray(data) ? data : []);
        setLoadingBuildings(false);
      })
      .catch(() => setLoadingBuildings(false));
  }, []);

  useEffect(loadBuildings, [loadBuildings]);

  const loadFloors = useCallback(() => {
    if (!buildingId) { setFloors([]); return; }
    setLoadingFloors(true);
    fetch(`/api/admin/buildings/${buildingId}`)
      .then(res => res.json())
      .then(data => {
        setFloors(Array.isArray(data.floors) ? data.floors : []);
        setLoadingFloors(false);
      })
      .catch(() => setLoadingFloors(false));
  }, [buildingId]);

  useEffect(loadFloors, [loadFloors]);

  // Se carga independiente del paso "Unidades" — si se retoma la carga
  // guiada directo en "Delimitación" o "Ambientes" (desde localStorage),
  // esos pasos igual necesitan saber qué unidades tiene el piso.
  const loadUnits = useCallback(() => {
    if (!floorId) { setUnits([]); return; }
    fetch(`/api/admin/units?floorId=${floorId}`)
      .then(res => res.json())
      .then(data => setUnits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [floorId]);

  useEffect(loadUnits, [loadUnits]);
  useEffect(() => setActiveUnitId(null), [floorId]);

  const selectedBuilding = buildings.find(b => b.id === buildingId) ?? null;
  const selectedFloor = floors.find(f => f.id === floorId) ?? null;

  const handleCreateBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuilding.name || !newBuilding.slug) return;
    setCreatingBuilding(true);
    const res = await fetch('/api/admin/buildings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBuilding),
    });
    setCreatingBuilding(false);
    if (res.ok) {
      const created = await res.json();
      setNewBuilding({ name: '', slug: '', totalFloors: 1 });
      loadBuildings();
      setBuildingId(created.id);
      setFloorId(null);
    }
  };

  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId || newFloor.number === '' || !newFloor.label) return;
    setCreatingFloor(true);
    const res = await fetch('/api/admin/floors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingId,
        number: Number(newFloor.number),
        label: newFloor.label,
        planImage: newFloor.planImage || null,
      }),
    });
    setCreatingFloor(false);
    if (res.ok) {
      const created = await res.json();
      setNewFloor({ number: '', label: '', planImage: '' });
      loadFloors();
      setFloorId(created.id);
    }
  };

  const handleUpdateFloorPlan = async (url: string) => {
    if (!floorId) return;
    setFloors(prev => prev.map(f => (f.id === floorId ? { ...f, plan_image: url } : f)));
    await fetch(`/api/admin/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planImage: url }),
    });
  };

  const stepIndex = STEPS.findIndex(s => s.id === step);
  const canGoNext =
    (step === 'edificio' && !!buildingId) ||
    (step === 'piso' && !!floorId) ||
    step === 'unidades' ||
    step === 'delimitacion' ||
    step === 'ambientes';

  const goNext = () => {
    if (step === 'ambientes') { setScreen('continuar'); return; }
    setStep(STEPS[stepIndex + 1].id);
  };
  const goPrev = () => {
    if (stepIndex === 0) return;
    setStep(STEPS[stepIndex - 1].id);
  };
  // El botón del stepper ya viene deshabilitado (ver isReachable) cuando
  // todavía no hay edificio/piso elegido — acá solo hace falta cambiar el paso.
  const goToStep = (target: Step) => setStep(target);

  const startAnotherFloor = () => {
    setFloorId(null);
    setStep('piso');
    setScreen('wizard');
  };
  const startAnotherBuilding = () => {
    setBuildingId(null);
    setFloorId(null);
    setStep('edificio');
    setScreen('wizard');
  };
  const finishAndReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setScreen('resumen');
  };

  if (screen === 'continuar') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-10">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">¿Qué seguís cargando?</h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedBuilding?.name} {selectedFloor ? `· ${selectedFloor.label}` : ''} — lo que cargaste ya está guardado.
          </p>
        </div>
        <div className="grid gap-3">
          {selectedFloor && (
            <button
              onClick={() => setShowDuplicateModal(true)}
              className="text-left p-5 bg-brand-50 rounded-2xl border-2 border-brand-200 hover:border-brand-400 hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-gray-900">📋 Duplicar {selectedFloor.label} a otros pisos</p>
              <p className="text-sm text-gray-600 mt-1">¿El mismo layout se repite en varios pisos de esta torre? Cloná {selectedFloor.label} (unidades, delimitación, ambientes y tour incluidos) a un rango de pisos de una sola vez — no hace falta repetir los pasos anteriores.</p>
            </button>
          )}
          <button
            onClick={startAnotherFloor}
            className="text-left p-5 bg-white rounded-2xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all"
          >
            <p className="font-semibold text-gray-900">➕ Otro piso distinto en {selectedBuilding?.name}</p>
            <p className="text-sm text-gray-500 mt-1">Repetís el flujo completo (piso → unidades → delimitación → ambientes) para un piso con un layout distinto.</p>
          </button>
          <button
            onClick={startAnotherBuilding}
            className="text-left p-5 bg-white rounded-2xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all"
          >
            <p className="font-semibold text-gray-900">🏢 Otro edificio</p>
            <p className="text-sm text-gray-500 mt-1">Arrancás una torre nueva desde cero.</p>
          </button>
          <button
            onClick={finishAndReset}
            className="text-left p-5 bg-gray-900 rounded-2xl hover:bg-gray-800 transition-colors"
          >
            <p className="font-semibold text-white">✅ Por ahora terminé</p>
            <p className="text-sm text-gray-300 mt-1">Ver qué falta para el resto del proyecto (vista aérea, amenities, ubicación).</p>
          </button>
        </div>

        {showDuplicateModal && selectedFloor && (
          <DuplicateFloorModal
            floor={selectedFloor}
            onClose={() => setShowDuplicateModal(false)}
            onDone={() => setShowDuplicateModal(false)}
          />
        )}
      </div>
    );
  }

  if (screen === 'resumen') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-10">
        <div className="text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Estructura del edificio cargada</h2>
          <p className="text-sm text-gray-500 mt-1">Para terminar de preparar el proyecto para publicar, te falta esto — cada uno es una sola pantalla, no hace falta repetir el wizard:</p>
        </div>
        <div className="grid gap-3">
          <Link href="/admin/proyecto" className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-400 transition-colors">
            <p className="font-medium text-gray-900">Vista aérea, Amenities, Ubicación</p>
            <p className="text-sm text-gray-500">Desde "Proyecto" accedés a las tres — vista aérea (dónde está cada edificio), amenities y puntos de interés.</p>
          </Link>
          <Link href="/admin/edificios" className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-400 transition-colors">
            <p className="font-medium text-gray-900">Seguir cargando edificios</p>
            <p className="text-sm text-gray-500">Volvés a la lista de edificios — desde ahí podés reabrir la carga guiada cuando quieras.</p>
          </Link>
        </div>
        <div className="text-center pt-4">
          <Link href="/admin" className="text-sm text-brand-600 hover:text-brand-700 font-medium">Ir al Dashboard →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Carga guiada</h2>
        <p className="text-sm text-gray-500 mt-1">Cargá un edificio completo paso a paso — datos e imágenes juntos, en el orden en que se necesitan.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = i < stepIndex;
          const isReachable =
            s.id === 'edificio' ||
            (s.id === 'piso' && !!buildingId) ||
            (['unidades', 'delimitacion', 'ambientes'].includes(s.id) && !!floorId);
          return (
            <button
              key={s.id}
              onClick={() => isReachable && goToStep(s.id)}
              disabled={!isReachable}
              className={`flex items-center gap-2 shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive ? 'bg-gray-900 text-white' : isDone ? 'text-brand-700 hover:bg-brand-50' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                isActive ? 'bg-white text-gray-900' : isDone ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {isDone ? '✓' : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
        {(buildingId || floorId) && (
          <button
            onClick={() => { setBuildingId(null); setFloorId(null); setStep('edificio'); localStorage.removeItem(STORAGE_KEY); }}
            className="ml-auto shrink-0 text-xs text-gray-400 hover:text-red-500 px-2"
          >
            Reiniciar
          </button>
        )}
      </div>

      {/* Step content */}
      <div>
        {step === 'edificio' && (
          <div className="space-y-4">
            {loadingBuildings ? (
              <LoadingSpinner text="Cargando edificios..." tone="light" />
            ) : buildings.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {buildings.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setBuildingId(b.id); setFloorId(null); }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      buildingId === b.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Todavía no hay edificios — creá el primero abajo.</p>
            )}

            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">+ Crear edificio nuevo</h3></CardHeader>
              <form onSubmit={handleCreateBuilding} className="p-5 flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <Input
                    label="Nombre" value={newBuilding.name}
                    onChange={e => setNewBuilding({ ...newBuilding, name: e.target.value })}
                    placeholder="Torre D" required
                  />
                </div>
                <div className="flex-1 w-full">
                  <Input
                    label="Slug (URL)" value={newBuilding.slug}
                    onChange={e => setNewBuilding({ ...newBuilding, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    placeholder="torre-d" className="font-mono text-sm" required
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Input
                    label="Pisos" type="number" min={1} value={newBuilding.totalFloors}
                    onChange={e => setNewBuilding({ ...newBuilding, totalFloors: Number(e.target.value) })}
                  />
                </div>
                <Button type="submit" disabled={creatingBuilding} className="w-full sm:w-auto">
                  {creatingBuilding ? 'Creando...' : '+ Crear'}
                </Button>
              </form>
            </Card>
          </div>
        )}

        {step === 'piso' && buildingId && (
          <div className="space-y-4">
            {loadingFloors ? (
              <LoadingSpinner text="Cargando pisos..." tone="light" />
            ) : floors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {floors.sort((a, b) => a.number - b.number).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFloorId(f.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      floorId === f.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {f.label} {!f.plan_image && <span className="text-amber-500">·sin plano</span>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Este edificio todavía no tiene pisos — creá el primero abajo.</p>
            )}

            {selectedFloor && (
              <Card>
                <CardHeader><h3 className="text-sm font-semibold text-gray-900">Plano de {selectedFloor.label}</h3></CardHeader>
                <div className="p-5">
                  <ImageUploader value={selectedFloor.plan_image ?? ''} onChange={handleUpdateFloorPlan} folder="floorplans" />
                  <p className="text-xs text-gray-400 mt-2">Este es el plano sobre el que vas a delimitar los deptos en el paso "Delimitación".</p>
                </div>
              </Card>
            )}

            {selectedFloor && units.length === 0 && floors.length > 1 && (
              <button
                onClick={() => setShowApplyTemplateModal(true)}
                className="w-full text-left p-4 bg-brand-50 rounded-2xl border-2 border-brand-200 hover:border-brand-400 hover:shadow-sm transition-all"
              >
                <p className="font-semibold text-gray-900 text-sm">📋 Aplicar piso tipo de otro piso</p>
                <p className="text-sm text-gray-600 mt-1">¿{selectedFloor.label} tiene el mismo layout que otro piso ya cargado? Traé sus unidades (código re-numerado, delimitación, ambientes y tour) en vez de cargarlas desde cero.</p>
              </button>
            )}

            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">+ Crear piso nuevo</h3></CardHeader>
              <form onSubmit={handleCreateFloor} className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="w-full sm:w-24 shrink-0">
                    <Input type="number" placeholder="N°" value={newFloor.number} onChange={e => setNewFloor({ ...newFloor, number: e.target.value })} aria-label="Número de piso" />
                  </div>
                  <div className="flex-1">
                    <Input placeholder="Etiqueta (ej: Planta 1)" value={newFloor.label} onChange={e => setNewFloor({ ...newFloor, label: e.target.value })} aria-label="Etiqueta del piso" />
                  </div>
                  <Button type="submit" disabled={creatingFloor} className="w-full sm:w-auto">
                    {creatingFloor ? 'Creando...' : '+ Crear piso'}
                  </Button>
                </div>
                <ImageUploader value={newFloor.planImage} onChange={url => setNewFloor({ ...newFloor, planImage: url })} folder="floorplans" />
              </form>
            </Card>

            {showApplyTemplateModal && buildingId && selectedFloor && (
              <ApplyTemplateModal
                buildingId={buildingId}
                targetFloor={selectedFloor}
                onClose={() => setShowApplyTemplateModal(false)}
                onDone={() => { setShowApplyTemplateModal(false); loadUnits(); }}
              />
            )}
          </div>
        )}

        {step === 'unidades' && floorId && (
          <FloorUnitsEditor buildingId={buildingId ?? undefined} floorId={floorId} onUnitsChange={setUnits} />
        )}

        {step === 'delimitacion' && buildingId && floorId && (
          <FloorUnitsDelimiter buildingId={buildingId} floorId={floorId} />
        )}

        {step === 'ambientes' && buildingId && floorId && (
          units.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
              Este piso todavía no tiene unidades — volvé al paso "Unidades" para crear alguna.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {units.map((u, i) => {
                  const isActive = u.id === activeUnitId || (!activeUnitId && i === 0);
                  return (
                    <button
                      key={u.id}
                      onClick={() => setActiveUnitId(u.id)}
                      className={`flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      {u.code}
                    </button>
                  );
                })}
              </div>
              <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={activeUnitId ?? units[0].id} />
            </div>
          )
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={goPrev} disabled={stepIndex === 0}>← Anterior</Button>
        <Button onClick={goNext} disabled={!canGoNext}>
          {step === 'ambientes' ? 'Terminar este piso →' : 'Siguiente →'}
        </Button>
      </div>
    </div>
  );
}
