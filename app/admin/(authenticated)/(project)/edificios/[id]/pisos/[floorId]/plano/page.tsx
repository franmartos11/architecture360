'use client';

import { useState, useEffect, use, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FloorUnitsDelimiter from '@/components/admin/FloorUnitsDelimiter';
import FloorParkingDelimiter from '@/components/admin/FloorParkingDelimiter';
import FloorAmenitiesDelimiter from '@/components/admin/FloorAmenitiesDelimiter';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement, unitAgreement } from '@/lib/project-types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { FloorKind } from '@/types';

import { pluralize } from '@/lib/units';
type UnitRow = Pick<DbUnitRow, 'id' | 'code'>;

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

export default function AdminFloorPlanPolygonsPage({ params }: { params: Promise<{ id: string; floorId: string }> }) {
  const { id: buildingId, floorId } = use(params);
  const typeConfig = useProjectTypeConfig();
  const { hasUnitStep, hasFloorStep, buildingLabel, unitLabel, unitIsLand } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  // casa: el edificio ES la unidad — no hay "unidades en el piso" que
  // delimitar, solo el plano y los ambientes de esa casa.
  const isSingleHouse = !hasFloorStep && !hasUnitStep;

  const [buildingName, setBuildingName] = useState('');
  const [floorLabel, setFloorLabel] = useState('');
  const [floorKind, setFloorKind] = useState<FloorKind>('units');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'deptos' | 'ambientes' | 'cocheras' | 'amenities'>('deptos');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => res.json()),
    ]).then(([buildingData, unitsData]) => {
      setBuildingName(buildingData.building?.name ?? '');
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setFloorLabel(floor?.label ?? '');
      // Un piso de tipo Cochera no se delimita por unidades ni por ambientes:
      // lo que se marca sobre su plano son las cocheras de deptos de otros
      // pisos. Por eso arranca directo en esa vista. En un loteo esto queda
      // sin efecto (ver el render más abajo): unitIsLand le gana a esta
      // vista porque un loteo no tiene cocheras que marcar.
      const kind: FloorKind = floor?.floor_kind ?? 'units';
      setFloorKind(kind);
      if (kind === 'parking') setView('cocheras');
      if (kind === 'amenity') setView('amenities');
      const list: UnitRow[] = Array.isArray(unitsData) ? unitsData : [];
      setUnits(list);
      if (list.length > 0) setActiveId(prev => prev ?? list[0].id);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoadError(true);
      setLoading(false);
    });
  }, [buildingId, floorId]);

  if (loading) return <LoadingSpinner text="Cargando plano..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano." />;

  // ── casa: directo al plano + ambientes de la única unidad ──────────
  if (isSingleHouse) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="inline-flex items-center min-h-[28px] text-[13px] text-gray-600 hover:text-gray-900">← Datos {agree.del} {buildingLabel.toLowerCase()}</Link>
          <h1 className="m-0 mt-2 text-[34px] sm:text-[44px] leading-[1.05] font-semibold text-gray-900">Plano y ambientes</h1>
          <p className="m-0 mt-2.5 text-sm leading-relaxed text-gray-600 max-w-[760px]">
            Subí el plano 2D de cada planta y marcá el contorno de cada ambiente. En <strong>Rectángulo</strong> arrastrá de esquina a esquina; en <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá <strong>Listo</strong> (o Escape) cuando terminaste. Cada cambio se guarda solo.
          </p>
        </div>
        {units.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-10 text-center text-[13px] text-gray-600">
            No se encontró la unidad de {agree.esta} {buildingLabel.toLowerCase()} — probá recargar.
          </div>
        ) : (
          <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={units[0].id} />
        )}
      </div>
    );
  }

  // Piso de cocheras: lo que se marca sobre su plano son las cocheras de
  // deptos de otros pisos, así que las dos vistas de siempre (delimitar
  // unidades del piso y sus ambientes) no aplican y se reemplaza el
  // contenido. Solo si igual tiene unidades propias cargadas se mantienen
  // como solapas, para no dejar esos datos sin pantalla.
  const isParking = floorKind === 'parking';
  const showTabs = !unitIsLand && (!isParking || units.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="self-start inline-flex items-center min-h-[28px] text-[13px] text-gray-600 hover:text-gray-900">← Volver al piso</Link>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">{buildingName} · {floorLabel}</p>
        {isParking && !unitIsLand ? (
          <>
            <h1 className="m-0 text-[34px] sm:text-[44px] leading-[1.05] font-semibold text-gray-900">Cocheras en el plano</h1>
            <p className="m-0 text-sm leading-relaxed text-gray-600 max-w-[760px]">
              Tocá <strong>Agregar cochera</strong>, marcá el espacio sobre el plano y elegí de qué {unitLabelLower} es — podés cargar todas las de este subsuelo de una sentada. En <strong>Rectángulo</strong> arrastrá de una esquina a la otra; en <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá <strong>Listo</strong> (o Escape) cuando terminaste. El desplegable incluye {pluralize(unitLabelLower)} de todos los pisos del edificio, porque la cochera del subsuelo es de un depto de arriba.
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-[34px] sm:text-[44px] leading-[1.05] font-semibold text-gray-900">Planta y delimitación</h1>
            <p className="m-0 text-sm leading-relaxed text-gray-600 max-w-[760px]">
              Elegí {uAgree.un} {unitLabelLower} de la lista y marcá su contorno sobre el plano. El pin con el nombre se ubica solo en el centro; con <strong>Mover pin</strong> lo cambiás de lugar. Así el comprador toca su {unitLabelLower} en el plano del sitio.
            </p>
          </>
        )}
      </div>

      {/* Un lote no tiene "ambientes" — solo se delimita su silueta. El resto
          de los tipos sí (deptos, dúplex): solapa aparte para eso. */}
      {showTabs && (
        <div role="tablist" aria-label="Qué se marca" className="flex items-center gap-0.5 bg-[#EAE7E0] rounded-[10px] p-[3px] w-fit max-w-full overflow-x-auto">
          {isParking && (
            <button
              onClick={() => setView('cocheras')}
              role="tab" aria-selected={view === 'cocheras'} className={`min-h-[36px] px-3.5 rounded-lg text-[13px] whitespace-nowrap ${view === 'cocheras' ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Cocheras
            </button>
          )}
          <button
            onClick={() => setView('deptos')}
            role="tab" aria-selected={view === 'deptos'} className={`min-h-[36px] px-3.5 rounded-lg text-[13px] whitespace-nowrap ${view === 'deptos' ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {pluralize(unitLabel)}{hasFloorStep ? ' en el piso' : ''}
          </button>
          <button
            onClick={() => setView('amenities')}
            role="tab" aria-selected={view === 'amenities'} className={`min-h-[36px] px-3.5 rounded-lg text-[13px] whitespace-nowrap ${view === 'amenities' ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Amenities
          </button>
          <button
            onClick={() => setView('ambientes')}
            role="tab" aria-selected={view === 'ambientes'} className={`min-h-[36px] px-3.5 rounded-lg text-[13px] whitespace-nowrap ${view === 'ambientes' ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Ambientes
          </button>
        </div>
      )}

      {unitIsLand ? (
        // Un loteo no tiene vista de cocheras (showTabs ya la esconde
        // arriba): si un piso igual quedó marcado como Cochera, esta rama
        // tiene que ganarle a `view === 'cocheras'` para no dejar sin
        // pantalla la delimitación de los lotes propios de ese piso.
        <FloorUnitsDelimiter buildingId={buildingId} floorId={floorId} />
      ) : view === 'cocheras' ? (
        <FloorParkingDelimiter buildingId={buildingId} floorId={floorId} />
      ) : view === 'amenities' ? (
        <FloorAmenitiesDelimiter buildingId={buildingId} floorId={floorId} />
      ) : view === 'deptos' ? (
        <FloorUnitsDelimiter buildingId={buildingId} floorId={floorId} />
      ) : units.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-10 text-center text-[13px] text-gray-600">
          Este piso todavía no tiene {pluralize(unitLabelLower)} — cargalas primero en la pestaña de {pluralize(unitLabel)}.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {units.map((u, i) => {
              const isActive = u.id === activeId;
              return (
                <button
                  key={u.id}
                  onClick={() => setActiveId(u.id)}
                  className={`flex items-center gap-2 shrink-0 min-h-[40px] px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${
                    isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  {u.code}
                </button>
              );
            })}
          </div>
          {activeId && <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={activeId} />}
        </div>
      )}
    </div>
  );
}
