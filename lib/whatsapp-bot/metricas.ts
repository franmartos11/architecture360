// Métricas del bot para el panel: cálculos puros sobre lo que lee la ruta.
// Sin imports de next/react.

export const RANGOS_METRICAS = [7, 30, 90] as const;
export type RangoMetricas = (typeof RANGOS_METRICAS)[number];

export type MetricasBot = {
  dias: number;
  conversaciones: number | null;
  mensajesClientes: number | null;
  respuestasBot: number | null;
  leads: number | null;
  leadsCalientes: number | null;
  visitasAgendadas: number | null;
  visitasRealizadas: number | null;
  preguntasPendientes: number | null;
  /** leads / conversaciones, 0–100 (null si falta alguno o no hubo charlas). */
  conversion: number | null;
  /** Conversaciones nuevas por día (YYYY-MM-DD en Argentina), del más viejo al más nuevo. */
  porDia: { fecha: string; conversaciones: number }[];
  /** Unidades que más aparecen en los leads del bot. */
  unidades: { unidad: string; leads: number }[];
};

const fechaAR = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Una fila por día del rango, con 0 donde no hubo conversaciones. */
export function serieDiaria(creadas: string[], dias: number, ahora: Date): { fecha: string; conversaciones: number }[] {
  const cuenta = new Map<string, number>();
  for (const c of creadas) {
    const f = fechaAR(new Date(c));
    cuenta.set(f, (cuenta.get(f) ?? 0) + 1);
  }
  const out: { fecha: string; conversaciones: number }[] = [];
  for (let k = dias - 1; k >= 0; k--) {
    const f = fechaAR(new Date(ahora.getTime() - k * 24 * 3_600_000));
    out.push({ fecha: f, conversaciones: cuenta.get(f) ?? 0 });
  }
  return out;
}

/** Las unidades de leads.unit_name ("2A, 3B") más repetidas. */
export function unidadesMasPedidas(unitNames: (string | null)[], max = 5): { unidad: string; leads: number }[] {
  const cuenta = new Map<string, number>();
  for (const u of unitNames) {
    for (const codigo of (u ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
      cuenta.set(codigo, (cuenta.get(codigo) ?? 0) + 1);
    }
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([unidad, leads]) => ({ unidad, leads }));
}

export function conversion(leads: number | null, conversaciones: number | null): number | null {
  if (leads === null || conversaciones === null || conversaciones === 0) return null;
  return Math.round((leads / conversaciones) * 100);
}
