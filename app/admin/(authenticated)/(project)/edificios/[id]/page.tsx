'use client';

import { useState, useEffect, useRef, use, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { PageHeader, StatStrip, btnPrimary } from '@/components/admin/panel-ui';
import ImageUploader from '@/components/admin/ImageUploader';
import { PageSkeleton, SkeletonStatStrip, SkeletonCard } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import FloorsEditor, { type FloorUnitSummary } from '@/components/admin/FloorsEditor';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement, unitAgreement } from '@/lib/project-types';
import type { BuildingRow as DbBuildingRow, FloorRow as DbFloorRow } from '@/types/database';

import { pluralize } from '@/lib/units';
type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors' | 'cover_image'>;
type FloorRow = Pick<DbFloorRow, 'id' | 'number' | 'label' | 'plan_image' | 'floor_kind' | 'floor_kind_description'>;

export default function AdminBuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  // casa: el edificio ES la unidad — no hay "datos del edificio" aparte de
  // los datos de la casa, así que se entra derecho a ese editor.
  const isSingleHouse = !hasFloorStep && !hasUnitStep;
  const agree = buildingAgreement(typeConfig);
  const uAgree = unitAgreement(typeConfig);
  const buildingLabelLower = buildingLabel.toLowerCase();
  const unitLabelLower = unitLabel.toLowerCase();

  const [building, setBuilding] = useState<BuildingRow | null>(null);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [unitSummaries, setUnitSummaries] = useState<FloorUnitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [buildingTab, setBuildingTab] = useState('datos');
  const initialLoadDone = useRef(false);
  const toast = useToast();

  const load = (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      startTransition(() => {
        setLoading(true);
        setLoadError(false);
      });
    }
    fetch(`/api/admin/buildings/${id}`)
      .then(res => res.json())
      .then(data => {
        setBuilding(data.building);
        if (!initialLoadDone.current) {
          initialLoadDone.current = true;
          setBuildingTab(prev => (prev === 'datos' && data.building?.cover_image ? '' : prev));
        }
        setFloors(data.floors ?? []);
        setUnitSummaries(data.units ?? []);
        if (!opts.silent) setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (!opts.silent) { setLoadError(true); setLoading(false); }
      });
  };

  useEffect(load, [id]);

  useEffect(() => {
    if (isSingleHouse && floors[0]) router.replace(`/admin/edificios/${id}/pisos/${floors[0].id}`);
  }, [isSingleHouse, floors, id, router]);

  const completeness = (floorId: string) => {
    const floorUnits = unitSummaries.filter(u => u.floor_id === floorId);
    const missingPhoto = floorUnits.filter(u => !u.interior_image_url).length;
    // En modo showcase el precio no es un dato que vaya a cargarse nunca —
    // contarlo como "faltante" mostraba "Sin precio" en todas partes y
    // nunca dejaba llegar a "Completo" aunque el resto sí estuviera.
    const missingPrice = typeConfig.showPrice ? floorUnits.filter(u => u.price == null).length : 0;
    return { total: floorUnits.length, missingPhoto, missingPrice };
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building) return;
    setSaving(true);
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: building.name, totalFloors: building.total_floors, coverImage: building.cover_image }),
    });
    setSaving(false);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
  };

  // La foto se guarda sola apenas termina de subir — antes quedaba solo en
  // el estado local hasta apretar "Guardar", así que si alguien subía la
  // foto y se iba de la página (o la cerraba) sin tocar ese botón, el
  // archivo quedaba huérfano en el storage y el edificio seguía sin
  // portada, sin ningún aviso de que se había perdido.
  const handleCoverImageChange = async (url: string) => {
    setBuilding(prev => (prev ? { ...prev, cover_image: url } : prev));
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverImage: url }),
    });
    if (res.ok) toast('Foto guardada.'); else toast('Error al guardar la foto.', 'error');
  };

  const handleUpdateFloor = async (floorId: string, updates: Partial<FloorRow>) => {
    const res = await fetch(`/api/admin/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: updates.label,
        planImage: updates.plan_image,
        floorKind: updates.floor_kind,
        floorKindDescription: updates.floor_kind_description,
      }),
    });
    if (res.ok) {
      setFloors(prev => prev.map(f => (f.id === floorId ? { ...f, ...updates } : f)));
    } else {
      toast('Error al actualizar el piso.', 'error');
    }
  };

  // Stats agregados y el "gap" entre lo declarado y lo cargado — se derivan
  // acá mismo de floors/unitSummaries, sin pedir nada nuevo al server.
  const floorsWithPlan = floors.filter(f => f.plan_image).length;
  const totalUnits = unitSummaries.length;
  const readyFloors = floors.filter(f => f.plan_image && unitSummaries.some(u => u.floor_id === f.id)).length;
  const missingFloors = Math.max(0, (building?.total_floors ?? 0) - floors.length);
  const floorsWithoutPlan = floors.length - floorsWithPlan;

  const generateMissingFloors = async () => {
    if (missingFloors === 0) return;
    setGenerating(true);
    const start = floors.length ? Math.max(...floors.map(f => f.number)) : 0;
    for (let i = 1; i <= missingFloors; i++) {
      await fetch('/api/admin/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: id, number: start + i, label: `Planta ${start + i}` }),
      });
    }
    setGenerating(false);
    load();
  };

  if (loading) return (
    <PageSkeleton actions={1}>
      <SkeletonStatStrip count={3} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </PageSkeleton>
  );
  if (loadError || !building) return <ErrorState message={`No se pudo cargar ${hasFloorStep ? 'el edificio' : `${agree.el} ${buildingLabelLower}`}.`} onRetry={load} />;
  if (isSingleHouse) {
    return floors[0]
      ? (
        <PageSkeleton actions={1}>
          <SkeletonStatStrip count={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </PageSkeleton>
      )
      : <ErrorState message={`No se encontró el piso interno ${agree.del} ${buildingLabelLower} — probá recargar.`} onRetry={load} />;
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        back={<Link href="/admin/edificios" className="inline-flex items-center min-h-[28px] hover:text-gray-900">← {pluralize(buildingLabel)}</Link>}
        eyebrow={hasFloorStep ? 'Edificio' : buildingLabel}
        title={building.name}
        description={<span className="font-mono text-[13px] text-gray-500">/{building.slug}</span>}
        actions={hasFloorStep ? (
          <Link href={`/admin/edificios/${id}/recorrido`} className={btnPrimary}>
            Recorrido 360° de la torre →
          </Link>
        ) : undefined}
      />

      <Accordion value={buildingTab} onChange={setBuildingTab} collapsible>
        <AccordionItem
          value="datos"
          label={`Datos ${hasFloorStep ? 'del edificio' : `${agree.del} ${buildingLabelLower}`}`}
          status={building.cover_image ? 'complete' : 'partial'}
        >
          <form onSubmit={handleSaveBuilding} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <Input
                  label="Nombre"
                  value={building.name}
                  onChange={e => setBuilding({ ...building, name: e.target.value })}
                />
              </div>
              {hasFloorStep && (
                <div className="w-full sm:w-40">
                  <Input
                    label="Pisos declarados"
                    type="number" min={1}
                    value={building.total_floors}
                    onChange={e => setBuilding({ ...building, total_floors: Number(e.target.value) })}
                  />
                </div>
              )}
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
            <ImageUploader
              label={hasFloorStep ? 'Foto del edificio' : `Foto ${agree.del} ${buildingLabelLower}`}
              value={building.cover_image ?? ''}
              onChange={handleCoverImageChange}
              folder="buildings"
            />
            {hasFloorStep && (
              <p className="text-xs text-gray-500">
                &quot;Pisos declarados&quot; es solo informativo (para saber cuántos faltan cargar); los pisos reales del sitio son los de la tabla de abajo. La foto se guarda sola al subirla; nombre y pisos declarados necesitan &quot;Guardar&quot;.
              </p>
            )}
          </form>
        </AccordionItem>
      </Accordion>

      {hasFloorStep ? (
        <>
          <StatStrip stats={[
            { label: 'Pisos cargados', value: `${floors.length} / ${building.total_floors}`, hint: 'de los declarados', tone: floors.length < building.total_floors ? 'warn' : 'default' },
            { label: 'Pisos con plano', value: `${floorsWithPlan} / ${floors.length}`, hint: 'el sitio necesita el plano para mostrar los deptos', tone: floorsWithPlan < floors.length ? 'warn' : 'default' },
            { label: 'Unidades', value: String(totalUnits), hint: totalUnits ? `en ${readyFloors} pisos publicables` : 'todavía ninguna', tone: totalUnits === 0 ? 'warn' : 'default' },
          ]} />

          {(missingFloors > 0 || floorsWithoutPlan > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-[14px] px-4 py-3 flex items-center gap-3 flex-wrap">
              <p className="m-0 flex-1 min-w-[220px] text-[13px] text-amber-800">
                {missingFloors > 0
                  ? `Declaraste ${building.total_floors} pisos y tenés ${floors.length} cargados. Puedo crear los ${missingFloors} que faltan, vacíos y numerados.`
                  : `${floorsWithoutPlan} piso${floorsWithoutPlan === 1 ? '' : 's'} todavía no ${floorsWithoutPlan === 1 ? 'tiene' : 'tienen'} plano: el sitio no puede mostrar sus deptos hasta que lo subas.`}
              </p>
              {missingFloors > 0 && (
                <button
                  type="button" onClick={generateMissingFloors} disabled={generating}
                  className={`${btnPrimary} shrink-0`}
                >
                  {generating ? 'Creando...' : `Crear los ${missingFloors} pisos`}
                </button>
              )}
            </div>
          )}

          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">Pisos <span className="font-normal text-gray-600">— cada piso necesita su plano para que el sitio pueda mostrar los deptos</span></h2>
            </div>
            <Link
              href={`/admin/wizard?buildingId=${id}&step=piso`}
              className="min-h-[36px] flex items-center text-[13px] font-semibold text-gray-900 underline underline-offset-2 whitespace-nowrap shrink-0"
            >
              Usar el asistente →
            </Link>
          </div>

          <FloorsEditor
            buildingId={id}
            floors={floors}
            unitSummaries={unitSummaries}
            showPrice={typeConfig.showPrice}
            onChanged={() => load({ silent: true })}
          />
        </>
      ) : !hasUnitStep ? (
        // Cada building tiene un único piso interno invisible, y ese piso
        // una única unidad — la building ES la unidad (ver hasUnitStep en
        // lib/project-types.ts). Nada de plano de subdivisión ni tabla de
        // pisos acá: un link directo a los datos de esta casa.
        <Card>
          <CardHeader>
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-gray-900">Datos {agree.del} {buildingLabelLower}</h3>
              <p className="text-sm text-gray-500">Precio, fotos, ambientes y tour de {agree.esta} {buildingLabelLower}.</p>
            </div>
            {floors[0] && (
              <Link
                href={`/admin/edificios/${id}/pisos/${floors[0].id}`}
                className="min-h-[36px] flex items-center text-[13px] font-semibold text-gray-900 underline underline-offset-2 whitespace-nowrap shrink-0"
              >
                Editar →
              </Link>
            )}
          </CardHeader>
          <div className="p-6">
            {floors[0] ? (
              (() => {
                const c = completeness(floors[0].id);
                if (c.total === 0) return <p className="text-sm text-gray-400">Todavía no cargaste los datos {agree.del} {buildingLabelLower}.</p>;
                return (
                  <p className="text-sm text-gray-600">
                    {c.missingPhoto > 0 && <span className="text-amber-800">Sin foto</span>}
                    {c.missingPrice > 0 && <span className="text-amber-800">{c.missingPhoto > 0 ? ' · ' : ''}Sin precio</span>}
                    {c.missingPhoto === 0 && c.missingPrice === 0 && <span className="text-brand-800">Completo</span>}
                  </p>
                );
              })()
            ) : (
              <p className="text-sm text-gray-400">No se pudo encontrar el piso interno de {agree.esta} {buildingLabelLower} — probá recargar la página.</p>
            )}
          </div>
        </Card>
      ) : (
        // Sin pisos reales pero con varias unidades por building (loteo,
        // dúplex): el building tiene un único piso interno (creado solo al
        // crear la Etapa) — acá se edita directo su plano y se entra a
        // delimitar/cargar sus lotes, sin la tabla de pisos.
        <Card>
          <CardHeader>
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-gray-900">Plano de subdivisión</h3>
              <p className="text-sm text-gray-500">El plano sobre el que vas a delimitar cada {unitLabel.toLowerCase()}.</p>
            </div>
            {floors[0] && (
              <Link
                href={`/admin/edificios/${id}/pisos/${floors[0].id}`}
                className="min-h-[36px] flex items-center text-[13px] font-semibold text-gray-900 underline underline-offset-2 whitespace-nowrap shrink-0"
              >
                {pluralize(unitLabel)} →
              </Link>
            )}
          </CardHeader>
          <div className="p-6 space-y-4">
            {floors[0] ? (
              <>
                <ImageUploader
                  value={floors[0].plan_image ?? ''}
                  onChange={url => handleUpdateFloor(floors[0].id, { plan_image: url })}
                  folder="floorplans"
                />
                {(() => {
                  const c = completeness(floors[0].id);
                  if (c.total === 0) return <p className="text-sm text-gray-400">Todavía no hay {pluralize(unitLabelLower)} {uAgree.cargado}s.</p>;
                  return (
                    <p className="text-sm text-gray-600">
                      {c.total} {unitLabelLower}{c.total === 1 ? '' : 's'}
                      {c.missingPhoto > 0 && <span className="text-amber-800"> · {c.missingPhoto} sin foto</span>}
                      {c.missingPrice > 0 && <span className="text-amber-800"> · {c.missingPrice} sin precio</span>}
                      {c.missingPhoto === 0 && c.missingPrice === 0 && <span className="text-brand-800"> · Completo</span>}
                    </p>
                  );
                })()}
              </>
            ) : (
              <p className="text-sm text-gray-400">No se pudo encontrar el piso interno de {agree.esta} {buildingLabelLower} — probá recargar la página.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
