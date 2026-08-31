import { describe, it, expect } from 'vitest';
import { shimmerDataUrl } from './imagePlaceholder';

function decode(dataUrl: string): string {
  const base64 = dataUrl.replace('data:image/svg+xml;base64,', '');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

describe('shimmerDataUrl', () => {
  it('devuelve un data URL de SVG en base64', () => {
    const url = shimmerDataUrl();
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('usa 700x475 por defecto', () => {
    const svg = decode(shimmerDataUrl());
    expect(svg).toContain('width="700"');
    expect(svg).toContain('height="475"');
  });

  it('respeta el ancho/alto pasados', () => {
    const svg = decode(shimmerDataUrl(200, 100));
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
  });
});
