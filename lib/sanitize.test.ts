import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeMultiline, sanitizeOptionalText, escapeHtml } from './sanitize';

describe('sanitizeText', () => {
  it('saca cualquier tag HTML', () => {
    expect(sanitizeText('<b>Hola</b> <i>mundo</i>')).toBe('Hola mundo');
  });

  it('saca script/style junto con su contenido (no solo el tag)', () => {
    expect(sanitizeText('<script>alert(1)</script>Hola mundo')).toBe('Hola mundo');
  });

  it('decodifica entidades HTML de vuelta a texto plano después de sacar los tags', () => {
    expect(sanitizeText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
  });

  it('colapsa espacios en blanco (incluye saltos de línea) a uno solo', () => {
    expect(sanitizeText('Hola   \n\n  mundo')).toBe('Hola mundo');
  });

  it('recorta a maxLength', () => {
    expect(sanitizeText('123456789', 5)).toBe('12345');
  });

  it('valores no-string devuelven string vacío', () => {
    expect(sanitizeText(123)).toBe('');
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });
});

describe('sanitizeMultiline', () => {
  it('preserva un salto de línea simple entre párrafos', () => {
    expect(sanitizeMultiline('línea1\nlínea2')).toBe('línea1\nlínea2');
  });

  it('colapsa 3+ saltos de línea seguidos a exactamente 2', () => {
    expect(sanitizeMultiline('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('normaliza CRLF a LF', () => {
    expect(sanitizeMultiline('a\r\nb')).toBe('a\nb');
  });

  it('colapsa espacios/tabs horizontales pero no saltos de línea (trim solo afecta las puntas del string entero)', () => {
    expect(sanitizeMultiline('a   \t  \nb')).toBe('a \nb');
  });

  it('recorta a maxLength', () => {
    expect(sanitizeMultiline('a\nb\nc', 3)).toBe('a\nb');
  });

  it('valores no-string devuelven string vacío', () => {
    expect(sanitizeMultiline(undefined)).toBe('');
  });
});

describe('sanitizeOptionalText', () => {
  it('devuelve el texto sanitizado si queda algo', () => {
    expect(sanitizeOptionalText('  hola  ')).toBe('hola');
  });

  it('devuelve null si queda vacío después de sanitizar', () => {
    expect(sanitizeOptionalText('   ')).toBeNull();
    expect(sanitizeOptionalText('<b></b>')).toBeNull();
  });

  it('devuelve null para valores no-string', () => {
    expect(sanitizeOptionalText(undefined)).toBeNull();
  });
});

describe('escapeHtml', () => {
  it('escapa los 5 caracteres especiales de HTML', () => {
    expect(escapeHtml(`<a href="x">O'Brien & Cía</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Cía&lt;/a&gt;'
    );
  });

  it('no toca texto sin caracteres especiales', () => {
    expect(escapeHtml('texto normal')).toBe('texto normal');
  });

  it('valores no-string devuelven string vacío', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('');
  });
});
