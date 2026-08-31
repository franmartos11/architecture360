import { describe, it, expect } from 'vitest';
import { THEME_PRESETS, DEFAULT_PRESET_KEY, getPreset } from './theme-presets';

describe('getPreset', () => {
  it('devuelve el preset por key', () => {
    expect(getPreset('editorial').label).toBe('Editorial');
  });

  it('sin key, cae al primero del catálogo', () => {
    expect(getPreset(undefined)).toBe(THEME_PRESETS[0]);
  });

  it('key inexistente cae al primero del catálogo (no tira, no es undefined)', () => {
    expect(getPreset('no-existe')).toBe(THEME_PRESETS[0]);
  });

  it('DEFAULT_PRESET_KEY coincide con el primero del catálogo — si esto falla, revisar que el fallback de getPreset (THEME_PRESETS[0]) siga siendo el default real', () => {
    expect(THEME_PRESETS[0].key).toBe(DEFAULT_PRESET_KEY);
  });
});
