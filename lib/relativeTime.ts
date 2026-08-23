// Cada entrada es [factor de conversión a la unidad siguiente, nombre en singular].
const UNITS: [number, string][] = [
  [60, 'segundo'],
  [60, 'minuto'],
  [24, 'hora'],
  [7, 'día'],
];

// "hace 2h", "hace 3d" — al estilo de cualquier feed real, en vez de la
// fecha absoluta cruda. Pasada una semana, cae a fecha corta para no
// mostrar "hace 14d" indefinidamente.
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  let seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'ahora';

  for (const [factor, singular] of UNITS) {
    if (seconds < factor) {
      return `hace ${seconds} ${seconds === 1 ? singular : `${singular}s`}`;
    }
    seconds = Math.floor(seconds / factor);
  }

  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}
