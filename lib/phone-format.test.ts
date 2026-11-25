import { describe, it, expect } from 'vitest';
import { formatPhoneForDisplay } from './phone-format';

describe('formatPhoneForDisplay', () => {
  it('celular de Buenos Aires (11, dos dígitos)', () => {
    expect(formatPhoneForDisplay('5491122334455')).toBe('+54 9 11 2233-4455');
  });

  it('resto del país: separa el 9 pero no adivina dónde termina la característica', () => {
    // 3 o 4 dígitos según la localidad (351 Córdoba, 2954 Santa Rosa, y hay
    // característica de 4 que empiezan como una de 3: 230 Pilar / 2302 General
    // Pico). Sin la tabla completa, cortar ahí podría quedar mal.
    expect(formatPhoneForDisplay('5493514556677')).toBe('+54 9 3514556677');
    expect(formatPhoneForDisplay('5492954123456')).toBe('+54 9 2954123456');
  });

  it('fijo argentino (sin el 9)', () => {
    expect(formatPhoneForDisplay('541143218765')).toBe('+54 11 4321-8765');
    expect(formatPhoneForDisplay('543514556677')).toBe('+54 3514556677');
  });

  it('acepta el número con símbolos y espacios', () => {
    expect(formatPhoneForDisplay('+54 9 11 2233-4455')).toBe('+54 9 11 2233-4455');
  });

  it('extranjero o formato desconocido: +dígitos, sin inventar agrupaciones', () => {
    expect(formatPhoneForDisplay('59899123456')).toBe('+59899123456'); // Uruguay
    expect(formatPhoneForDisplay('14155552671')).toBe('+14155552671');
    expect(formatPhoneForDisplay('54911223344')).toBe('+54911223344'); // le falta un dígito
    expect(formatPhoneForDisplay('5491522334455')).toBe('+5491522334455'); // 15 no es una característica
  });

  it('vacío', () => {
    expect(formatPhoneForDisplay('')).toBe('');
    expect(formatPhoneForDisplay('abc')).toBe('');
  });
});
