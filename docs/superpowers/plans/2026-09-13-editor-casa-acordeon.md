# Acordeón de casa en FloorUnitsEditor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el tab-switcher actual de `FloorUnitsEditor.tsx` (4 pestañas: Datos/Ambientes/Planos/Galería) en un acordeón de 7 secciones (Datos/Superficies/Comercial/Comodidades/Ambientes/Planos e imágenes/Galería) con punto de estado por sección, reorganizando los campos que hoy viven mezclados en la pestaña "Datos".

**Architecture:** Un componente `Accordion`/`AccordionItem` nuevo y reusable en `components/ui/` (una sola sección abierta a la vez, controlado por `value`/`onChange`), más una reorganización del JSX ya existente en `FloorUnitsEditor.tsx` — ningún campo cambia de handler ni de tipo, solo de contenedor visual. El modelo de borrador único + único submit (`form`/`rooms`/`levels`/`handleSubmit`/`mergeDelimitation`) no se toca.

**Tech Stack:** Next.js App Router, React (client components), TypeScript, Tailwind. Sin tests de componentes `.tsx` en este repo (Vitest solo corre `**/*.test.ts`) — verificación por `tsc`/`eslint`/build + navegador.

**Spec:** `docs/superpowers/specs/2026-09-13-editor-unidades-por-grupos-design.md` (sección "Fase 2 — acordeón propio para `FloorUnitsEditor`")

## Global Constraints

- No tocar `lib/unit-fields.ts` ni `components/admin/unit-groups/*` (son de la Fase 1, ya en producción).
- No cambiar el modelo de persistencia: sigue habiendo un solo `<form onSubmit={handleSubmit}>`, un solo botón "Guardar cambios", y el paso `mergeDelimitation` antes de guardar. Ningún campo pasa a autoguardar.
- Ningún handler de campo cambia — cada input sigue llamando exactamente al mismo `setForm({ ...form, campo: ... })` (o `setRooms`/`updateRoom`/etc.) que ya tiene. Solo cambia en qué sección del acordeón vive ese JSX.
- El componente sigue aceptando exactamente los mismos props (`{ buildingId?, floorId, onUnitsChange? }`) — transparente para sus dos puntos de montaje (`wizard/page.tsx`, `edificios/[id]/pisos/[floorId]/page.tsx`).
- Vitest solo corre `**/*.test.ts` — no crear archivos `.test.tsx` para el `Accordion` ni para `FloorUnitsEditor`; verificar con `tsc --noEmit`, `eslint`, y navegador.
- Estilos: reusar las clases Tailwind que ya existen en el archivo (no inventar una paleta nueva para el acordeón — el punto de estado usa el mismo lenguaje visual que la Fase 1: `bg-brand-500`/`bg-amber-400`/`bg-gray-200`).

---

### Task 1: Componente `Accordion`/`AccordionItem`

**Files:**
- Create: `components/ui/Accordion.tsx`

**Interfaces:**
- Produces: `Accordion({ value, onChange, children })`, `AccordionItem({ value, label, status?, badge?, children })`, `AccordionStatus = 'complete' | 'partial' | 'empty'` — consumidos por la Task 2.

- [ ] **Step 1: Escribir el componente**

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type AccordionStatus = 'complete' | 'partial' | 'empty';

const STATUS_DOT: Record<AccordionStatus, string> = {
  complete: 'bg-brand-500',
  partial: 'bg-amber-400',
  empty: 'bg-gray-200',
};

interface AccordionContextValue {
  value: string;
  onChange: (value: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

// Acordeón simple, una sola sección abierta a la vez — controlado por
// `value`/`onChange` (el mismo patrón que un tab-switcher, solo cambia la
// presentación visual). No hay versión "varias abiertas a la vez": para
// formularios tan densos como el de FloorUnitsEditor, abrir todo a la vez
// vuelve la página excesivamente larga.
export function Accordion({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <AccordionContext.Provider value={{ value, onChange }}>
      <div className="flex flex-col gap-3">{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value, label, status, badge, children,
}: {
  value: string;
  label: string;
  /** Punto de estado — omitilo si la sección no tiene un criterio de "completo" claro. */
  status?: AccordionStatus;
  /** Badge chico a la derecha del label (ej. "3/4", conteo de ambientes). Omitilo si no aplica. */
  badge?: string;
  children: ReactNode;
}) {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('AccordionItem debe usarse dentro de <Accordion>');
  const open = ctx.value === value;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => ctx.onChange(value)}
        className="w-full h-12 px-4 flex items-center gap-3 text-left hover:bg-gray-50/60 transition-colors"
      >
        {status && <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />}
        <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
        {badge && (
          <span className="h-[19px] min-w-[19px] px-1.5 rounded-md flex items-center justify-center text-[10px] font-semibold bg-gray-100 text-gray-600 shrink-0">
            {badge}
          </span>
        )}
        <span className={`text-gray-400 text-xs transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 flex flex-col gap-3.5">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Accordion.tsx
git commit -m "$(cat <<'EOF'
feat(ui): agregar componente Accordion de una sola sección abierta

Base para el acordeón de casa en FloorUnitsEditor — reusable para
cualquier otro formulario largo que necesite el mismo patrón.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Reorganizar el render de casa en 7 secciones de acordeón

**Files:**
- Modify: `components/admin/FloorUnitsEditor.tsx`

**Interfaces:**
- Consumes: `Accordion`, `AccordionItem`, `AccordionStatus` de `@/components/ui/Accordion` (Task 1).

Este archivo (1484 líneas) no cambia su estado, sus handlers, ni su lógica de guardado — solo la organización visual del render de casa (`!hasUnitStep`, hoy líneas 959-1439) y las estructuras de datos que alimentan esa UI (`casaOk`, `casaTabDefs`, el tipo de `casaTab`, el denominador de la barra de progreso).

- [ ] **Step 1: Agregar el import**

```tsx
// junto a los demás imports de components/ui
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
```

- [ ] **Step 2: Ampliar el tipo de `casaTab` a las 7 secciones**

```tsx
// antes (línea 204)
const [casaTab, setCasaTab] = useState<'datos' | 'ambientes' | 'planos' | 'galeria'>('datos');

// después
const [casaTab, setCasaTab] = useState<'datos' | 'superficies' | 'comercial' | 'comodidades' | 'ambientes' | 'planos' | 'galeria'>('datos');
```

- [ ] **Step 3: Reemplazar `casaOk`/`casaDone`/`casaTabDefs` (líneas 452-467) por las 7 secciones**

```tsx
// antes
const casaOk = {
  datos: form.modelName.trim().length > 0 && areaTotalNum > 0 && effectiveBedrooms > 0 && effectiveBathrooms > 0 && form.orientation !== '',
  ambientes: allRooms.length > 0 && casaRoomsNeeded.length === 0 && allRooms.every(r => (r.area ?? 0) > 0),
  planos: casaSlotsOn.interior && casaSlotsOn.planta3d && casaSlotsOn.plano2d,
  galeria: form.galleryImages.filter(Boolean).length >= 5,
};
const casaDone = Object.values(casaOk).filter(Boolean).length;
const casaTabDefs: { key: typeof casaTab; label: string; badge: string; ok: boolean }[] = [
  { key: 'datos', label: 'Datos', badge: casaOk.datos ? '✓' : '!', ok: casaOk.datos },
  { key: 'ambientes', label: 'Ambientes', badge: String(allRooms.length), ok: casaOk.ambientes },
  { key: 'planos', label: 'Planos e imágenes', badge: `${casaSlotsCount}/4`, ok: casaOk.planos },
  { key: 'galeria', label: 'Galería', badge: String(form.galleryImages.filter(Boolean).length), ok: casaOk.galeria },
];

// después
const casaOk = {
  datos: form.modelName.trim().length > 0 && effectiveBedrooms > 0 && effectiveBathrooms > 0,
  superficies: areaTotalNum > 0,
  comercial: !typeConfig.showPrice || form.price !== '',
  comodidades: form.orientation !== '',
  ambientes: allRooms.length > 0 && casaRoomsNeeded.length === 0 && allRooms.every(r => (r.area ?? 0) > 0),
  planos: casaSlotsOn.interior && casaSlotsOn.planta3d && casaSlotsOn.plano2d,
  galeria: form.galleryImages.filter(Boolean).length >= 5,
};
const casaDone = Object.values(casaOk).filter(Boolean).length;
const casaSectionDefs: { key: typeof casaTab; label: string; badge?: string; ok: boolean }[] = [
  { key: 'datos', label: 'Datos', ok: casaOk.datos },
  { key: 'superficies', label: 'Superficies', ok: casaOk.superficies },
  { key: 'comercial', label: 'Comercial', ok: casaOk.comercial },
  { key: 'comodidades', label: 'Comodidades', ok: casaOk.comodidades },
  { key: 'ambientes', label: 'Ambientes', badge: String(allRooms.length), ok: casaOk.ambientes },
  { key: 'planos', label: 'Planos e imágenes', badge: `${casaSlotsCount}/4`, ok: casaOk.planos },
  { key: 'galeria', label: 'Galería', badge: String(form.galleryImages.filter(Boolean).length), ok: casaOk.galeria },
];
```

Nota: `comercial` no tenía criterio de "completo" antes (el precio siempre es opcional — "Consultar precio"). El criterio nuevo (`!typeConfig.showPrice || form.price !== ''`) marca la sección completa cuando no corresponde mostrar precio, o cuando ya se cargó uno — evita que quede en amber para siempre en un proyecto que sí vende con precio visible pero el usuario todavía no lo cargó, sin bloquear nada (el submit nunca depende de `casaOk`).

- [ ] **Step 4: Reemplazar el tab-bar + los 4 bloques `casaTab === '...' && (...)` (líneas 962-1391) por el `<Accordion>`**

Reemplazar TODO el bloque desde `<div className="flex gap-1.5 flex-wrap">` (línea 962) hasta el `</div>` que cierra la pestaña "galeria" (línea 1391) — es decir, el tab-bar completo y los 4 `casaTab === X && (...)` — por lo siguiente. Cada campo de abajo es el MISMO JSX que ya existe hoy (mismo `value`/`onChange`/`className`), solo reorganizado en 7 `AccordionItem` en vez de 4 bloques condicionales:

```tsx
<Accordion value={casaTab} onChange={setCasaTab}>
  <AccordionItem value="datos" label="Datos" status={casaOk.datos ? 'complete' : 'partial'}>
    <Card>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Identidad</h4>
          <p className="text-xs text-gray-400 mt-0.5">Lo que se ve primero en la ficha.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {showCodeField && (
            <Input label="Nombre de la casa" id="code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder={buildingLabel} required />
          )}
          <Input label="Modelo" id="modelName" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} placeholder="SUITE GARDEN" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Estado / antigüedad</label>
          <div className="flex flex-wrap gap-1.5">
            {([{ value: '', label: 'Sin especificar' }, ...UNIT_CONDITION_OPTIONS] as { value: typeof form.condition; label: string }[]).map(o => {
              const on = form.condition === o.value;
              return (
                <button
                  type="button"
                  key={o.value || 'none'}
                  onClick={() => setForm({ ...form, condition: o.value })}
                  className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                    on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Composición</h4>
          <p className="text-xs text-gray-400 mt-0.5">El sitio arma los filtros con estos números.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {programActive ? (
            <>
              <ReadOnlyField label="Dormitorios" value={`${derivedCounts.bedrooms}`} hint="de los ambientes" />
              <ReadOnlyField label="Baños" value={`${derivedCounts.bathrooms}`} hint="de los ambientes" />
            </>
          ) : (
            <>
              <CasaCounter label="Dormitorios" value={Number(form.bedrooms || 0)} onDec={() => setForm({ ...form, bedrooms: String(Math.max(0, Number(form.bedrooms || 0) - 1)) })} onInc={() => setForm({ ...form, bedrooms: String(Number(form.bedrooms || 0) + 1) })} />
              <CasaCounter label="Baños" value={Number(form.bathrooms || 0)} onDec={() => setForm({ ...form, bathrooms: String(Math.max(0, Number(form.bathrooms || 0) - 1)) })} onInc={() => setForm({ ...form, bathrooms: String(Number(form.bathrooms || 0) + 1) })} />
            </>
          )}
          <CasaCounter label="Cantidad de plantas" value={Number(form.floorsCount || 1)} onDec={() => setForm({ ...form, floorsCount: String(Math.max(1, Number(form.floorsCount || 1) - 1)) })} onInc={() => setForm({ ...form, floorsCount: String(Number(form.floorsCount || 1) + 1) })} />
          {!programActive && (
            <>
              <CasaCounter label="Livings" value={Number(form.livingRooms || 0)} onDec={() => setForm({ ...form, livingRooms: String(Math.max(0, Number(form.livingRooms || 0) - 1)) })} onInc={() => setForm({ ...form, livingRooms: String(Number(form.livingRooms || 0) + 1) })} />
              <CasaCounter label="Cocinas" value={Number(form.kitchens || 0)} onDec={() => setForm({ ...form, kitchens: String(Math.max(0, Number(form.kitchens || 0) - 1)) })} onInc={() => setForm({ ...form, kitchens: String(Number(form.kitchens || 0) + 1) })} />
              <CasaCounter label="Otros ambientes" value={Number(form.otherRoomsCount || 0)} onDec={() => setForm({ ...form, otherRoomsCount: String(Math.max(0, Number(form.otherRoomsCount || 0) - 1)) })} onInc={() => setForm({ ...form, otherRoomsCount: String(Number(form.otherRoomsCount || 0) + 1) })} />
            </>
          )}
          <CasaCounter label="Cocheras cubiertas" value={Number(form.garageCovered || 0)} onDec={() => setForm({ ...form, garageCovered: String(Math.max(0, Number(form.garageCovered || 0) - 1)) })} onInc={() => setForm({ ...form, garageCovered: String(Number(form.garageCovered || 0) + 1) })} />
          <CasaCounter label="Cocheras descubiertas" value={Number(form.garageUncovered || 0)} onDec={() => setForm({ ...form, garageUncovered: String(Math.max(0, Number(form.garageUncovered || 0) - 1)) })} onInc={() => setForm({ ...form, garageUncovered: String(Number(form.garageUncovered || 0) + 1) })} />
        </div>
        {!programActive && (
          <Input label="Detalle de otros ambientes" value={form.otherRoomsDescription} onChange={e => setForm({ ...form, otherRoomsDescription: e.target.value })} placeholder="Lavadero, depósito…" />
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.hasServiceRoom} onChange={e => setForm({ ...form, hasServiceRoom: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          Tiene cuarto de servicio
        </label>
      </div>
    </Card>
  </AccordionItem>

  <AccordionItem value="superficies" label="Superficies" status={casaOk.superficies ? 'complete' : 'empty'}>
    <Card>
      <div className="p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="totalArea" className="block text-xs font-medium text-gray-500">Área total (m²)</label>
              <span className="text-[10px] text-gray-400 truncate">{areaSum > 0 ? `interna + externa = ${areaSum} m²` : 'suma de interna y externa'}</span>
            </div>
            <input
              id="totalArea" type="number" step="0.01" value={form.totalArea}
              onChange={e => setForm({ ...form, totalArea: e.target.value })}
              className={`w-full px-4 py-2 mt-1 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-shadow ${areaMismatch ? 'border-amber-400' : 'border-brand-200'}`}
            />
          </div>
          <Input label="Área interna (m²)" id="innerArea" type="number" step="0.01" value={form.innerArea} onChange={e => setForm({ ...form, innerArea: e.target.value })} />
          <Input label="Área externa (m²)" id="externalArea" type="number" step="0.01" value={form.externalArea} onChange={e => setForm({ ...form, externalArea: e.target.value })} />
        </div>
        {areaMismatch && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
            <p className="flex-1 min-w-[220px] text-xs text-amber-800">
              Interna ({areaInnerNum}) + externa ({areaExternalNum}) dan {areaSum} m², y el total dice {areaTotalNum} m².
            </p>
            <button type="button" onClick={() => setForm({ ...form, totalArea: String(areaSum) })} className="h-7 px-3 rounded-md bg-gray-900 text-white text-xs font-medium shrink-0">
              Usar {areaSum} m² como total
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Superficie de terreno (m²)" id="lotSize" type="number" step="0.01" value={form.lotSize} onChange={e => setForm({ ...form, lotSize: e.target.value })} />
          <Input label="Altura de techo (m)" id="ceilingHeight" type="number" step="0.01" value={form.ceilingHeight} onChange={e => setForm({ ...form, ceilingHeight: e.target.value })} placeholder="2.60" />
        </div>
      </div>
    </Card>
  </AccordionItem>

  <AccordionItem value="comercial" label="Comercial" status={casaOk.comercial ? 'complete' : 'empty'}>
    {(typeConfig.showPrice || typeConfig.showStatus) && (
      <Card>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {typeConfig.showPrice && (
            <>
              <Input label="Precio" id="price" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Consultar precio" />
              <Select label="Moneda" id="currency" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input label="Expensas / mes" id="hoaFee" type="number" step="0.01" value={form.hoaFee} onChange={e => setForm({ ...form, hoaFee: e.target.value })} placeholder="Sin expensas" />
            </>
          )}
          {typeConfig.showStatus && (
            <Select label="Estado de venta" id="status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as UnitStatus })}>
              <option value="available">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="sold">Vendido</option>
            </Select>
          )}
        </div>
      </Card>
    )}
  </AccordionItem>

  <AccordionItem value="comodidades" label="Comodidades" status={casaOk.comodidades ? 'complete' : 'empty'}>
    <Card>
      <div className="p-5 flex flex-col gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Orientación del frente</h4>
          <p className="text-xs text-gray-400 mt-0.5">Elegí el rumbo al que mira el frente — calibra por dónde sale y se pone el sol en el recorrido 360°.</p>
        </div>
        <TourOrientationControl
          hint={`Arrastrá la aguja hacia dónde mira el frente de ${uAgree.esta} ${unitLabelLower}${orientationCardinal ? ` — mira al ${orientationCardinal}` : ''}.`}
          value={orientationCardinal !== '' ? Number(form.orientation) : undefined}
          onChange={(deg: number | undefined) => setForm({ ...form, orientation: deg == null ? '' : String(deg) })}
        />
      </div>
    </Card>

    <Card>
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-semibold text-gray-900">Comodidades</h4>
          <span className="text-xs text-gray-400">{form.features.length} seleccionadas</span>
        </div>
        <div className="space-y-2">
          {UNIT_FEATURE_GROUPS.map(group => (
            <div key={group.label} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-gray-400 w-24 shrink-0">{group.label}</span>
              {group.options
                .filter(opt => opt !== 'Apto crédito' || typeConfig.showPrice)
                .map(opt => {
                  const on = form.features.includes(opt);
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => setForm({
                        ...form,
                        features: on ? form.features.filter(f => f !== opt) : [...form.features, opt],
                      })}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {on ? '✓ ' : ''}{opt}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  </AccordionItem>

  <AccordionItem value="ambientes" label="Ambientes" badge={String(allRooms.length)} status={casaOk.ambientes ? 'complete' : 'partial'}>
    {casaRoomsNeeded.length > 0 && (
      <div className="rounded-xl bg-gray-900 px-4 py-3.5 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-medium text-white">
            Declaraste {casaRoomsNeeded.map(x => `${x.n} ${x.base.toLowerCase()}${x.n > 1 ? 's' : ''}`).join(', ')} sin detallar
          </p>
          <p className="text-xs text-white/60 mt-0.5">Los creo con nombre y tipo puestos; después solo agregás m² y fotos.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            let id = Date.now();
            const add: Room[] = [];
            casaRoomsNeeded.forEach(x => {
              for (let i = 0; i < x.n; i++) add.push({ id: `r-${id++}`, name: `${x.base}${x.n > 1 ? ` ${i + 1}` : ''}`, kind: x.kind });
            });
            setRooms([...rooms, ...add]);
          }}
          className="h-8 px-3.5 rounded-lg bg-white text-gray-900 text-xs font-medium shrink-0"
        >
          Crear los que faltan
        </button>
      </div>
    )}

    <Card>
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Ambientes</h4>
          <p className="text-xs text-gray-400 mt-0.5">
            Detalle de cada ambiente de la casa (dormitorios, baños, cocina…). Opcional pero recomendado.
            {floorsCount > 1 && ' Cargalos por planta con las solapas de abajo.'}
          </p>
        </div>
        <button type="button" onClick={addRoom} className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium shrink-0">
          + Agregar {plantaIdx === 0 ? 'ambiente' : `a ${plantas[plantaIdx].label.toLowerCase()}`}
        </button>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {floorsCount > 1 && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {plantas.map((p, i) => {
              const n = p.rooms.filter(r => r.kind).length;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActivePlanta(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${plantaIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {p.label}{n > 0 && <span className="text-gray-400 ml-1">({n})</span>}
                </button>
              );
            })}
          </div>
        )}

        {activeRooms.length === 0 ? (
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-400">Todavía no cargaste ambientes{floorsCount > 1 ? ` en ${plantas[plantaIdx].label.toLowerCase()}` : ''}.</p>
            {plantaIdx === 0 && (() => {
              const legacy = synthesizeRoomProgram({
                bedrooms: Number(form.bedrooms || 0), bathrooms: Number(form.bathrooms || 0),
                livingRooms: Number(form.livingRooms || 0), kitchens: Number(form.kitchens || 0),
                otherRoomsCount: Number(form.otherRoomsCount || 0), otherRoomsDescription: form.otherRoomsDescription,
              });
              return legacy.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setRooms(legacy)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Generar {legacy.length} ambiente{legacy.length === 1 ? '' : 's'} desde los datos actuales (podés ajustarlos después)
                </button>
              ) : null;
            })()}
          </div>
        ) : (
          <div className="space-y-3">
            {activeRooms.map(room => {
              const featureOpts = roomFeatureOptions(room.kind);
              return (
              <div key={room.id} className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Input
                    label="Nombre" value={room.name}
                    onChange={e => updateRoom(room.id, { name: e.target.value })}
                    placeholder="Dormitorio principal"
                  />
                  <Select label="Tipo" value={room.kind ?? 'other'} onChange={e => updateRoom(room.id, { kind: e.target.value as RoomKind })}>
                    {ROOM_KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  <Input
                    label="m²" type="number" step="0.01" value={room.area ?? ''}
                    onChange={e => updateRoom(room.id, { area: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
                {featureOpts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {featureOpts.map(feature => {
                      const on = room.features?.includes(feature);
                      return (
                        <button
                          type="button"
                          key={feature}
                          onClick={() => toggleRoomFeature(room.id, feature)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                            on ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {on ? '✓ ' : ''}{feature}
                        </button>
                      );
                    })}
                  </div>
                )}
                <ImageUploader
                  label="Foto del ambiente"
                  value={room.imageUrl ?? ''}
                  onChange={url => updateRoom(room.id, { imageUrl: url || undefined })}
                  folder="units"
                />
                <MultiImageUploader
                  label="Más fotos de este ambiente"
                  values={room.images ?? []}
                  onChange={urls => updateRoom(room.id, { images: urls.length ? urls : undefined })}
                  folder="units"
                />
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      label="Nota" value={room.notes ?? ''}
                      onChange={e => updateRoom(room.id, { notes: e.target.value || undefined })}
                      placeholder="Detalle libre (ventanal al jardín, piso de madera…)"
                    />
                  </div>
                  <button type="button" onClick={() => removeRoom(room.id)} className="text-sm text-red-500 hover:text-red-700 pb-2 shrink-0">
                    Quitar
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="px-5 py-3.5 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">
          {(() => {
            const roomsM2 = allRooms.reduce((s, r) => s + (r.area ?? 0), 0);
            return roomsM2 > 0
              ? `Los ambientes suman ${roomsM2} m² de los ${areaInnerNum || '—'} m² internos${areaInnerNum && roomsM2 > areaInnerNum ? ' — te pasaste.' : '.'}`
              : 'Todavía no cargaste m² por ambiente: el sitio los muestra sin superficie.';
          })()}
        </p>
        {buildingId && (
          <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/plano`} className="h-8 px-3 flex items-center rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-900 shrink-0">
            Delimitar en el plano →
          </Link>
        )}
      </div>
    </Card>
  </AccordionItem>

  <AccordionItem value="planos" label="Planos e imágenes" badge={`${casaSlotsCount}/4`} status={casaOk.planos ? 'complete' : 'partial'}>
    <Card>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Imágenes principales</h4>
          <p className="text-xs text-gray-400 mt-0.5">Cada una tiene un lugar fijo en la ficha.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ImageUploader label="Foto interior" value={form.interiorImageUrl} onChange={url => setForm({ ...form, interiorImageUrl: url })} folder="units" />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Planta 3D</label>
            {plantas.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {plantas.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePlanta(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${plantaIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <ImageUploader value={activePlan3d} onChange={setActivePlan3d} folder="floorplans" />
            {plantas.length > 1 && (
              <p className="text-xs text-gray-400">Estás editando la planta 3D de {plantas[plantaIdx].label.toLowerCase()}.</p>
            )}
          </div>
          <ImageUploader label="Plano 3D técnico" value={form.plan3dUrl} onChange={url => setForm({ ...form, plan3dUrl: url })} folder="floorplans" />
          <ImageUploader label="Plano 2D técnico" value={form.technicalPlanUrl} onChange={url => setForm({ ...form, technicalPlanUrl: url })} folder="floorplans" />
        </div>
      </div>
    </Card>

    {buildingId && (
      <Link
        href={`/admin/edificios/${buildingId}/pisos/${floorId}/plano`}
        className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 hover:border-gray-300 transition-colors flex-wrap"
      >
        <div className="w-11 h-11 rounded-lg bg-gray-100 shrink-0" />
        <span className="flex-1 min-w-[200px]">
          <span className="block text-sm font-semibold text-gray-900">Plano y delimitación de ambientes</span>
          <span className="block text-xs text-gray-400 mt-0.5">Subí el plano 2D de cada planta y marcá el contorno de cada ambiente. Se abre en otra pantalla — guardá primero los cambios de acá.</span>
        </span>
        <span className="h-8 px-3 flex items-center rounded-lg border border-gray-200 text-xs font-medium text-gray-900 shrink-0">Abrir →</span>
      </Link>
    )}
  </AccordionItem>

  <AccordionItem value="galeria" label="Galería" badge={String(form.galleryImages.filter(Boolean).length)} status={casaOk.galeria ? 'complete' : 'empty'}>
    <Card>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Galería</h4>
          <p className="text-xs text-gray-400 mt-0.5">
            {form.galleryImages.filter(Boolean).length} fotos · la primera es la portada del sitio{form.galleryImages.filter(Boolean).length < 5 ? ' · sumá al menos 5' : ''}
          </p>
        </div>
        <MultiImageUploader values={form.galleryImages} onChange={urls => setForm({ ...form, galleryImages: urls })} folder="units" />
      </div>
    </Card>
  </AccordionItem>
</Accordion>
```

- [ ] **Step 5: Actualizar el sidebar (líneas 1394-1437) — checklist de 7 ítems y progreso `/7`**

```tsx
// antes
<div className="p-4">
  <h4 className="text-sm font-semibold text-gray-900">Para publicar la casa</h4>
  <div className="h-1.5 rounded-full bg-gray-100 mt-2.5 overflow-hidden">
    <div className={`h-full rounded-full transition-all ${casaDone === 4 ? 'bg-brand-500' : 'bg-amber-400'}`} style={{ width: `${(casaDone / 4) * 100}%` }} />
  </div>
  <p className="text-xs text-gray-400 mt-1.5">{casaDone} de 4 bloques completos</p>
</div>
{casaTabDefs.map(t => (
  <button
    key={t.key}
    type="button"
    onClick={() => setCasaTab(t.key)}
    className="w-full px-4 py-2.5 flex items-center gap-2.5 border-t border-gray-100 hover:bg-gray-50/60 text-left"
  >
    <span className={`w-[17px] h-[17px] shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold border-[1.5px] ${
      t.ok ? 'bg-brand-500 border-brand-500 text-white' : 'border-amber-300 text-transparent'
    }`}>
      {t.ok ? '✓' : ''}
    </span>
    <span className="block text-xs font-medium text-gray-900">{t.label}</span>
  </button>
))}

// después
<div className="p-4">
  <h4 className="text-sm font-semibold text-gray-900">Para publicar la casa</h4>
  <div className="h-1.5 rounded-full bg-gray-100 mt-2.5 overflow-hidden">
    <div className={`h-full rounded-full transition-all ${casaDone === 7 ? 'bg-brand-500' : 'bg-amber-400'}`} style={{ width: `${(casaDone / 7) * 100}%` }} />
  </div>
  <p className="text-xs text-gray-400 mt-1.5">{casaDone} de 7 bloques completos</p>
</div>
{casaSectionDefs.map(t => (
  <button
    key={t.key}
    type="button"
    onClick={() => setCasaTab(t.key)}
    className="w-full px-4 py-2.5 flex items-center gap-2.5 border-t border-gray-100 hover:bg-gray-50/60 text-left"
  >
    <span className={`w-[17px] h-[17px] shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold border-[1.5px] ${
      t.ok ? 'bg-brand-500 border-brand-500 text-white' : 'border-amber-300 text-transparent'
    }`}>
      {t.ok ? '✓' : ''}
    </span>
    <span className="block text-xs font-medium text-gray-900">{t.label}</span>
  </button>
))}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores. Si aparece algo del tipo `'casaTabDefs' is not defined`, significa que quedó alguna referencia vieja sin actualizar en el Step 4/5 — revisar con `grep -n "casaTabDefs" components/admin/FloorUnitsEditor.tsx` (no debe quedar ninguna, todo pasó a `casaSectionDefs`).

- [ ] **Step 7: Lint**

Run: `npx eslint components/admin/FloorUnitsEditor.tsx`
Expected: sin errores (warnings preexistentes no relacionados están bien).

- [ ] **Step 8: Commit**

```bash
git add components/admin/FloorUnitsEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(units): acordeón de 7 secciones para el editor de casa

Reemplaza el tab-switcher (Datos/Ambientes/Planos/Galería) por un
acordeón con el mismo criterio de agrupación que el shell de depto —
Datos/Superficies/Comercial/Comodidades/Ambientes/Planos/Galería, cada
uno con su punto de estado. Ningún campo cambia de handler ni de tipo,
el modelo de borrador único + único submit queda igual.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Verificación manual y de regresión

**Files:** ninguno — solo verificación, sin cambios de código salvo que algo falle.

No hay tests de componentes en este repo (ver Global Constraints), así que esta task es la red de seguridad para el acordeón completo.

- [ ] **Step 1: Suite completa + build**

Run: `npx vitest run`
Expected: PASS, mismo conteo que antes de este plan (nada de lo tocado tiene test propio, así que el número no debería cambiar).

Run: `npm run build`
Expected: exit 0, sin errores de tipos.

- [ ] **Step 2: Levantar el servidor de desarrollo**

Run: `npm run dev`

- [ ] **Step 3: Navegar el wizard con un proyecto tipo casa**

Verificar en `/admin/wizard`:
- El paso "Datos" muestra el acordeón con 7 secciones, una sola abierta a la vez.
- Cada sección tiene su punto de estado y (Ambientes/Planos/Galería) su badge.
- Cargar un campo de cualquier sección y verificar que el punto de estado se actualiza al volver a esa sección.
- El botón "Guardar cambios" sigue guardando TODO junto (probar: cambiar un campo en "Datos" y otro en "Superficies", guardar una sola vez, recargar la página y confirmar que ambos se guardaron).
- "Ambientes" sigue creando ambientes, con el aviso de "declaraste N sin detallar" funcionando.
- El link "Delimitar en el plano →" sigue llevando a `/plano`.
- El acordeón se ve bien tanto en el wizard (`max-w-5xl`) como en la pantalla standalone `/admin/edificios/[id]/pisos/[floorId]` (ancho completo).

- [ ] **Step 4: Confirmar que el editor de depto (`UnitsEditor`/shell de la Fase 1) no se vio afectado**

Este plan no toca ningún archivo de la Fase 1 — confirmar con `git diff --stat` contra el commit anterior a este plan que solo aparecen `components/ui/Accordion.tsx` y `components/admin/FloorUnitsEditor.tsx`.

No hay commit en esta task — si algo falla, se corrige en la task correspondiente y se vuelve a correr esta verificación.
