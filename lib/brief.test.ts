import { describe, it, expect } from 'vitest';
import { BRIEF_MAX_BYTES, briefWhatsappHref, fileNameFromUrl, pdfFileError } from './brief';

describe('pdfFileError', () => {
  it('PDF de hasta 16 MB: sin error', () => {
    expect(BRIEF_MAX_BYTES).toBe(16 * 1024 * 1024);
    expect(pdfFileError({ type: 'application/pdf', size: 16 * 1024 * 1024 })).toBeNull();
  });

  it('PDF de más de 16 MB: avisa que no se podría mandar por WhatsApp', () => {
    expect(pdfFileError({ type: 'application/pdf', size: 16 * 1024 * 1024 + 1 }))
      .toBe('El PDF pesa más de 16 MB y no se podría mandar por WhatsApp.');
  });

  it('otro tipo de archivo: pide un PDF', () => {
    expect(pdfFileError({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 }))
      .toBe('Tiene que ser un PDF.');
  });
});

describe('fileNameFromUrl', () => {
  it('último segmento decodificado, o brief.pdf si no hay', () => {
    expect(fileNameFromUrl('https://x/brief/1-a/brief-torre-sol.pdf')).toBe('brief-torre-sol.pdf');
    expect(fileNameFromUrl('https://x/brief/1-a/mi%20brief.pdf')).toBe('mi brief.pdf');
    expect(fileNameFromUrl('https://x/')).toBe('brief.pdf');
  });
});

describe('briefWhatsappHref', () => {
  const texto = (href: string) => decodeURIComponent(new URL(href).searchParams.get('text') ?? '');

  it('link wa.me con solo dígitos y el pedido del brief con nombre y proyecto', () => {
    const href = briefWhatsappHref('+54 9 11 5555-0000', 'José "Pepe"', 'Torre Ñandú');
    expect(href.startsWith('https://wa.me/5491155550000?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toBe('Hola, soy José "Pepe", quiero el brief de Torre Ñandú');
    expect(href).not.toContain(' ');
  });

  it('sin nombre: el pedido no dice "soy"', () => {
    expect(texto(briefWhatsappHref('5491155550000', '   ', 'Torre Ñandú'))).toBe('Hola, quiero el brief de Torre Ñandú');
  });
});
