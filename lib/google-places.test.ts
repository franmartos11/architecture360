import { describe, it, expect } from 'vitest';
import { categoryFromGoogleTypes, distanceMeters, formatDistance, isAlreadyAdded } from './google-places';

describe('categoryFromGoogleTypes', () => {
  it('colegio', () => expect(categoryFromGoogleTypes(['primary_school', 'school', 'point_of_interest'])).toBe('colegio'));
  it('farmacia → salud (salud gana sobre comercio)', () => expect(categoryFromGoogleTypes(['pharmacy', 'store'])).toBe('salud'));
  it('supermercado → comercio', () => expect(categoryFromGoogleTypes(['supermarket'])).toBe('comercio'));
  it('parada → transporte', () => expect(categoryFromGoogleTypes(['bus_stop'])).toBe('transporte'));
  it('parque → entretenimiento', () => expect(categoryFromGoogleTypes(['park'])).toBe('entretenimiento'));
  it('desconocido / undefined → otro', () => {
    expect(categoryFromGoogleTypes(['establishment'])).toBe('otro');
    expect(categoryFromGoogleTypes(undefined)).toBe('otro');
  });
});

describe('distanceMeters / formatDistance', () => {
  it('~1 km entre dos puntos de Córdoba', () => {
    const d = distanceMeters({ lat: -31.4201, lng: -64.1888 }, { lat: -31.4111, lng: -64.1888 });
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
  it('formatea metros y kilómetros', () => {
    expect(formatDistance(349.6)).toBe('350 m');
    expect(formatDistance(1234)).toBe('1,2 km');
  });
});

describe('isAlreadyAdded', () => {
  const pois = [{ name: 'Colegio Nuestra Señora del Huerto', latitude: -31.41785, longitude: -64.18935 }];
  it('mismo nombre sin tildes/mayúsculas y a <50 m → true', () =>
    expect(isAlreadyAdded({ name: 'colegio nuestra senora del  huerto', lat: -31.4179, lng: -64.1894 }, pois)).toBe(true));
  it('mismo nombre pero a 2 km → false', () =>
    expect(isAlreadyAdded({ name: 'Colegio Nuestra Señora del Huerto', lat: -31.4358, lng: -64.1894 }, pois)).toBe(false));
  it('POI sin coordenadas nunca matchea', () =>
    expect(isAlreadyAdded({ name: 'X', lat: 0, lng: 0 }, [{ name: 'X', latitude: null, longitude: null }])).toBe(false));
});
