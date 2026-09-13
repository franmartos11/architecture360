'use client';

import { useState, useEffect, useMemo, useCallback, use, startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { getStatusLabel } from '@/lib/units';
import { toFormValues, toDbShape, type UnitFormValues } from '@/lib/unit-fields';
import { UNIT_GROUP_NAV, type UnitGroupStatus } from '@/components/admin/unit-groups/registry';
import { UnitShellContext } from './unit-shell-context';
import type { UnitRow as DbUnitRow } from '@/types/database';

type SiblingUnit = Pick<DbUnitRow, 'id' | 'code'>;
type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code'> & {
  building_name: string | null;
  floor_number: number | null;
};

const STATUS_DOT: Record<UnitGroupStatus, string> = {
  complete: 'bg-brand-500',
  partial: 'bg-amber-400',
  empty: 'bg-gray-200',
};

// Shell de .../unidades/[unitId]/ — carga la unidad UNA vez y la comparte
// por contexto con las sub-rutas (datos/superficies/comercial/fotos/
// planos/tour: ver UNIT_GROUP_NAV). Ambientes usa su propio fetch (ver
// unit-groups/registry.ts) así que no depende de este contexto.
export default function UnitShellLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; floorId: string; unitId: string }>;
}) {
  const { id: buildingId, floorId, unitId } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const typeConfig = useProjectTypeConfig();
  const { unitLabel, unitIsLand } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const uAgree = unitAgreement(typeConfig);
  const toast = useToast();

  const [unit, setUnit] = useState<DbUnitRow | null>(null);
  const [siblings, setSiblings] = useState<SiblingUnit[]>([]);
  const [otherUnits, setOtherUnits] = useState<OtherUnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState('Todo guardado');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  const load = useCallback(() => {
    startTransition(() => { setLoading(true); setLoadError(false); });
    Promise.all([
      fetch(`/api/admin/units/${unitId}`).then(res => { if (!res.ok) throw new Error('unit'); return res.json(); }),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => (res.ok ? res.json() : [])),
    ])
      .then(([unitData, floorUnits]: [DbUnitRow, SiblingUnit[]]) => {
        setUnit(unitData);
        setSiblings(Array.isArray(floorUnits) ? floorUnits : []);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoadError(true); setLoading(false); });
  }, [unitId, floorId]);

  useEffect(load, [load]);

  // Unidades de CUALQUIER otro piso/edificio del proyecto — para "copiar
  // de otro" (no aplica a lotes, cada uno es su propio terreno). Se pide
  // una sola vez por tipo de unidad, no en cada navegación entre unidades
  // (ver el filtro por unitId al construir las opciones más abajo).
  useEffect(() => {
    if (unitIsLand) return;
    fetch('/api/admin/units')
      .then(res => res.json())
      .then((data: OtherUnitRow[]) => setOtherUnits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [unitIsLand]);

  const copyOptions = useMemo(() => otherUnits.filter(u => u.id !== unitId), [otherUnits, unitId]);

  const patch = useCallback(async (updates: Partial<UnitFormValues>) => {
    setUnit(prev => (prev ? { ...prev, ...toDbShape(updates) } : prev));
    setSaving(true);
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    setSaving(false);
    if (res.ok) setSavedLabel('Guardado hace un instante');
    else { toast(`No se pudo guardar ${unitLabelLower}.`, 'error'); load(); }
    return res.ok;
  }, [unitId, unitLabelLower, toast, load]);

  const applicableGroups = useMemo(
    () => UNIT_GROUP_NAV.filter(g => g.applies(typeConfig)),
    [typeConfig],
  );

  const currentSlug = pathname.split('/').pop();

  // Si la URL apunta a un grupo que no aplica a este tipo de unidad (ej.
  // /tour en un lote), volvemos a /datos en vez de dejar una pantalla rota.
  useEffect(() => {
    if (!unit) return;
    const isKnownSlug = UNIT_GROUP_NAV.some(g => g.slug === currentSlug);
    const isApplicableSlug = applicableGroups.some(g => g.slug === currentSlug);
    if (isKnownSlug && !isApplicableSlug) {
      router.replace(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/datos`);
    }
  }, [unit, currentSlug, applicableGroups, router, buildingId, floorId, unitId]);

  const curIdx = siblings.findIndex(u => u.id === unitId);

  const goSibling = (dir: 1 | -1) => {
    const next = siblings[curIdx + dir];
    if (!next) return;
    const targetSlug = UNIT_GROUP_NAV.some(g => g.slug === currentSlug) ? currentSlug : 'datos';
    router.push(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${next.id}/${targetSlug}`);
  };

  const handleCopyFromUnit = async () => {
    if (!copySourceId) return;
    setCopying(true);
    const res = await fetch(`/api/admin/units/${copySourceId}`);
    if (!res.ok) {
      setCopying(false);
      toast(`No se pudo cargar el ${unitLabelLower} de referencia.`, 'error');
      return;
    }
    const source: DbUnitRow = await res.json();
    setCopying(false);
    const ok = await patch({
      modelName: source.model_name, type: source.type, totalArea: source.total_area, innerArea: source.inner_area,
      balconyArea: source.balcony_area, externalArea: source.external_area, bedrooms: source.bedrooms, bathrooms: source.bathrooms,
      hasServiceRoom: source.has_service_room, price: source.price, currency: source.currency, status: source.status,
      orientation: source.orientation, floorPlan3dUrl: source.floor_plan_3d_url, plan3dUrl: source.plan_3d_url, technicalPlanUrl: source.technical_plan_url,
    });
    if (ok) setFormVersion(v => v + 1);
    setCopySourceId('');
    setCopyOpen(false);
  };

  if (loading) return <LoadingSpinner text={`Cargando ${unitLabelLower}...`} tone="light" />;
  if (loadError || !unit) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver a {unitLabelLower}s
        </Link>
        <ErrorState message={`No se pudo cargar ${uAgree.el} ${unitLabelLower}.`} onRetry={load} />
      </div>
    );
  }

  const values = toFormValues(unit);
  const planoHref = `/admin/edificios/${buildingId}/pisos/${floorId}/plano`;
  const delimited = !!unit.polygon && unit.polygon.length > 0;

  return (
    <UnitShellContext.Provider value={{ unit, values, patch }}>
      <div className="flex flex-col gap-4">
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Volver a {unitLabelLower}s
        </Link>

        <Card className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">{unitLabel} {unit.code}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {curIdx >= 0 ? `${curIdx + 1} de ${siblings.length} · ` : ''}{getStatusLabel(unit.status).toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-xs text-gray-400 shrink-0">{saving ? 'Guardando...' : savedLabel}</p>
            {!unitIsLand && copyOptions.length > 0 && (
              <button
                type="button" onClick={() => setCopyOpen(o => !o)}
                className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${copyOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'}`}
              >
                Copiar de otro {unitLabelLower}…
              </button>
            )}
            <button
              type="button" onClick={() => goSibling(-1)} disabled={curIdx <= 0}
              aria-label={`${unitLabel} anterior`}
              className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 disabled:opacity-30 transition-colors"
            >
              ←
            </button>
            <button
              type="button" onClick={() => goSibling(1)} disabled={curIdx === -1 || curIdx >= siblings.length - 1}
              className="h-8 px-3 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-30 transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </Card>

        {copyOpen && (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-gray-200 bg-gray-50">
            <p className="text-[11px] text-gray-600 leading-relaxed">¿Este {unitLabelLower} ya existe en otro piso o edificio? Copiá sus datos en vez de retipearlos.</p>
            <div className="flex gap-1.5">
              <select
                value={copySourceId}
                onChange={e => setCopySourceId(e.target.value)}
                className="flex-1 h-8 px-2 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{`Elegir ${unitLabelLower} de referencia...`}</option>
                {copyOptions.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button" onClick={handleCopyFromUnit} disabled={!copySourceId || copying}
                className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors whitespace-nowrap"
              >
                {copying ? 'Copiando...' : 'Copiar datos'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 md:items-start">
          <Card className="w-full md:w-56 shrink-0">
            <nav className="flex flex-col p-2">
              {applicableGroups.map(g => {
                const status = g.status(unit, typeConfig);
                const href = `/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/${g.slug}`;
                const active = pathname === href;
                return (
                  <Link
                    key={g.key} href={href}
                    className={`flex items-center gap-2.5 h-9 px-3 rounded-lg text-[12.5px] font-medium transition-colors ${active ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    {g.label}
                  </Link>
                );
              })}
            </nav>
          </Card>

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <Card key={`${unitId}-${formVersion}`} className="p-5">{children}</Card>

            <div className={`flex flex-col gap-2 p-3.5 rounded-xl border ${delimited ? 'bg-brand-50 border-brand-100' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${delimited ? 'bg-brand-500' : 'bg-amber-400'}`} />
                <p className="text-[11.5px] font-medium text-gray-900">{delimited ? 'Delimitado en el plano' : 'Falta marcarlo en el plano'}</p>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-600">
                {delimited
                  ? `La silueta ya está dibujada, así que el ${unitLabelLower} es clickeable desde el masterplan.`
                  : `Sin silueta el ${unitLabelLower} aparece en la lista del sitio, pero no se puede tocar desde el masterplan.`}
              </p>
              <Link href={planoHref} className="self-start h-8 px-3 flex items-center bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors">
                {delimited ? 'Ver la silueta en el plano →' : 'Marcarlo en el plano →'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </UnitShellContext.Provider>
  );
}
