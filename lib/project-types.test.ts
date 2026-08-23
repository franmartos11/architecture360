import { describe, it, expect } from 'vitest';
import { getProjectTypeConfig, buildingAgreement, unitAgreement, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE } from './project-types';

describe('getProjectTypeConfig', () => {
  it('combina forma y propósito de forma independiente', () => {
    const config = getProjectTypeConfig('loteo', 'showcase');
    expect(config.buildingLabel).toBe('Etapa');
    expect(config.unitLabel).toBe('Lote');
    expect(config.showPrice).toBe(false);
    expect(config.showStatus).toBe(false);
    expect(config.showLeads).toBe(false);
  });

  it('venta prende los flags comerciales según la forma lo permita', () => {
    const config = getProjectTypeConfig('edificio', 'venta');
    expect(config.showPrice).toBe(true);
    expect(config.showCalculator).toBe(true);
  });

  it('showCalculator es false si la forma no lo permite, aunque el modo sea venta', () => {
    // Un loteo no se financia como una hipoteca convencional (allowsCalculator: false).
    const config = getProjectTypeConfig('loteo', 'venta');
    expect(config.showCalculator).toBe(false);
    expect(config.showPrice).toBe(true); // el resto de los flags de venta sí prenden
  });

  it('cae al default si el tipo no existe en el catálogo (dato viejo/corrupto)', () => {
    const config = getProjectTypeConfig('algo-que-no-existe', 'venta');
    const fallback = getProjectTypeConfig(DEFAULT_PROJECT_TYPE, 'venta');
    expect(config.buildingLabel).toBe(fallback.buildingLabel);
    expect(config.unitLabel).toBe(fallback.unitLabel);
  });

  it('cae al default si el sale_mode no existe en el catálogo', () => {
    const config = getProjectTypeConfig('edificio', 'algo-que-no-existe');
    expect(config.saleMode).toBe(DEFAULT_SALE_MODE);
  });

  it('hasFloorStep depende de la forma, no del propósito', () => {
    expect(getProjectTypeConfig('edificio', 'venta').hasFloorStep).toBe(true);
    expect(getProjectTypeConfig('edificio', 'showcase').hasFloorStep).toBe(true);
    expect(getProjectTypeConfig('casas', 'venta').hasFloorStep).toBe(false);
    expect(getProjectTypeConfig('casas', 'showcase').hasFloorStep).toBe(false);
  });
});

describe('buildingAgreement / unitAgreement', () => {
  it('concuerda en femenino para "Etapa" (loteo)', () => {
    const config = getProjectTypeConfig('loteo', 'venta');
    const agree = buildingAgreement(config);
    expect(agree.el).toBe('la');
    expect(agree.un).toBe('una');
    expect(agree.del).toBe('de la');
  });

  it('concuerda en masculino para "Edificio"', () => {
    const config = getProjectTypeConfig('edificio', 'venta');
    const agree = buildingAgreement(config);
    expect(agree.el).toBe('el');
    expect(agree.un).toBe('un');
    expect(agree.del).toBe('del');
  });

  it('buildingLabel y unitLabel pueden tener géneros distintos entre sí (loteo: Etapa/f, Lote/m)', () => {
    const config = getProjectTypeConfig('loteo', 'venta');
    expect(buildingAgreement(config).el).toBe('la');
    expect(unitAgreement(config).el).toBe('el');
  });
});
