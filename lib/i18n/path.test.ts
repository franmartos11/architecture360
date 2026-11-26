import { describe, expect, it } from 'vitest';
import { conIdioma, separarIdioma } from './path';

describe('separarIdioma', () => {
  it.each([
    ['/en', { locale: 'en', resto: '/', prefijoEs: false }],
    ['/en/', { locale: 'en', resto: '/', prefijoEs: false }],
    ['/en/unidades', { locale: 'en', resto: '/unidades', prefijoEs: false }],
    ['/en/edificio/b1/unidad/101', { locale: 'en', resto: '/edificio/b1/unidad/101', prefijoEs: false }],
    ['/unidades', { locale: 'es', resto: '/unidades', prefijoEs: false }],
    ['/', { locale: 'es', resto: '/', prefijoEs: false }],
    ['/es/unidades', { locale: 'es', resto: '/unidades', prefijoEs: true }],
    ['/es', { locale: 'es', resto: '/', prefijoEs: true }],
    ['/enlace', { locale: 'es', resto: '/enlace', prefijoEs: false }],
    ['/EN/unidades', { locale: 'es', resto: '/EN/unidades', prefijoEs: false }],
  ])('%s', (path, esperado) => {
    expect(separarIdioma(path)).toEqual(esperado);
  });
});

describe('conIdioma', () => {
  it('agrega el segmento solo fuera del castellano', () => {
    expect(conIdioma('/proyecto/torre', 'en')).toBe('/proyecto/torre/en');
    expect(conIdioma('', 'en')).toBe('/en');
    expect(conIdioma('/proyecto/torre', 'es')).toBe('/proyecto/torre');
    expect(conIdioma('', 'es')).toBe('');
  });
});
