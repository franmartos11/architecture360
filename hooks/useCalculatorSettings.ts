'use client';

import { useEffect, useState } from 'react';
import type { FinancingPlan } from '@/lib/financing';

// Configuración de la calculadora del sitio (/api/settings): el simulador
// hipotecario y los planes de pago en pozo. La usan la sección Cotizador, el
// modal de la unidad y el bloque de cuota en celular: un solo pedido por
// proyecto y por carga de página.

export interface CalculatorSettings {
  interestRate: number;
  maxYears: number;
  minDownPayment: number;
  financingPlans: FinancingPlan[];
}

const DEFAULTS: CalculatorSettings = { interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [] };

const cache = new Map<string, Promise<CalculatorSettings>>();
// Ya resueltos: el siguiente montaje arranca con el valor (sin render vacío,
// así #cotizador existe desde el primer render en navegaciones internas).
const resolved = new Map<string, CalculatorSettings>();

/** Después de guardar en el panel: que la próxima calculadora vuelva a pedir (vista previa al día). */
export function invalidateCalculatorSettings(projectSlug?: string): void {
  if (projectSlug) { cache.delete(projectSlug); resolved.delete(projectSlug); }
  else { cache.clear(); resolved.clear(); }
}

function load(projectSlug: string): Promise<CalculatorSettings> {
  let p = cache.get(projectSlug);
  if (!p) {
    p = fetch(`/api/settings?projectSlug=${encodeURIComponent(projectSlug)}`)
      .then(res => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((d: Partial<CalculatorSettings> | null) => {
        const s = { ...DEFAULTS, ...(d ?? {}), financingPlans: Array.isArray(d?.financingPlans) ? d.financingPlans : [] };
        resolved.set(projectSlug, s);
        return s;
      })
      .catch(() => {
        cache.delete(projectSlug); // que el próximo intento vuelva a pedir
        return DEFAULTS;
      });
    cache.set(projectSlug, p);
  }
  return p;
}

/** null mientras carga; si falla, los valores por defecto sin planes. */
export function useCalculatorSettings(projectSlug: string): CalculatorSettings | null {
  const [settings, setSettings] = useState<CalculatorSettings | null>(() => resolved.get(projectSlug) ?? null);
  useEffect(() => {
    let alive = true;
    load(projectSlug).then(s => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, [projectSlug]);
  return settings;
}
