// Azimut (grados desde el norte, sentido horario: N=0°, E=90°, S=180°,
// O=270°) de salida y puesta de sol en una fecha y latitud dadas —
// fórmula de bajo error (NOAA Solar Calculator simplificado), suficiente
// para un indicador visual en el recorrido 360°, no para uso astronómico
// de precisión. La longitud no entra en esta cuenta: mueve la HORA de
// salida/puesta (huso horario / mediodía solar), no la DIRECCIÓN, que es
// lo único que necesitamos acá.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Corrección estándar de refracción atmosférica + radio aparente del sol
// en el horizonte — el sol "se ve" salir/ponerse cuando su centro
// geométrico todavía está 0.833° bajo el horizonte matemático.
const ZENITH_AT_HORIZON = 90.833 * DEG;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86400000) + 1;
}

// Declinación solar (radianes) — serie de Fourier truncada, error < 0.03°.
function solarDeclination(doy: number): number {
  const gamma = ((2 * Math.PI) / 365) * (doy - 1);
  return (
    0.006918 -
    0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  );
}

export interface SunAzimuths {
  sunriseAzimuth: number;
  sunsetAzimuth: number;
}

// null cuando el sol no sale o no se pone ese día a esa latitud (círculo
// polar) — caso de borde real pero improbable para un proyecto inmobiliario.
export function getSunAzimuths(latitude: number, date: Date = new Date()): SunAzimuths | null {
  const lat = latitude * DEG;
  const decl = solarDeclination(dayOfYear(date));

  const cosHourAngle = (Math.cos(ZENITH_AT_HORIZON) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  if (cosHourAngle <= -1 || cosHourAngle >= 1) return null;

  const cosAzimuth = (Math.sin(decl) - Math.sin(lat) * Math.cos(ZENITH_AT_HORIZON)) / (Math.cos(lat) * Math.sin(ZENITH_AT_HORIZON));
  const sunriseAzimuth = Math.acos(Math.min(1, Math.max(-1, cosAzimuth))) * RAD;

  return { sunriseAzimuth, sunsetAzimuth: 360 - sunriseAzimuth };
}
