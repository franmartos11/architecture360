// Calificación del lead que completa la IA al avisar al vendedor: datos
// ordenados (presupuesto, ambientes, plazo...) para filtrar y priorizar en el
// tablero sin leer cada charla. Es un campo solo del bot: nadie lo edita a mano.
// Sin imports de next/react.
import type { CalificacionLead, TemperaturaLead } from '@/types';

export const TEMPERATURA_LABEL: Record<TemperaturaLead, string> = {
  frio: 'Frío',
  tibio: 'Tibio',
  caliente: 'Caliente',
};

const PROPOSITO_LABEL = { vivir: 'para vivir', invertir: 'para invertir', ambos: 'vivir o invertir' } as const;

export type CalificacionEntrada = {
  temperatura: TemperaturaLead;
  presupuesto?: string | null;
  ambientes?: number | null;
  plazo?: string | null;
  proposito?: 'vivir' | 'invertir' | 'ambos' | null;
  financiacion?: boolean | null;
};

const texto = (v: string | null | undefined, max: number) => {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
};

export function normalizarCalificacion(c: CalificacionEntrada, ahora: Date): CalificacionLead {
  const amb = c.ambientes != null && Number.isInteger(c.ambientes) && c.ambientes > 0 && c.ambientes < 20 ? c.ambientes : null;
  return {
    temperatura: c.temperatura,
    presupuesto: texto(c.presupuesto, 80),
    ambientes: amb,
    plazo: texto(c.plazo, 80),
    proposito: c.proposito ?? null,
    financiacion: c.financiacion ?? null,
    actualizada_at: ahora.toISOString(),
  };
}

/**
 * La calificación nueva manda; un dato que esta vez vino vacío conserva el de
 * antes (el cliente no lo repitió, pero lo dijo en otro momento).
 */
export function mezclarCalificacion(previa: CalificacionLead | null | undefined, nueva: CalificacionLead): CalificacionLead {
  if (!previa) return nueva;
  return {
    temperatura: nueva.temperatura,
    presupuesto: nueva.presupuesto ?? previa.presupuesto ?? null,
    ambientes: nueva.ambientes ?? previa.ambientes ?? null,
    plazo: nueva.plazo ?? previa.plazo ?? null,
    proposito: nueva.proposito ?? previa.proposito ?? null,
    financiacion: nueva.financiacion ?? previa.financiacion ?? null,
    actualizada_at: nueva.actualizada_at,
  };
}

/** Una línea para el aviso por WhatsApp: "Caliente · USD 120.000 · 3 amb · ...". */
export function textoCalificacion(c: CalificacionLead): string {
  const p: string[] = [TEMPERATURA_LABEL[c.temperatura]];
  if (c.presupuesto) p.push(`presupuesto ${c.presupuesto}`);
  if (c.ambientes) p.push(`${c.ambientes} amb`);
  if (c.proposito) p.push(PROPOSITO_LABEL[c.proposito]);
  if (c.plazo) p.push(`plazo: ${c.plazo}`);
  if (c.financiacion === true) p.push('necesita financiación');
  if (c.financiacion === false) p.push('sin financiación');
  return p.join(' · ');
}

/** Pares etiqueta/valor para el detalle del lead en el panel. */
export function filasCalificacion(c: CalificacionLead): [string, string][] {
  const f: [string, string][] = [['Interés', TEMPERATURA_LABEL[c.temperatura]]];
  if (c.presupuesto) f.push(['Presupuesto', c.presupuesto]);
  if (c.ambientes) f.push(['Ambientes', String(c.ambientes)]);
  if (c.proposito) f.push(['Para', PROPOSITO_LABEL[c.proposito].replace(/^para /, '')]);
  if (c.plazo) f.push(['Plazo', c.plazo]);
  if (c.financiacion != null) f.push(['Financiación', c.financiacion ? 'La necesita' : 'No la necesita']);
  return f;
}
