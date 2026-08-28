import { describe, it, expect } from 'vitest';
import { getProjectTypeConfig, buildingAgreement, unitAgreement, isValidTypeCombo, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE } from './project-types';

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

  it('resuelve el alias legacy "casas" (plural) a "casa" sin marcar fallback', () => {
    const config = getProjectTypeConfig('casas', 'showcase');
    expect(config.isFallback).toBe(false);
    expect(config.buildingLabel).toBe('Casa');
    expect(config.hasUnitStep).toBe(false);
    expect(isValidTypeCombo('casas', 'venta')).toBe(true);
  });

  it('marca isFallback y el eje que no matcheó', () => {
    const ok = getProjectTypeConfig('loteo', 'venta');
    expect(ok.isFallback).toBe(false);
    expect(ok.fallbackFields).toEqual({ type: false, saleMode: false });

    const badType = getProjectTypeConfig('casa-showcase', 'venta');
    expect(badType.isFallback).toBe(true);
    expect(badType.fallbackFields).toEqual({ type: true, saleMode: false });

    const badMode = getProjectTypeConfig('edificio', 'combinado-viejo');
    expect(badMode.isFallback).toBe(true);
    expect(badMode.fallbackFields).toEqual({ type: false, saleMode: true });
  });

  it('isValidTypeCombo rechaza propósitos que la forma no admite', () => {
    expect(isValidTypeCombo('edificio', 'venta')).toBe(true);
    expect(isValidTypeCombo('edificio', 'showcase')).toBe(true);
    expect(isValidTypeCombo('unico', 'showcase')).toBe(true);
    expect(isValidTypeCombo('unico', 'venta')).toBe(false);
    expect(isValidTypeCombo('no-existe', 'venta')).toBe(false);
  });

  it('corrige un combo inválido guardado hacia el propósito que la forma sí admite', () => {
    const config = getProjectTypeConfig('unico', 'venta');
    expect(config.saleMode).toBe('showcase');
    expect(config.showPrice).toBe(false);
    // El combo se corrigió, pero los dos ejes existen en el catálogo — no es
    // un "tipo desconocido", así que no dispara el banner rojo.
    expect(config.isFallback).toBe(false);
  });

  it('hasFloorStep depende de la forma, no del propósito', () => {
    expect(getProjectTypeConfig('edificio', 'venta').hasFloorStep).toBe(true);
    expect(getProjectTypeConfig('edificio', 'showcase').hasFloorStep).toBe(true);
    expect(getProjectTypeConfig('casa', 'venta').hasFloorStep).toBe(false);
    expect(getProjectTypeConfig('casa', 'showcase').hasFloorStep).toBe(false);
  });

  it('unitKind: solo el loteo tiene unidades de tipo "land"', () => {
    expect(getProjectTypeConfig('loteo', 'venta').unitKind).toBe('land');
    expect(getProjectTypeConfig('loteo', 'venta').unitIsLand).toBe(true);
    for (const t of ['edificio', 'duplex', 'casa', 'unico']) {
      expect(getProjectTypeConfig(t, 'showcase').unitIsLand).toBe(false);
    }
  });

  it('singleBuilding: casa y loteo son UNA sola cosa; edificio/dúplex/único admiten varios', () => {
    expect(getProjectTypeConfig('casa', 'venta').singleBuilding).toBe(true);
    expect(getProjectTypeConfig('loteo', 'venta').singleBuilding).toBe(true);
    expect(getProjectTypeConfig('edificio', 'venta').singleBuilding).toBe(false);
    expect(getProjectTypeConfig('duplex', 'venta').singleBuilding).toBe(false);
    expect(getProjectTypeConfig('unico', 'showcase').singleBuilding).toBe(false);
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
