import { describe, expect, it } from 'vitest';
import { armarMaterial, buscarGrupo, urlMapa, urlSitioProyecto, urlUnidad } from './material';

describe('armarMaterial', () => {
  it('descarta urls vacías o no http y ordena la obra de la más nueva a la más vieja', () => {
    const m = armarMaterial({
      proyecto: { masterplan_image: '  ' },
      edificios: [{ name: 'A', cover_image: null }, { name: 'B', cover_image: 'https://x/b.jpg' }],
      amenities: [{ name: 'Gym', images: ['javascript:alert(1)', 'https://x/g.jpg'] }, { name: 'SUM', images: [] }],
      slides: [{ label: 'Frente', image_url: 'https://x/f.jpg' }],
      avance: {
        stages: [],
        updates: [
          { id: '1', date: '2026-01-01', title: 'Viejo', images: ['https://x/1.jpg'] },
          { id: '2', date: '2026-05-01', title: '', images: ['https://x/2.jpg'] },
          { id: '3', date: '2026-03-01', title: 'Sin fotos', images: [] },
        ],
      },
    });
    expect(m.masterplan).toBeNull();
    expect(m.edificios).toEqual([{ nombre: 'B', urls: ['https://x/b.jpg'] }]);
    expect(m.amenities).toEqual([{ nombre: 'Gym', urls: ['https://x/g.jpg'] }]);
    expect(m.avance.map(g => g.nombre)).toEqual(['2026-05-01', '2026-01-01 · Viejo']);
    expect(m.brief).toBeNull();
  });

  it('brief: url http recortada, o null si está vacía o no es http', () => {
    const base = { edificios: [], amenities: [], slides: [], avance: null };
    expect(armarMaterial({ ...base, proyecto: { masterplan_image: null, brief_pdf_url: ' https://x/b.pdf ' } }).brief).toBe('https://x/b.pdf');
    expect(armarMaterial({ ...base, proyecto: { masterplan_image: null, brief_pdf_url: '  ' } }).brief).toBeNull();
    expect(armarMaterial({ ...base, proyecto: { masterplan_image: null, brief_pdf_url: 'javascript:alert(1)' } }).brief).toBeNull();
  });
});

describe('buscarGrupo', () => {
  const gs = [{ nombre: 'Salón de usos múltiples', urls: ['a'] }, { nombre: 'Pileta', urls: ['b'] }];
  it('ignora tildes y mayúsculas, y acepta coincidencia parcial', () => {
    expect(buscarGrupo(gs, 'salon')?.urls).toEqual(['a']);
    expect(buscarGrupo(gs, 'la pileta')?.urls).toEqual(['b']);
    expect(buscarGrupo(gs, 'gym')).toBeNull();
    expect(buscarGrupo(gs, '  ')).toBeNull();
  });
});

describe('links', () => {
  it('sitio por subdominio o por /proyecto/slug', () => {
    expect(urlSitioProyecto('torres', 'https://admin.x.com/', 'x.com')).toBe('https://torres.x.com');
    expect(urlSitioProyecto('torres', 'https://admin.x.com/', null)).toBe('https://admin.x.com/proyecto/torres');
  });
  it('unidad y mapa', () => {
    expect(urlUnidad('https://s', 'e 1', 'u/1')).toBe('https://s/edificio/e%201/unidad/u%2F1');
    expect(urlMapa(-34.5, -58.4)).toBe('https://www.google.com/maps?q=-34.5,-58.4');
    expect(urlMapa(null, -58.4)).toBeNull();
  });
});
