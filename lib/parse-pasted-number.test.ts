import { describe, it, expect } from 'vitest';
import { parsePastedNumber } from './parse-pasted-number';

describe('parsePastedNumber', () => {
  it.each([
    ['85', '85'],
    ['85 m²', '85'],
    ['65,5 m2', '65.5'],
    ['65.5', '65.5'],
    ['USD 150.000', '150000'],
    ['$ 1.234.567,89', '1234567.89'],
    ['1,234,567.89', '1234567.89'],
    ['150000', '150000'],
    ['  2  ', '2'],
    ['-3,5', '-3.5'],
    ['1.5', '1.5'],
    ['12.500', '12500'],
  ])('%s → %s', (input, expected) => {
    expect(parsePastedNumber(input)).toBe(expected);
  });

  it('devuelve null si no hay un número', () => {
    expect(parsePastedNumber('consultar')).toBeNull();
    expect(parsePastedNumber('')).toBeNull();
  });
});
