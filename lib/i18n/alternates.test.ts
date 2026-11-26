import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/project-canonical', () => ({
  projectCanonical: vi.fn(async (slug: string, sub = '') => `https://atrium.app/proyecto/${slug}${sub}`),
}));

import { alternatesFor } from './alternates';
import { hrefOtroIdioma, sinIdioma } from './path';

describe('alternatesFor', () => {
  it('con inglés: canonical del idioma actual y las dos versiones enlazadas', async () => {
    expect(await alternatesFor('torre', '/unidades', ['es', 'en'], 'en')).toEqual({
      canonical: 'https://atrium.app/proyecto/torre/en/unidades',
      languages: {
        es: 'https://atrium.app/proyecto/torre/unidades',
        en: 'https://atrium.app/proyecto/torre/en/unidades',
        'x-default': 'https://atrium.app/proyecto/torre/unidades',
      },
    });
  });

  it('la portada', async () => {
    const a = await alternatesFor('torre', '', ['es', 'en'], 'es');
    expect(a.canonical).toBe('https://atrium.app/proyecto/torre');
    expect(a.languages?.en).toBe('https://atrium.app/proyecto/torre/en');
  });

  it('sin inglés: solo el canonical de siempre', async () => {
    expect(await alternatesFor('torre', '/unidades', ['es'], 'es')).toEqual({ canonical: 'https://atrium.app/proyecto/torre/unidades' });
  });
});

describe('hrefOtroIdioma', () => {
  it('de inglés a castellano, conservando la query', () => {
    expect(hrefOtroIdioma('/proyecto/torre/en/unidades', '?ref=perez&tipo=2%20dormitorios', '/proyecto/torre', 'es'))
      .toBe('/proyecto/torre/unidades?ref=perez&tipo=2%20dormitorios');
  });

  it('de castellano a inglés', () => {
    expect(hrefOtroIdioma('/proyecto/torre/unidades', '', '/proyecto/torre', 'en')).toBe('/proyecto/torre/en/unidades');
    expect(hrefOtroIdioma('/proyecto/torre', '', '/proyecto/torre', 'en')).toBe('/proyecto/torre/en');
    expect(hrefOtroIdioma('/proyecto/torre/en', '', '/proyecto/torre', 'es')).toBe('/proyecto/torre');
  });

  it('en subdominio o dominio propio', () => {
    expect(hrefOtroIdioma('/unidades', '?ref=x', '', 'en')).toBe('/en/unidades?ref=x');
    expect(hrefOtroIdioma('/en', '', '', 'es')).toBe('/');
    expect(hrefOtroIdioma('/', '', '', 'en')).toBe('/en');
  });
});

describe('sinIdioma', () => {
  it('saca el /en final del base path', () => {
    expect(sinIdioma('/proyecto/torre/en', 'en')).toBe('/proyecto/torre');
    expect(sinIdioma('/en', 'en')).toBe('');
    expect(sinIdioma('/proyecto/torre', 'es')).toBe('/proyecto/torre');
  });
});
