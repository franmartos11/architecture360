import { describe, it, expect } from 'vitest';
import { totalCommonArea } from './amenities';

describe('totalCommonArea', () => {
  it('suma las superficies con distintos formatos', () => {
    expect(totalCommonArea([
      { specs: [{ key: 'SUPERFICIE', value: '240 m²' }] },
      { specs: [{ key: 'Superficie', value: '1.200 m2' }] },
      { specs: [{ key: 'SUPERFICIE', value: '85,5 m²' }] },
    ])).toBe(1526);
  });

  it('ignora amenities sin superficie o con texto no numérico', () => {
    expect(totalCommonArea([
      { specs: [{ key: 'SUPERFICIE', value: '100 m²' }] },
      { specs: [{ key: 'SUPERFICIE', value: 'a definir' }] },
      { specs: [{ key: 'HORARIO', value: '24 h' }] },
      {},
    ])).toBe(100);
  });

  it('null si ninguna trae superficie', () => {
    expect(totalCommonArea([{ specs: [{ key: 'HORARIO', value: '24 h' }] }])).toBeNull();
    expect(totalCommonArea([])).toBeNull();
  });
});
