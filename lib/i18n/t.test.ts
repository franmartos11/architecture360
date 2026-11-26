import { describe, expect, it } from 'vitest';
import { crearT, type ClaveMensaje } from './t';
import { intlLocale, isLocale, LOCALES, DEFAULT_LOCALE } from './locales';
import { es } from './messages/es';
import { en } from './messages/en';

describe('crearT', () => {
  it('cada idioma con su texto', () => {
    expect(crearT('es')('nav.unidades')).toBe('Unidades');
    expect(crearT('en')('nav.unidades')).toBe('Units');
  });

  it('reemplaza variables; una que falta queda a la vista', () => {
    expect(crearT('en')('chat.saludoConNombre', { nombre: 'Ana' })).toBe("Hi! I'm Ana, the project's virtual assistant. How can I help you?");
    expect(crearT('en')('chat.saludoConNombre')).toContain('{nombre}');
  });

  it('plural con count: _one si es 1, _other si no', () => {
    expect(crearT('es')('unidades.disponibles', { count: 1 })).toBe('1 disponible');
    expect(crearT('es')('unidades.disponibles', { count: 3 })).toBe('3 disponibles');
    expect(crearT('en')('unidades.disponibles', { count: 1 })).toBe('1 available');
    expect(crearT('en')('unidades.disponibles', { count: 3 })).toBe('3 available');
  });

  it('una clave inexistente devuelve la clave sin romper', () => {
    expect(crearT('en')('no.existe' as ClaveMensaje)).toBe('no.existe');
  });

  it('los dos diccionarios tienen las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});

describe('locales', () => {
  it('castellano por defecto, inglés disponible', () => {
    expect(LOCALES).toEqual(['es', 'en']);
    expect(DEFAULT_LOCALE).toBe('es');
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale('es')).toBe('es-AR');
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
