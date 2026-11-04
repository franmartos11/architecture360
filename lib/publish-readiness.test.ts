import { describe, it, expect } from 'vitest';
import { getPublishReadiness } from './publish-readiness';
import { getProjectTypeConfig } from './project-types';

const base = { name: 'Proyecto', masterplanImage: null, aerialSlides: [{}], buildings: [{}], units: [{}] };

describe('getPublishReadiness', () => {
  it('loteo en venta con nombre, imagen y un lote: se puede publicar', () => {
    const r = getPublishReadiness(base, getProjectTypeConfig('loteo', 'venta'));
    expect(r.canPublish).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('loteo en venta sin lotes: falta "al menos un lote"', () => {
    const r = getPublishReadiness({ ...base, units: [] }, getProjectTypeConfig('loteo', 'venta'));
    expect(r.canPublish).toBe(false);
    expect(r.missing).toEqual(['Al menos un lote cargado']);
  });

  it('el masterplan alcanza como imagen principal', () => {
    const r = getPublishReadiness({ ...base, aerialSlides: [], masterplanImage: 'https://x/p.jpg' }, getProjectTypeConfig('edificio', 'venta'));
    expect(r.canPublish).toBe(true);
  });

  it('sin nombre ni imagen: falta los dos', () => {
    const r = getPublishReadiness({ ...base, name: '  ', aerialSlides: [] }, getProjectTypeConfig('edificio', 'venta'));
    expect(r.missing).toHaveLength(2);
  });

  it('edificio en showcase: las unidades son opcionales', () => {
    const r = getPublishReadiness({ ...base, units: [] }, getProjectTypeConfig('edificio', 'showcase'));
    expect(r.canPublish).toBe(true);
  });

  it('casa sin sus datos: no se puede publicar', () => {
    const r = getPublishReadiness({ ...base, buildings: [], units: [] }, getProjectTypeConfig('casa', 'venta'));
    expect(r.missing).toEqual(['Datos de la casa']);
  });
});
