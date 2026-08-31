'use client';

import { useState, useEffect } from 'react';
import LeadCaptureModal from '@/components/ui/LeadCaptureModal';

// Mezcla el valor configurado por el admin en las opciones fijas del
// select, para que quede seleccionable aunque no coincida con ninguna
// de las predefinidas (ej. una tasa de 5.5% con opciones 6.5/7/8).
function withValue(options: number[], value: number) {
  return options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
}

export default function Calculator({ projectSlug }: { projectSlug: string }) {
  const [modelo, setModelo] = useState(195000);
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

  // Fórmula monto: modelo - (modelo * prima / 100)
  const monto = modelo - (modelo * prima / 100);

  // Fórmula cuota: derivada de modelo/prima/tasa/plazo, no necesita estado
  // ni efecto propio — se recalcula sola en cada render.
  const resultado = (() => {
    const r = tasa / 12 / 100;
    const n = plazo * 12;
    if (r === 0) return monto / n;
    const pow = Math.pow(1 + r, n);
    return (monto * (r * pow)) / (pow - 1);
  })();

  const formatUSD = (val: number) => {
    return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USD";
  };

  return (
    <div id="cotizador" className="w-full bg-[var(--theme-bg)] py-20 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-12 items-center">
        {/* Formulario */}
        <div className="w-full md:w-1/2 space-y-6">
          <h2 className="font-[family-name:var(--theme-font-heading)] text-2xl md:text-3xl font-light text-[var(--theme-text)] mb-6 md:mb-8 tracking-wide text-center md:text-left">CALCULA TU CUOTA</h2>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--theme-text)]">Modelo interesado</label>
            <select
              value={modelo}
              onChange={(e) => setModelo(Number(e.target.value))}
              className="p-3 border border-[var(--theme-border)] rounded-[var(--theme-radius)] bg-[var(--theme-surface)] text-[var(--theme-text)] focus:outline-none focus:border-[var(--theme-accent)]"
            >
              <option value="195000">Modelo A desde $195,000 USD</option>
              <option value="245000">Modelo B desde $245,000 USD</option>
              <option value="310000">Modelo C desde $310,000 USD</option>
              <option value="450000">Penthouse desde $450,000 USD</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--theme-text)]">Prima</label>
            <select
              value={prima}
              onChange={(e) => setPrima(Number(e.target.value))}
              className="p-3 border border-[var(--theme-border)] rounded-[var(--theme-radius)] bg-[var(--theme-surface)] text-[var(--theme-text)] focus:outline-none focus:border-[var(--theme-accent)]"
            >
              {primaOptions.map(p => <option key={p} value={p}>{p}%</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--theme-text)]">Tasa de interés</label>
            <select
              value={tasa}
              onChange={(e) => setTasa(Number(e.target.value))}
              className="p-3 border border-[var(--theme-border)] rounded-[var(--theme-radius)] bg-[var(--theme-surface)] text-[var(--theme-text)] focus:outline-none focus:border-[var(--theme-accent)]"
            >
              {tasaOptions.map(t => <option key={t} value={t}>{t}%</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--theme-text)]">Años plazo</label>
            <select
              value={plazo}
              onChange={(e) => setPlazo(Number(e.target.value))}
              className="p-3 border border-[var(--theme-border)] rounded-[var(--theme-radius)] bg-[var(--theme-surface)] text-[var(--theme-text)] focus:outline-none focus:border-[var(--theme-accent)]"
            >
              {plazoOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <label className="text-sm font-semibold text-[var(--theme-text)]">Monto a financiar</label>
            <input
              readOnly
              value={formatUSD(monto)}
              className="p-3 border border-transparent rounded-[var(--theme-radius)] bg-[var(--theme-surface)]/50 text-[var(--theme-text)] font-medium cursor-default"
            />
          </div>
        </div>

        {/* Resultado */}
        <div className="w-full md:w-1/2 bg-[var(--theme-bg-accent)] p-6 sm:p-8 md:p-10 rounded-[var(--theme-radius)] flex flex-col items-center justify-center space-y-4 md:space-y-6 shadow-2xl">
          <div className="text-[var(--theme-text-on-dark-muted)] text-base md:text-lg text-center">Cuota mensual aproximada</div>
          <h2 className="font-[family-name:var(--theme-font-heading)] text-[var(--theme-text-on-dark)] text-3xl sm:text-4xl md:text-5xl font-light text-center">{formatUSD(resultado)}</h2>
          <button
            onClick={() => setIsLeadModalOpen(true)}
            className="w-full mt-2 md:mt-4 px-6 py-3 bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)] hover:opacity-85 transition-opacity duration-300 tracking-wider text-sm"
          >
            SOLICITAR INFORMACIÓN
          </button>
        </div>
      </div>

      <p className="max-w-6xl mx-auto text-xs text-[var(--theme-text-muted)] mt-12 text-center">
        *IMPORTANTE: Este servicio solo para uso de consulta y no representa ninguna obligación para el proyecto. El cálculo corresponde al valor de una cuota mensual. La información puede ser cambiada sin previo aviso. El cálculo solo comprende valor a capital más intereses. No incluye seguros, comisiones, ni otros recargos relacionados.
      </p>

      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        unit={null}
        projectSlug={projectSlug}
        initialMessage={`Hola, me interesa recibir información sobre financiación. Cuota mensual estimada: ${formatUSD(resultado)} (monto a financiar: ${formatUSD(monto)}, ${plazo} años, ${tasa}% de interés).`}
      />
    </div>
  );
}
