import { describe, expect, it } from 'vitest';
import { compressImage, fitWithin, isCompressibleType, keepCompressed, outputTypeFor, renameFor, shouldCompress } from './image-compress';

const MB = 1024 * 1024;

describe('isCompressibleType', () => {
  it('acepta fotos y deja afuera gif y svg', () => {
    expect(isCompressibleType('image/jpeg')).toBe(true);
    expect(isCompressibleType('image/png')).toBe(true);
    expect(isCompressibleType('image/webp')).toBe(true);
    expect(isCompressibleType('image/HEIC')).toBe(true);
    expect(isCompressibleType('image/gif')).toBe(false);
    expect(isCompressibleType('image/svg+xml')).toBe(false);
    expect(isCompressibleType('')).toBe(false);
  });
});

describe('fitWithin', () => {
  it('achica proporcionalmente por el lado más largo', () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3024, 4032, 2560)).toEqual({ width: 1920, height: 2560 });
  });
  it('nunca agranda', () => {
    expect(fitWithin(1200, 800, 2560)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2560, 100, 2560)).toEqual({ width: 2560, height: 100 });
  });
  it('no deja un lado en cero', () => {
    expect(fitWithin(100_000, 10, 2560).height).toBe(1);
  });
});

describe('shouldCompress', () => {
  const big = { width: 4032, height: 3024 };
  const small = { width: 1600, height: 1200 };

  it('salta gif y svg sin importar el peso', () => {
    expect(shouldCompress({ type: 'image/gif', size: 12 * MB }, big)).toBe(false);
    expect(shouldCompress({ type: 'image/svg+xml', size: 12 * MB }, null)).toBe(false);
  });
  it('salta lo liviano que ya entra en 2560 px', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: 1 * MB }, small)).toBe(false);
  });
  it('comprime lo pesado aunque entre en 2560 px', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: 4 * MB }, small)).toBe(true);
  });
  it('comprime lo liviano que no entra en 2560 px', () => {
    expect(shouldCompress({ type: 'image/png', size: 900 * 1024 }, big)).toBe(true);
  });
  it('sin medidas todavía, decide por tipo (hay que decodificar para saber)', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: 200 * 1024 }, null)).toBe(true);
  });
  it('heic siempre se convierte: el servidor no lo acepta', () => {
    expect(shouldCompress({ type: 'image/heic', size: 300 * 1024 }, small)).toBe(true);
  });
  it('respeta opciones propias', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: 1 * MB }, small, { maxSide: 1024 })).toBe(true);
    expect(shouldCompress({ type: 'image/jpeg', size: 1 * MB }, small, { skipBelowBytes: 512 * 1024 })).toBe(true);
  });
});

describe('outputTypeFor / renameFor', () => {
  it('webp sigue webp, el resto pasa a jpeg', () => {
    expect(outputTypeFor('image/webp')).toBe('image/webp');
    expect(outputTypeFor('image/png')).toBe('image/jpeg');
    expect(outputTypeFor('image/heic')).toBe('image/jpeg');
  });
  it('cambia la extensión para que coincida con el tipo', () => {
    expect(renameFor('IMG_0042.HEIC', 'image/jpeg')).toBe('IMG_0042.jpg');
    expect(renameFor('plano.final.png', 'image/jpeg')).toBe('plano.final.jpg');
    expect(renameFor('foto', 'image/webp')).toBe('foto.webp');
    expect(renameFor('.png', 'image/jpeg')).toBe('foto.jpg');
  });
});

describe('keepCompressed', () => {
  it('se queda con el original si no achicó medidas y pesa igual o más', () => {
    expect(keepCompressed({ type: 'image/jpeg', size: 2 * MB }, 2.1 * MB, false)).toBe(false);
    expect(keepCompressed({ type: 'image/jpeg', size: 2 * MB }, 1 * MB, false)).toBe(true);
  });
  it('si redimensionó, se queda con el nuevo', () => {
    expect(keepCompressed({ type: 'image/png', size: 1 * MB }, 1.2 * MB, true)).toBe(true);
  });
  it('heic se queda siempre con el convertido', () => {
    expect(keepCompressed({ type: 'image/heic', size: 1 * MB }, 3 * MB, false)).toBe(true);
  });
});

describe('compressImage fuera del navegador', () => {
  it('devuelve el original sin romper', async () => {
    const file = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });
    await expect(compressImage(file)).resolves.toBe(file);
  });
});
