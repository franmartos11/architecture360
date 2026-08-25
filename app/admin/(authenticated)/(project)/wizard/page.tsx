'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import FloorUnitsEditor from '@/components/admin/FloorUnitsEditor';
import FloorUnitsDelimiter from '@/components/admin/FloorUnitsDelimiter';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import DuplicateFloorModal from '@/components/admin/DuplicateFloorModal';
import ApplyTemplateModal from '@/components/admin/ApplyTemplateModal';
import LocationEditor from '@/components/admin/section-editors/LocationEditor';
import AmenitiesEditor from '@/components/admin/section-editors/AmenitiesEditor';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import { FLOOR_KIND_OPTIONS, FLOOR_KIND_ICON } from '@/lib/floorKinds';
import type { FloorKind } from '@/types';

type Step = 'edificio' | 'piso' | 'unidades' | 'delimitacion' | 'ambientes';

const STORAGE_KEY = 'admin-wizard-state';

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

interface BuildingRow { id: string; slug: string; name: string; total_floors: number }
interface FloorRow { id: string; number: number; label: string; plan_image: string | null; floor_kind: FloorKind; floor_kind_description: string | null }
interface UnitRow { id: string; code: string }

type Screen = 'wizard' | 'continuar' | 'proyecto' | 'resumen';
type ProjectStep = 'ubicacion' | 'amenities';

// Ubicación y Amenities son de nivel PROYECTO, no de este edificio/casa en
// particular — se cargan una sola vez, no una vez por edificio. Por eso
// viven en una pantalla propia entre "continuar" (¿seguís con otro
// edificio?) y "resumen" (listo), en vez de ser un paso más de STEPS.
const PROJECT_STEPS: { id: ProjectStep; label: string }[] = [
  { id: 'ubicacion', label: 'Ubicación' },
  { id: 'amenities', label: 'Amenities' },
];

export default function AdminWizardPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Cargando..." tone="light" />}>
      <AdminWizardPageInner />
    </Suspense>
  );
}

function AdminWizardPageInner() {
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const buildingLabelLower = buildingLabel.toLowerCase();
  const searchParams = useSearchParams();
  const deepLinkBuildingId = searchParams.get('buildingId');
  const deepLinkStep = searchParams.get('step') as Step | null;

  // Si el tipo de proyecto no tiene pisos reales (ej. un loteo, donde
  // cada building es una Etapa con un único plano de subdivisión), el
  // paso "Piso" no existe — se crea un piso único e invisible al crear
  // el building (ver handleCreateBuilding) y se salta directo a
  // "Unidades", relabeleado con el unitLabel del tipo (ej. "Lotes").
  //
  // Si encima el tipo no tiene paso de unidad propio (hoy: "casas" — el
  // building YA ES la unidad), "Delimitación" tampoco existe: no hay nada
  // que delimitar con una sola unidad por piso. El paso "unidades" se
  // mantiene (mismo id, para no bifurcar el resto del wizard) pero
  // relabeleado "Datos" — adentro, FloorUnitsEditor entra directo en modo
  // de un solo registro (ver ese componente).
  const STEPS: { id: Step; label: string }[] = hasFloorStep
    ? [
        { id: 'edificio', label: buildingLabel },
        { id: 'piso', label: 'Piso' },
        { id: 'unidades', label: `${unitLabel}s` },
        { id: 'delimitacion', label: 'Delimitación' },
        { id: 'ambientes', label: 'Ambientes y Tour' },
      ]
    : hasUnitStep
    ? [
        { id: 'edificio', label: buildingLabel },
        { id: 'unidades', label: `${unitLabel}s` },
        { id: 'delimitacion', label: 'Delimitación' },
        { id: 'ambientes', label: 'Ambientes y Tour' },
      ]
    : [
        { id: 'edificio', label: buildingLabel },
        { id: 'unidades', label: 'Datos' },
        { id: 'ambientes', label: 'Ambientes y Tour' },
      ];

  const [screen, setScreen] = useState<Screen>('wizard');
  const [step, setStep] = useState<Step>('edificio');
  const [projectStep, setProjectStep] = useState<ProjectStep>('ubicacion');
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  const [newBuilding, setNewBuilding] = useState({ name: '', totalFloors: 1, planImage: '' });
  const [creatingBuilding, setCreatingBuilding] = useState(false);

  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [newFloor, setNewFloor] = useState({ number: '', label: '', planImage: '', floorKind: 'units' as FloorKind, floorKindDescription: '' });
  const [creatingFloor, setCreatingFloor] = useState(false);

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);

  // Si llegamos con un link directo (ej: "Usar el asistente" desde un
  // edificio puntual), ese contexto manda por sobre cualquier sesión vieja
  // guardada en el navegador. Si no, retoma donde quedó la última vez.
  useEffect(() => {
    if (deepLinkBuildingId) {
      setBuildingId(deepLinkBuildingId);
      if (deepLinkStep) setStep(deepLinkStep);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.buildingId) setBuildingId(saved.buildingId);
      if (saved?.floorId) setFloorId(saved.floorId);
      if (saved?.step) setStep(saved.step);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // El estado guardado (localStorage o el link directo) puede referirse a
  // un edificio de OTRO proyecto — nada acá distingue de qué proyecto es.
  // En cuanto sabemos qué edificios tiene el proyecto activo, si el
  // guardado no pertenece a esta lista lo descartamos entero en vez de
  // arrastrar un id ajeno (que rompería la vista o, peor, terminaría
  // guardando pisos/unidades en el proyecto equivocado).
  const staleCheckedRef = useRef(false);
  useEffect(() => {
    if (loadingBuildings || staleCheckedRef.current) return;
    staleCheckedRef.current = true;
    if (buildingId && !buildings.some(b => b.id === buildingId)) {
      setBuildingId(null);
      setFloorId(null);
      setStep('edificio');
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [loadingBuildings, buildings, buildingId]);

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

  // Sin paso "Piso" no hay dónde elegirlo a mano — en cuanto se sabe qué
  // piso (único) tiene el building activo, se selecciona solo. Cubre
  // tanto elegir un building ya existente de la lista como, de rebote,
  // el que se acaba de crear (aunque ahí ya se setea explícito arriba).
  useEffect(() => {
    if (!hasFloorStep && floors.length > 0 && !floorId) {
      setFloorId(floors[0].id);
    }
  }, [hasFloorStep, floors, floorId]);

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
    if (!newBuilding.name) return;
    setCreatingBuilding(true);
    const res = await fetch('/api/admin/buildings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBuilding.name, totalFloors: newBuilding.totalFloors }),
    });
    if (!res.ok) { setCreatingBuilding(false); return; }
    const created = await res.json();

    if (hasFloorStep) {
      // Ya declaró "N pisos" al crear el edificio — los creamos ahora
      // mismo (Piso 1..N) en vez de mandarlo a repetir el alta uno por
      // uno; entra directo al paso "Piso" a completar cada uno (plano,
      // tipo, etc.), no a crearlos desde cero.
      const floorCount = Math.max(1, newBuilding.totalFloors || 1);
      const createdFloors = await Promise.all(
        Array.from({ length: floorCount }, (_, i) => i + 1).map(number =>
          fetch('/api/admin/floors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buildingId: created.id, number, label: `Piso ${number}` }),
          }).then(r => (r.ok ? r.json() : null))
        )
      );
      const firstFloor = createdFloors.filter((f): f is FloorRow => f !== null).sort((a, b) => a.number - b.number)[0];
      setFloorId(firstFloor?.id ?? null);
    } else {
      // Sin paso "Piso" — el building necesita igual un único piso interno
      // para poder colgarle unidades con su plano de delimitación, así
      // que se crea acá mismo, invisible para el usuario.
      const floorRes = await fetch('/api/admin/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: created.id, number: 1, label: 'Plano', planImage: newBuilding.planImage || null }),
      });
      if (floorRes.ok) {
        const createdFloor = await floorRes.json();
        setFloorId(createdFloor.id);
      }
    }

    setCreatingBuilding(false);
    setNewBuilding({ name: '', totalFloors: 1, planImage: '' });
    loadBuildings();
    setBuildingId(created.id);
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
        floorKind: newFloor.floorKind,
        floorKindDescription: newFloor.floorKindDescription || null,
      }),
    });
    setCreatingFloor(false);
    if (res.ok) {
      const created = await res.json();
      setNewFloor({ number: '', label: '', planImage: '', floorKind: 'units', floorKindDescription: '' });
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
    (step === 'edificio' && (hasFloorStep ? !!buildingId : !!buildingId && !!floorId)) ||
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
    setProjectStep('ubicacion');
    setScreen('proyecto');
  };

  if (screen === 'continuar') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-10">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">¿Qué seguís cargando?</h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedBuilding?.name} {hasFloorStep && selectedFloor ? `· ${selectedFloor.label}` : ''} — lo que cargaste ya está guardado.
          </p>
        </div>
        <div className="grid gap-3">
          {hasFloorStep && selectedFloor && (
            <button
              onClick={() => setShowDuplicateModal(true)}
              className="text-left p-5 bg-brand-50 rounded-2xl border-2 border-brand-200 hover:border-brand-400 hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-gray-900">📋 Duplicar {selectedFloor.label} a otros pisos</p>
              <p className="text-sm text-gray-600 mt-1">¿El mismo layout se repite en varios pisos de esta torre? Cloná {selectedFloor.label} (unidades, delimitación, ambientes y tour incluidos) a un rango de pisos de una sola vez — no hace falta repetir los pasos anteriores.</p>
            </button>
          )}
          {hasFloorStep && (
            <button
              onClick={startAnotherFloor}
              className="text-left p-5 bg-white rounded-2xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all"
            >
              <p className="font-semibold text-gray-900">➕ Otro piso distinto en {selectedBuilding?.name}</p>
              <p className="text-sm text-gray-500 mt-1">Repetís el flujo completo (piso → unidades → delimitación → ambientes) para un piso con un layout distinto.</p>
            </button>
          )}
          <button
            onClick={startAnotherBuilding}
            className="text-left p-5 bg-white rounded-2xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all"
          >
            <p className="font-semibold text-gray-900">{hasFloorStep ? '🏢 Otro edificio' : `➕ ${agree.Otro} ${buildingLabelLower}`}</p>
            <p className="text-sm text-gray-500 mt-1">{hasFloorStep ? 'Arrancás una torre nueva desde cero.' : `Arrancás ${agree.otro} ${buildingLabelLower} ${agree.nuevo} desde cero.`}</p>
          </button>
          <button
            onClick={finishAndReset}
            className="text-left p-5 bg-gray-900 rounded-2xl hover:bg-gray-800 transition-colors"
          >
            <p className="font-semibold text-white">✅ Por ahora terminé</p>
            <p className="text-sm text-gray-300 mt-1">Cargar la ubicación y los amenities del proyecto (una sola vez, no por {buildingLabelLower}).</p>
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

  if (screen === 'proyecto') {
    const projectStepIndex = PROJECT_STEPS.findIndex(s => s.id === projectStep);
    const isLastProjectStep = projectStepIndex === PROJECT_STEPS.length - 1;
    return (
      <div className="max-w-3xl mx-auto space-y-6 py-10">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Ya está la estructura — faltan dos cosas del proyecto</h2>
          <p className="text-sm text-gray-500 mt-1">
            Ubicación y Amenities no son de {agree.esta} {buildingLabelLower} en particular, sino de todo el proyecto — se cargan una sola vez, no en cada {buildingLabelLower}.
          </p>
        </div>

        <div className="flex items-center gap-1 justify-center">
          {PROJECT_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setProjectStep(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                s.id === projectStep ? 'bg-gray-900 text-white' : i < projectStepIndex ? 'text-brand-700 hover:bg-brand-50' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                s.id === projectStep ? 'bg-white text-gray-900' : i < projectStepIndex ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {i < projectStepIndex ? '✓' : i + 1}
              </span>
              {s.label}
            </button>
          ))}
        </div>

        <div>
          {projectStep === 'ubicacion' && <LocationEditor />}
          {projectStep === 'amenities' && <AmenitiesEditor />}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <button type="button" onClick={() => setScreen('resumen')} className="text-sm text-gray-400 hover:text-gray-600">
            Omitir y hacerlo después →
          </button>
          <Button onClick={() => (isLastProjectStep ? setScreen('resumen') : setProjectStep(PROJECT_STEPS[projectStepIndex + 1].id))}>
            {isLastProjectStep ? 'Terminar →' : 'Siguiente →'}
          </Button>
        </div>
      </div>
    );
  }

  if (screen === 'resumen') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-10">
        <div className="text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Proyecto listo para revisar</h2>
          <p className="text-sm text-gray-500 mt-1">Solo queda una cosa fuera de este asistente — cada una es una sola pantalla:</p>
        </div>
        <div className="grid gap-3">
          <Link href="/admin/proyecto" className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-400 transition-colors">
            <p className="font-medium text-gray-900">Vista aérea</p>
            <p className="text-sm text-gray-500">El carrusel que se ve al entrar al masterplan — se carga desde Proyecto.</p>
          </Link>
          <Link href="/admin/edificios" className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-brand-400 transition-colors">
            <p className="font-medium text-gray-900">Seguir cargando {buildingLabel.toLowerCase()}s</p>
            <p className="text-sm text-gray-500">Volvés a la lista — desde ahí podés reabrir la carga guiada cuando quieras.</p>
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
        <Link href="/admin/edificios" className="text-sm text-gray-500 hover:text-gray-700">← {buildingLabel}s</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Carga guiada</h2>
        <p className="text-sm text-gray-500 mt-1">
          Cargá {hasFloorStep ? 'un edificio completo' : `${agree.un} ${buildingLabelLower} ${agree.el === 'la' ? 'completa' : 'completo'}`} paso a paso — datos e imágenes juntos, en el orden en que se necesitan.
        </p>
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
              <LoadingSpinner text={`Cargando ${buildingLabel.toLowerCase()}s...`} tone="light" />
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
              <p className="text-sm text-gray-400">Todavía no hay {buildingLabel.toLowerCase()}s — creá el primero abajo.</p>
            )}

            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-gray-900">+ Crear {buildingLabelLower} {agree.nuevo}</h3></CardHeader>
              <form onSubmit={handleCreateBuilding} className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 w-full">
                    <Input
                      label="Nombre" value={newBuilding.name}
                      onChange={e => setNewBuilding({ ...newBuilding, name: e.target.value })}
                      placeholder={hasFloorStep ? 'Torre D' : `${buildingLabel} 1`} required
                    />
                  </div>
                  {hasFloorStep && (
                    <div className="w-full sm:w-28">
                      <Input
                        label="Pisos" type="number" min={1} value={newBuilding.totalFloors}
                        onChange={e => setNewBuilding({ ...newBuilding, totalFloors: Number(e.target.value) })}
                      />
                    </div>
                  )}
                  <Button type="submit" disabled={creatingBuilding} className="w-full sm:w-auto">
                    {creatingBuilding ? 'Creando...' : '+ Crear'}
                  </Button>
                </div>
                {!hasFloorStep && hasUnitStep && (
                  <ImageUploader
                    label="Plano de subdivisión (opcional, lo podés subir después)"
                    value={newBuilding.planImage}
                    onChange={url => setNewBuilding({ ...newBuilding, planImage: url })}
                    folder="floorplans"
                  />
                )}
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
                    {f.floor_kind !== 'units' && <span className="mr-1">{FLOOR_KIND_ICON[f.floor_kind]}</span>}
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
                  <p className="text-xs text-gray-400 mt-2">Este es el plano sobre el que vas a delimitar {unitLabel.toLowerCase()}s en el paso "Delimitación".</p>
                </div>
              </Card>
            )}

            {selectedFloor && selectedFloor.floor_kind === 'units' && units.length === 0 && floors.length > 1 && (
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
                  <div className="w-full sm:w-44 shrink-0">
                    <select
                      value={newFloor.floorKind}
                      onChange={e => setNewFloor({ ...newFloor, floorKind: e.target.value as FloorKind })}
                      aria-label="Tipo de piso"
                      className="w-full h-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                    >
                      {FLOOR_KIND_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" disabled={creatingFloor} className="w-full sm:w-auto">
                    {creatingFloor ? 'Creando...' : '+ Crear piso'}
                  </Button>
                </div>
                {newFloor.floorKind !== 'units' && (
                  <Input
                    placeholder="Qué hay en este piso (ej: Pileta y solárium)"
                    value={newFloor.floorKindDescription}
                    onChange={e => setNewFloor({ ...newFloor, floorKindDescription: e.target.value })}
                    aria-label="Descripción del tipo de piso"
                  />
                )}
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
              {selectedFloor && selectedFloor.floor_kind !== 'units'
                ? `Este piso es de tipo "${FLOOR_KIND_OPTIONS.find(o => o.value === selectedFloor.floor_kind)?.label}" y no tiene ${unitLabel.toLowerCase()}s — nada que hacer acá, podés terminar el piso.`
                : !hasUnitStep
                ? `Todavía no cargaste los datos de ${agree.esta} ${buildingLabelLower} — volvé al paso "Datos" para completarlos.`
                : `Este piso todavía no tiene ${unitLabel.toLowerCase()}s — volvé al paso "${unitLabel}s" para crear alguna.`}
            </div>
          ) : (
            <div className="space-y-5">
              {hasUnitStep && (
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
              )}
              <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={activeUnitId ?? units[0].id} />
            </div>
          )
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={goPrev} disabled={stepIndex === 0}>← Anterior</Button>
        <Button onClick={goNext} disabled={!canGoNext}>
          {step === 'ambientes' ? (hasFloorStep ? 'Terminar este piso →' : 'Terminar acá →') : 'Siguiente →'}
        </Button>
      </div>
    </div>
  );
}
