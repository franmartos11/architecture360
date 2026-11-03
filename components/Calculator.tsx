'use client';

import { useState, useEffect } from 'react';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import { Container, Pill, SectionHeading } from '@/components/project-landing/ui';
import { formatPrice } from '@/lib/units';

export interface CalculatorModel {
  label: string;
  price: number;
  currency: string;
}

// Mezcla el valor configurado por el admin en las opciones fijas, para que
// quede seleccionable aunque no coincida con ninguna de las predefinidas
// (ej. una tasa de 5.5% con opciones 6.5/7/8).
function withValue(options: number[], value: number) {
  return options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
}

const fmtPct = (n: number) => `${n.toLocaleString('es-AR')}%`;

function Segmented<T extends string | number>({ label, options, value, onChange, format }: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="p-0 mb-3 text-[13px] font-semibold text-[var(--theme-text-muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const on = o === value;
          return (
            <button
              key={String(o)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o)}
              className={`min-h-11 px-[18px] py-2 rounded-[calc(var(--theme-radius)*0.6)] border text-sm font-semibold cursor-pointer transition-colors duration-200 text-left ${
                on
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)] border-[var(--theme-text)]'
                  : 'bg-transparent text-[var(--theme-text)] border-[var(--theme-border)] hover:border-[var(--theme-text)]/40'
              }`}
            >
              {format(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Cotizador de cuota. `models` sale de las unidades con precio del proyecto
 * (ver CalculatorSection); si no hay ninguna, se tipea el valor a mano en
 * vez de inventar modelos con precios que no existen.
 */
export default function Calculator({ projectSlug, models }: { projectSlug: string; models: CalculatorModel[] }) {
  const [modelIndex, setModelIndex] = useState(0);
  const [manualPrice, setManualPrice] = useState('');
  const [prima, setPrima] = useState(15);
  const [tasa, setTasa] = useState(6.5);
  const [plazo, setPlazo] = useState(25);
  const [primaOptions, setPrimaOptions] = useState([15, 20, 25, 30]);
  const [tasaOptions, setTasaOptions] = useState([6.5, 7, 8]);
  const [plazoOptions, setPlazoOptions] = useState([20, 25, 30]);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/settings?projectSlug=${encodeURIComponent(projectSlug)}`)
      .then(res => res.json())
      .then(data => {
        if (!data) return;
        if (data.interestRate != null) {
          setTasaOptions(prev => withValue(prev, data.interestRate));
          setTasa(data.interestRate);
        }
        if (data.maxYears != null) {
          setPlazoOptions(prev => withValue(prev, data.maxYears));
          setPlazo(data.maxYears);
        }
        if (data.minDownPayment != null) {
          setPrimaOptions(prev => withValue(prev, data.minDownPayment));
          setPrima(data.minDownPayment);
        }
      })
      .catch(() => {
        // Si falla, se queda con los valores por defecto — no bloquea la calculadora.
      });
  }, [projectSlug]);

  const model = models[modelIndex];
  const currency = model?.currency ?? 'USD';
  const price = model ? model.price : Number(manualPrice.replace(/\D/g, '')) || 0;

  // Monto: valor - anticipo.
  const monto = price - (price * prima / 100);

  // Cuota (sistema francés): derivada de monto/tasa/plazo en cada render.
  const resultado = (() => {
    const r = tasa / 12 / 100;
    const n = plazo * 12;
    if (r === 0) return monto / n;
    const pow = Math.pow(1 + r, n);
    return (monto * (r * pow)) / (pow - 1);
  })();

  const fmt = (n: number) => formatPrice(Math.round(n), currency);
  const summary = [model?.label, `${prima}% de anticipo`, `${fmtPct(tasa)} anual`, `${plazo} años`].filter(Boolean).join(' · ');

  return (
    <section id="cotizador" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <SectionHeading eyebrow="Cotizador" title="Calculá tu cuota." muted="En segundos." className="mb-12" />
        <div className="flex flex-wrap gap-5">
          <div className="flex-[999_1_520px] min-w-0 border border-[var(--theme-border)] rounded-[calc(var(--theme-radius)*1.4)] p-5 sm:p-8 flex flex-col gap-7">
            {models.length > 0 ? (
              <Segmented
                label="Modelo"
                options={models.map((_, i) => i)}
                value={modelIndex}
                onChange={setModelIndex}
                format={i => `${models[i].label} · ${formatPrice(models[i].price, models[i].currency)}`}
              />
            ) : (
              <label className="flex flex-col gap-3 text-[13px] font-semibold text-[var(--theme-text-muted)]">
                Valor de la propiedad (USD)
                <input
                  inputMode="numeric"
                  value={manualPrice}
                  onChange={e => setManualPrice(e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')).toLocaleString('es-AR') : '')}
                  placeholder="Ej. 120.000"
                  className="h-12 px-4 rounded-[calc(var(--theme-radius)*0.6)] border border-[var(--theme-border)] bg-transparent text-base font-medium text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]"
                />
              </label>
            )}
            <Segmented label="Anticipo" options={primaOptions} value={prima} onChange={setPrima} format={p => `${p}%`} />
            <Segmented label="Tasa de interés anual" options={tasaOptions} value={tasa} onChange={setTasa} format={fmtPct} />
            <Segmented label="Plazo" options={plazoOptions} value={plazo} onChange={setPlazo} format={p => `${p} años`} />
          </div>

          <div className="flex-[1_1_340px] bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)] rounded-[calc(var(--theme-radius)*1.4)] p-6 sm:p-8 flex flex-col justify-between gap-8">
            <div className="flex flex-col gap-5" aria-live="polite">
              <div className="flex justify-between gap-3 text-sm text-[var(--theme-text-on-dark-muted)] pb-4 border-b border-[var(--theme-border-on-dark)]">
                <span>Monto a financiar</span>
                <strong className="text-[var(--theme-text-on-dark)] font-semibold">{price > 0 ? fmt(monto) : '—'}</strong>
              </div>
              <p className="m-0 text-sm text-[var(--theme-text-on-dark-muted)]">Cuota mensual aproximada</p>
              <p className="m-0 -mt-2 font-[family-name:var(--theme-font-heading)] text-[clamp(40px,5vw,64px)] leading-none font-semibold tracking-[-0.04em] tabular-nums">
                {price > 0 ? fmt(resultado) : '—'}
              </p>
              <p className="m-0 text-[13px] text-[var(--theme-text-on-dark-muted)]">{summary}</p>
            </div>
            <div className="flex flex-col gap-3.5">
              <Pill variant="light" arrow size="lg" block onClick={() => setIsLeadModalOpen(true)}>Solicitar información</Pill>
              <p className="m-0 text-[11px] leading-normal text-[var(--theme-text-on-dark-muted)]">
                Cálculo de referencia: capital más intereses. No incluye seguros, comisiones ni otros recargos y puede cambiar sin previo aviso. No representa una obligación para el proyecto.
              </p>
            </div>
          </div>
        </div>
      </Container>

      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        unit={null}
        projectSlug={projectSlug}
        initialMessage={`Hola, me interesa recibir información sobre financiación${model ? ` del modelo ${model.label}` : ''}. Cuota mensual estimada: ${fmt(resultado)} (monto a financiar: ${fmt(monto)}, ${plazo} años, ${tasa}% de interés).`}
      />
    </section>
  );
}
