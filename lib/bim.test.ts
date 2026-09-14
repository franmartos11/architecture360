import { describe, it, expect } from 'vitest';
import { canPublishBimModel, MAX_GALLERY_IMAGES, bimModelHref } from './bim';

describe('canPublishBimModel', () => {
  it('pieza vacía: no se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: null, galleryImages: [] })).toBe(false);
  });

  it('solo imágenes: se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: null, galleryImages: ['https://x/1.png'] })).toBe(true);
  });

  it('solo modelo: se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: 'https://x/m.frag', galleryImages: [] })).toBe(true);
  });

  it('modelo e imágenes: se puede publicar', () => {
    expect(canPublishBimModel({ geometryUrl: 'https://x/m.frag', galleryImages: ['https://x/1.png'] })).toBe(true);
  });

  it('geometryUrl vacío o en blanco no cuenta como modelo', () => {
    expect(canPublishBimModel({ geometryUrl: '   ', galleryImages: [] })).toBe(false);
  });

  it('imágenes en blanco no cuentan — MultiImageUploader deja huecos vacíos al agregar por URL', () => {
    expect(canPublishBimModel({ geometryUrl: null, galleryImages: ['', '  '] })).toBe(false);
  });
});

describe('constantes', () => {
  it('el tope de galería es 30', () => {
    expect(MAX_GALLERY_IMAGES).toBe(30);
  });
});

describe('bimModelHref', () => {
  it('arma la URL pública de la pieza', () => {
    expect(bimModelHref('abc-123')).toBe('/bim/abc-123');
  });
});
