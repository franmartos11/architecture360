import { describe, it, expect } from 'vitest';
import { projectHasContent } from './project-content';

type Source = Parameters<typeof projectHasContent>[0];

function project(over: Partial<Source> = {}): Source {
  return {
    amenities: [],
    pointsOfInterest: [],
    units: [],
    aerialSlides: [],
    masterplanImage: '',
    ...over,
  } as Source;
}

describe('projectHasContent', () => {
  it('proyecto vacío: nada tiene contenido', () => {
    expect(projectHasContent(project())).toEqual({
      amenities: false, location: false, units: false, facade: false, tour: false,
    });
  });

  it('amenities: alcanza una, aunque no tenga foto', () => {
    expect(projectHasContent(project({ amenities: [{ images: [] }] as unknown as Source['amenities'] })).amenities).toBe(true);
  });

  it('ubicación: con coordenadas o con puntos de interés; una sola coordenada no alcanza', () => {
    expect(projectHasContent(project({ latitude: -24.7, longitude: -65.4 })).location).toBe(true);
    expect(projectHasContent(project({ pointsOfInterest: [{}] as unknown as Source['pointsOfInterest'] })).location).toBe(true);
    expect(projectHasContent(project({ latitude: -24.7 })).location).toBe(false);
  });

  it('ubicación: latitud 0 cuenta como coordenada', () => {
    expect(projectHasContent(project({ latitude: 0, longitude: 0 })).location).toBe(true);
  });

  it('fachada: con vista aérea o con imagen de masterplan', () => {
    expect(projectHasContent(project({ aerialSlides: [{}] as unknown as Source['aerialSlides'] })).facade).toBe(true);
    expect(projectHasContent(project({ masterplanImage: 'https://x/m.jpg' })).facade).toBe(true);
  });

  it('unidades y recorrido', () => {
    const p = projectHasContent(project({
      units: [{}] as unknown as Source['units'],
      commonAreasTour: { nodes: [] } as unknown as Source['commonAreasTour'],
    }));
    expect(p.units).toBe(true);
    expect(p.tour).toBe(true);
  });
});
