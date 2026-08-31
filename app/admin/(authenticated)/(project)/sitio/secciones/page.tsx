'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { resolveSectionList, computeEmptySectionKeys, type SectionKey } from '@/lib/project-sections';

interface SectionRow {
  key: SectionKey;
  label: string;
  enabled: boolean;
  available: boolean;
  unavailableReason?: string;
}

export default function AdminSeccionesPage() {
  const typeConfig = useProjectTypeConfig();
  const [sections, setSections] = useState<SectionRow[] | null>(null);
  const [emptyKeys, setEmptyKeys] = useState<Set<SectionKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const sectionsRef = useRef<SectionRow[] | null>(null);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch('/api/admin/project/preview')
      .then(res => res.json())
      .then(data => {
        setSections(resolveSectionList(data.project?.sectionConfig, typeConfig));
        setEmptyKeys(computeEmptySectionKeys(data.project));
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const persist = async (next: SectionRow[]) => {
    setSections(next);
    setSaving(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionConfig: next.map(({ key, enabled }) => ({ key, enabled })) }),
    });
    setSaving(false);
    if (!res.ok) toast('No se pudo guardar el cambio.', 'error');
  };

  const toggleSection = (key: SectionKey) => {
    if (!sections) return;
    persist(sections.map(s => (s.key === key ? { ...s, enabled: !s.enabled } : s)));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    if (!sections) return;
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  // Reorder.Group dispara onReorder en cada paso del arrastre (cada vez que
  // se cruza el punto medio de un vecino), no solo al soltar — reordenar
  // localmente en cada paso da el feedback visual fluido, pero guardar recién
  // se hace una vez, al soltar, para no mandar un PATCH por cada micro-paso.
  const handleDragEnd = () => {
    if (sectionsRef.current) persist(sectionsRef.current);
  };

  if (loading) return <LoadingSpinner text="Cargando secciones..." tone="light" />;
  if (loadError || !sections) return <ErrorState message="No se pudieron cargar las secciones." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sitio" className="text-sm text-gray-500 hover:text-gray-700">← Sitio web</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Secciones de la landing</h2>
        <p className="text-sm text-gray-500 mt-1">
          Arrastrá una sección del ícono ⠿ para cambiar su orden en el sitio público, o prendela/apagala con el interruptor. Apagar una
          sección no borra su contenido — y una sección prendida igual no aparece si todavía no cargaste nada para mostrar ahí (ej.
          Amenidades sin ninguna cargada). Algunas secciones no aplican según el tipo de proyecto o si es &quot;para vender&quot; o &quot;solo
          para mostrar&quot; — esas aparecen atenuadas y no se pueden prender.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Orden y visibilidad</h3>
        </CardHeader>
        <Reorder.Group as="ul" axis="y" values={sections} onReorder={setSections} className="divide-y divide-gray-100">
          {sections.map((s, i) => (
            <SectionListItem
              key={s.key}
              section={s}
              isEmpty={emptyKeys.has(s.key)}
              saving={saving}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
              onToggle={() => toggleSection(s.key)}
              onMoveUp={() => moveSection(i, -1)}
              onMoveDown={() => moveSection(i, 1)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </Reorder.Group>
      </Card>
    </div>
  );
}

function SectionListItem({
  section: s,
  isEmpty,
  saving,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDragEnd,
}: {
  section: SectionRow;
  isEmpty: boolean;
  saving: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragEnd: () => void;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={s}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 px-4 sm:px-6 py-3.5 bg-white ${!s.available ? 'opacity-60' : ''}`}
      whileDrag={{ boxShadow: '0 10px 28px rgba(0,0,0,0.14)', zIndex: 10, position: 'relative' }}
    >
      <button
        type="button"
        onPointerDown={e => dragControls.start(e)}
        aria-label={`Arrastrar para reordenar ${s.label}`}
        className="shrink-0 p-1.5 -ml-1.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="flex flex-col shrink-0 -my-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst || saving}
          aria-label={`Subir ${s.label}`}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast || saving}
          aria-label={`Bajar ${s.label}`}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <span className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-medium ${s.enabled && s.available ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
        {!s.available && s.unavailableReason && (
          <span className="shrink-0 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {s.unavailableReason}
          </span>
        )}
        {s.available && s.enabled && isEmpty && (
          <span className="shrink-0 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full" title="No se muestra en el sitio hasta que cargues contenido">
            vacía — no se ve en el sitio
          </span>
        )}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={s.enabled && s.available}
        aria-label={`${s.enabled ? 'Ocultar' : 'Mostrar'} ${s.label}`}
        onClick={onToggle}
        disabled={saving || !s.available}
        title={!s.available ? s.unavailableReason : undefined}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
          s.enabled && s.available ? 'bg-brand-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            s.enabled && s.available ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </Reorder.Item>
  );
}
