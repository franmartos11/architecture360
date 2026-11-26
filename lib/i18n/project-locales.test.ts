import { describe, expect, it } from 'vitest';
import { parseLocales } from './project-locales';

describe('parseLocales', () => {
  it('castellano siempre primero; ignora lo desconocido y lo repetido', () => {
    expect(parseLocales(null)).toEqual(['es']);
    expect(parseLocales(undefined)).toEqual(['es']);
    expect(parseLocales('en')).toEqual(['es']);
    expect(parseLocales(['en', 'es', 'fr', 'en'])).toEqual(['es', 'en']);
    expect(parseLocales(['en'])).toEqual(['es', 'en']);
    expect(parseLocales([])).toEqual(['es']);
  });
});
