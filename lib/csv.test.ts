import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv } from './csv';

describe('toCsv', () => {
  it('une celdas con coma y filas con salto de línea', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\nc,d');
  });

  it('entrecomilla celdas que tienen coma, comillas o salto de línea', () => {
    expect(toCsv([['Suite, Garden']])).toBe('"Suite, Garden"');
    expect(toCsv([['dice "hola"']])).toBe('"dice ""hola"""');
    expect(toCsv([['línea1\nlínea2']])).toBe('"línea1\nlínea2"');
  });

  it('sin filas da string vacío', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('parseCsv', () => {
  it('hace round-trip con toCsv', () => {
    const rows = [
      ['nombre', 'modelo'],
      ['Depto 1A', 'Suite, Garden'],
      ['Depto 1B', 'dice "hola"'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('soporta CRLF y LF mezclados', () => {
    expect(parseCsv('a,b\r\nc,d\ne,f')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']]);
  });

  it('filtra líneas completamente en blanco', () => {
    expect(parseCsv('a,b\n\n\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('captura la última fila aunque no termine en salto de línea', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });
});
