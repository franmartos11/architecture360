// Métricas del bot para el panel: cálculos puros sobre lo que lee la ruta.
// Sin imports de next/react.
import { costoEstimadoUsd } from './ia/uso';

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
  /** Costo de la IA en el período (null si wa_uso_ia todavía no existe). */
  costoIa: CostoIa | null;
};

export type CostoIa = {
  /** USD estimados del bot real (respuestas y seguimientos); null si ningún turno tiene precio. */
  usd: number | null;
  /** Hubo turnos de un modelo sin precio cargado: el total se queda corto. */
  incompleto: boolean;
  turnos: number;
  /** Conversaciones distintas con al menos un turno de la IA. */
  conversaciones: number;
  usdPorConversacion: number | null;
  /** De todo lo que entró al modelo, cuánto se leyó de la caché (0–100). */
  cachePct: number | null;
  /** USD estimados de las pruebas del simulador (aparte). */
  simuladorUsd: number | null;
};

export type FilaUsoIa = {
  origen: string;
  conversacion_id: string | null;
  modelo: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

/** Resume las filas de wa_uso_ia del período en el costo que muestra Métricas. */
export function resumenCostoIa(filas: FilaUsoIa[]): CostoIa {
  let usd: number | null = null;
  let simuladorUsd: number | null = null;
  let incompleto = false;
  let turnos = 0;
  let entrada = 0;
  let deCache = 0;
  const convs = new Set<string>();
  for (const f of filas) {
    const c = costoEstimadoUsd({
      modelo: f.modelo,
      inputTokens: f.input_tokens,
      outputTokens: f.output_tokens,
      cacheReadTokens: f.cache_read_tokens,
      cacheWriteTokens: f.cache_write_tokens,
    });
    if (f.origen === 'simulador') {
      if (c !== null) simuladorUsd = (simuladorUsd ?? 0) + c;
      continue;
    }
    turnos++;
    if (f.conversacion_id) convs.add(f.conversacion_id);
    if (c === null) incompleto = true;
    else usd = (usd ?? 0) + c;
    entrada += f.input_tokens + f.cache_read_tokens + f.cache_write_tokens;
    deCache += f.cache_read_tokens;
  }
  return {
    usd,
    incompleto,
    turnos,
    conversaciones: convs.size,
    usdPorConversacion: usd !== null && convs.size > 0 ? usd / convs.size : null,
    cachePct: entrada > 0 ? Math.round((deCache / entrada) * 100) : null,
    simuladorUsd,
  };
}

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
