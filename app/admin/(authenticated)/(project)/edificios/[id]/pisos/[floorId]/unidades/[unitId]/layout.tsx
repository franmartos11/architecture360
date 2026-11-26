'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect, useMemo, useCallback, use, startTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { Skeleton, SkeletonCard, SkeletonForm } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { unitCopyPatch } from '@/lib/unit-copy';
import {
  REPLICATE_GROUPS,
  defaultReplicateGroups,
  sameColumnCandidates,
  sameTypologyCandidates,
  type ReplicateGroup,
} from '@/lib/unit-replicate';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { getStatusLabel, pluralize } from '@/lib/units';
import { toFormValues, toDbShape, type UnitFormValues } from '@/lib/unit-fields';
import { UNIT_GROUP_NAV, type UnitGroupStatus } from '@/components/admin/unit-groups/registry';
import { UnitShellContext } from './unit-shell-context';
import type { UnitRow as DbUnitRow } from '@/types/database';

type SiblingUnit = Pick<DbUnitRow, 'id' | 'code'>;
type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code' | 'model_name' | 'type' | 'category'> & {
  building_id: string | null;
  building_name: string | null;
  floor_number: number | null;
};

const STATUS_DOT: Record<UnitGroupStatus, string> = {
  complete: 'bg-brand-700',
  partial: 'bg-[#E0B060]',
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
  const contentIn = useContentIn();
  const { id: buildingId, floorId, unitId } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const typeConfig = useProjectTypeConfig();
  const { unitLabel, unitIsLand } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const uAgree = unitAgreement(typeConfig);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const activeProjectId = useActiveProjectId();

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
  const [replicateOpen, setReplicateOpen] = useState(false);
  const [replicateGroups, setReplicateGroups] = useState<ReplicateGroup[]>([]);
  const [replicateTargets, setReplicateTargets] = useState<string[]>([]);
  const [replicating, setReplicating] = useState(false);
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
    fetch(withActiveProject('/api/admin/units', activeProjectId))
      .then(res => res.json())
      .then((data: OtherUnitRow[]) => setOtherUnits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [unitIsLand, activeProjectId]);

  const copyOptions = useMemo(() => otherUnits.filter(u => u.id !== unitId), [otherUnits, unitId]);
  const sameTypology = useMemo(
    () => (unit ? sameTypologyCandidates({ id: unit.id, model_name: unit.model_name, type: unit.type, category: unit.category }, copyOptions) : []),
    [unit, copyOptions],
  );
  const sameColumn = useMemo(
    () => (unit ? sameColumnCandidates({ id: unit.id, code: unit.code, building_id: buildingId }, copyOptions) : []),
    [unit, buildingId, copyOptions],
  );

  const openReplicate = () => {
    if (!unit) return;
    setCopyOpen(false);
    setReplicateOpen(o => {
      if (o) return false;
      const defaults = defaultReplicateGroups(unit);
      setReplicateGroups(defaults.length > 0 ? defaults : ['design', 'media', 'tour']);
      setReplicateTargets((sameTypology.length > 0 ? sameTypology : sameColumn).map(u => u.id));
      return true;
    });
  };

  const handleReplicate = async () => {
    if (!unit || replicateTargets.length === 0 || replicateGroups.length === 0) return;
    const labels = REPLICATE_GROUPS.filter(g => replicateGroups.includes(g.id)).map(g => g.label.toLowerCase());
    const ok = await confirmDialog({
      message: `Se va a aplicar ${labels.join(', ')} de "${unit.code}" a ${replicateTargets.length} ${replicateTargets.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}. No cambia códigos, precios ni estados.`,
      confirmLabel: 'Replicar',
    });
    if (!ok) return;
    setReplicating(true);
    try {
      const res = await fetch('/api/admin/units/replicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: unit.id, targetIds: replicateTargets, groups: replicateGroups }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? 'No se pudo replicar.', 'error');
        return;
      }
      const count = Array.isArray(data?.updated) ? data.updated.length : replicateTargets.length;
      toast(`Replicado en ${count} ${count === 1 ? unitLabelLower : pluralize(unitLabelLower)}.`);
      setReplicateOpen(false);
    } catch {
      toast('No se pudo conectar para replicar.', 'error');
    } finally {
      setReplicating(false);
    }
  };

  const patch = useCallback(async (updates: Partial<UnitFormValues>) => {
    setUnit(prev => (prev ? { ...prev, ...toDbShape(updates) } : prev));
    setSaving(true);
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    setSaving(false);
    if (res.ok) setSavedLabel('Guardado hace un instante');
    else {
      // Mostrar el motivo del server (400 campo vacío, 409 código duplicado…).
      const data = await res.json().catch(() => null);
      toast(data?.error ?? `No se pudo guardar ${unitLabelLower}.`, 'error');
      load();
    }
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
    if (!copySourceId || !unit) return;
    setCopying(true);
    const res = await fetch(`/api/admin/units/${copySourceId}`);
    if (!res.ok) {
      setCopying(false);
      toast(`No se pudo cargar ${uAgree.el} ${unitLabelLower} de referencia.`, 'error');
      return;
    }
    const source: DbUnitRow = await res.json();
    setCopying(false);
    // Completa lo vacío, no pisa lo cargado a mano (ni el estado: copiar de
    // una vendida no marca esta como vendida) — ver lib/unit-copy.ts.
    const { patch: body, filledLabels, keptLabels } = unitCopyPatch({ ...unit }, { ...source });
    if (filledLabels.length === 0) {
      toast(`No hay nada para completar: ${uAgree.esta} ${unitLabelLower} ya tiene cargado todo lo que tiene "${source.code}".`);
      return;
    }
    const ok = await confirmDialog({
      message: `Se van a completar ${filledLabels.length} ${filledLabels.length === 1 ? 'campo vacío' : 'campos vacíos'} con los datos de "${source.code}": ${filledLabels.join(', ')}.`
        + (keptLabels.length ? ` Se mantienen como están: ${keptLabels.join(', ')}.` : ''),
      confirmLabel: 'Completar',
    });
    if (!ok) return;
    if (await patch(body)) {
      setFormVersion(v => v + 1);
      toast(`${filledLabels.length} ${filledLabels.length === 1 ? 'campo completado' : 'campos completados'}.`);
    }
    setCopySourceId('');
    setCopyOpen(false);
  };

  if (loading) return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <SkeletonCard lines={1} />
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <Skeleton className="w-full md:w-56 h-64 rounded-2xl shrink-0" />
          <div className="flex-1 min-w-0 w-full rounded-2xl border border-gray-200 bg-white p-5"><SkeletonForm rows={6} /></div>
        </div>
      </div>
    </div>
  );
  if (loadError || !unit) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="self-start inline-flex items-center min-h-[28px] text-[13px] text-gray-600 hover:text-gray-900">
          ← Volver a {pluralize(unitLabelLower)}
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
      <m.div {...contentIn} className="flex flex-col gap-4">
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="self-start inline-flex items-center min-h-[28px] text-[13px] text-gray-600 hover:text-gray-900">
          ← Volver a {pluralize(unitLabelLower)}
        </Link>

        <Card className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="m-0 flex items-baseline gap-2.5 flex-wrap"><span className="font-display text-[30px] leading-none font-semibold tracking-[-0.025em] text-gray-900">{unit.code}</span><span className="text-xs text-gray-600">{unitLabel}</span></p>
            <p className="m-0 text-xs text-gray-600 mt-1.5">
              {curIdx >= 0 ? `${curIdx + 1} de ${siblings.length} · ` : ''}{getStatusLabel(unit.status).toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <p className="m-0 text-xs text-gray-600 shrink-0" aria-live="polite">{saving ? 'Guardando...' : savedLabel}</p>
            {!unitIsLand && copyOptions.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => { setReplicateOpen(false); setCopyOpen(o => !o); }}
                  className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${copyOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'}`}
                >
                  Copiar de {uAgree.otro}…
                </button>
                <button
                  type="button"
                  onClick={openReplicate}
                  className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${replicateOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'}`}
                >
                  Replicar a otras…
                </button>
              </>
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
            <p className="text-[11px] text-gray-600 leading-relaxed">¿{uAgree.Esta} {unitLabelLower} ya existe en otro piso o edificio? Completá lo que le falta con sus datos — no se pisa nada de lo ya cargado.</p>
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

        {replicateOpen && (
          <div className="flex flex-col gap-3 p-4 rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="m-0 text-xs font-semibold text-gray-900">Replicar "{unit.code}" a otras {pluralize(unitLabelLower)}</p>
                <p className="m-0 text-[11px] text-gray-600 mt-0.5">Copia los bloques elegidos en lote. No cambia códigos, precios, estados ni ubicación en el plano.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {sameTypology.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReplicateTargets(sameTypology.map(u => u.id))}
                    className="h-7 px-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-medium text-gray-800"
                  >
                    Misma tipología ({sameTypology.length})
                  </button>
                )}
                {sameColumn.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReplicateTargets(sameColumn.map(u => u.id))}
                    className="h-7 px-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-medium text-gray-800"
                  >
                    Misma columna ({sameColumn.length})
                  </button>
                )}
                {replicateTargets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReplicateTargets([])}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-medium text-gray-500 hover:text-gray-900"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {REPLICATE_GROUPS.map(g => {
                const checked = replicateGroups.includes(g.id);
                return (
                  <label key={g.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${checked ? 'border-gray-900 bg-gray-900 text-white font-medium' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => setReplicateGroups(prev => checked ? prev.filter(x => x !== g.id) : [...prev, g.id])}
                    />
                    {g.label}
                  </label>
                );
              })}
            </div>

            <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 p-2 rounded-lg border border-gray-100 bg-gray-50">
              {copyOptions.map(u => {
                const sel = replicateTargets.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setReplicateTargets(prev => sel ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                    aria-pressed={sel}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${sel ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
                  >
                    {u.code}{u.floor_number != null ? ` · P${u.floor_number}` : ''}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReplicateOpen(false)}
                className="h-8 px-3 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:border-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReplicate}
                disabled={replicating || replicateTargets.length === 0 || replicateGroups.length === 0}
                className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              >
                {replicating ? 'Replicando…' : `Aplicar a ${replicateTargets.length} ${replicateTargets.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}`}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 md:items-start">
          <Card className="w-full md:w-56 shrink-0">
            <nav className="flex flex-col p-2">
              {applicableGroups.filter(g => !g.secondary).map(g => {
                const status = g.status(unit, typeConfig);
                const href = `/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/${g.slug}`;
                const active = pathname === href;
                return (
                  <Link
                    key={g.key} href={href}
                    className={`flex items-center gap-2.5 min-h-[40px] px-3 rounded-lg text-[13px] transition-colors ${active ? 'bg-[#EAE7E0] text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    {g.label}
                  </Link>
                );
              })}
              {applicableGroups.some(g => g.secondary) && (
                <>
                  <div className="my-2 border-t border-gray-100" />
                  <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    Opcional / Avanzado
                  </span>
                  {applicableGroups.filter(g => g.secondary).map(g => {
                    const status = g.status(unit, typeConfig);
                    const href = `/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/${g.slug}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={g.key} href={href}
                        className={`flex items-center gap-2.5 min-h-[36px] px-3 rounded-lg text-[12.5px] transition-colors ${active ? 'bg-[#EAE7E0] text-gray-900 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                        {g.label}
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>
          </Card>

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <Card key={`${unitId}-${formVersion}`} className="p-5">{children}</Card>

            <div className={`flex flex-col gap-2 p-3.5 rounded-xl border ${delimited ? 'bg-brand-50 border-brand-100' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${delimited ? 'bg-brand-700' : 'bg-[#E0B060]'}`} />
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
      </m.div>
    </UnitShellContext.Provider>
  );
}
