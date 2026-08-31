import { describe, it, expect } from 'vitest';
import { getSunAzimuths } from './sun-position';

describe('getSunAzimuths', () => {
  it('invariante: salida + puesta siempre suman 360°, cuando el sol sale', () => {
    const cases: [number, string][] = [
      [0, '2026-03-20'],
      [-33, '2026-06-21'],
      [40, '2026-12-21'],
      [10, '2026-01-05'],
    ];
    for (const [lat, iso] of cases) {
      const result = getSunAzimuths(lat, new Date(`${iso}T12:00:00Z`));
      expect(result).not.toBeNull();
      expect(result!.sunriseAzimuth + result!.sunsetAzimuth).toBeCloseTo(360, 5);
    }
  });

  it('en el equinoccio, en el ecuador, el sol sale ~90° (este) y se pone ~270° (oeste)', () => {
    const result = getSunAzimuths(0, new Date('2026-03-20T12:00:00Z'));
    expect(result).not.toBeNull();
    expect(result!.sunriseAzimuth).toBeGreaterThan(88);
    expect(result!.sunriseAzimuth).toBeLessThan(92);
    expect(result!.sunsetAzimuth).toBeGreaterThan(268);
    expect(result!.sunsetAzimuth).toBeLessThan(272);
  });

  it('verano en el hemisferio norte: el sol sale al norte del este (azimut < 90°)', () => {
    const result = getSunAzimuths(40, new Date('2026-06-21T12:00:00Z'));
    expect(result).not.toBeNull();
    expect(result!.sunriseAzimuth).toBeLessThan(90);
  });

  it('invierno en el hemisferio norte: el sol sale al sur del este (azimut > 90°)', () => {
    const result = getSunAzimuths(40, new Date('2026-12-21T12:00:00Z'));
    expect(result).not.toBeNull();
    expect(result!.sunriseAzimuth).toBeGreaterThan(90);
  });

  it('devuelve null cuando el sol no sale ni se pone (noche polar)', () => {
    const result = getSunAzimuths(75, new Date('2026-12-21T12:00:00Z'));
    expect(result).toBeNull();
  });
});
