// Formato de números de la pantalla Métricas.
export const fmtInt = (v: number | null | undefined) => Number(v ?? 0).toLocaleString('es-AR');
export const fmtPct = (r: number | null | undefined) =>
  r == null ? '—' : `${(r * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
