import { describe, it, expect, vi } from 'vitest';

// resolve-theme.ts importa lib/fonts.ts, que a su vez importa next/font/google
// — ese paquete depende del compiler de Next.js y no corre en el entorno
// plano de Vitest. Se mockea con un catálogo mínimo que cubre las mismas
// keys que usan los presets de theme-presets.ts.
vi.mock('./fonts', () => {
  const keys = ['montserrat', 'inter', 'inter-tight', 'space-grotesk', 'fraunces', 'source-serif', 'karla', 'manrope'];
  const CURATED_FONTS = Object.fromEntries(keys.map(k => [k, { key: k, cssVar: `var(--font-${k})` }]));
  return {
    CURATED_FONTS,
    isCuratedFontKey: (key: string) => key in CURATED_FONTS,
  };
});

import { resolveTheme } from './resolve-theme';
import type { CustomFont } from '@/types';

describe('resolveTheme', () => {
  it('sin themeConfig, usa el preset "natural" (default)', () => {
    const { cssVars } = resolveTheme(undefined);
    expect(cssVars['--theme-bg']).toBe('#f5f5f5');
    expect(cssVars['--theme-font-heading']).toBe('var(--font-montserrat)');
    expect(cssVars['--theme-bg-image']).toBe('none');
  });

  it('calcula --theme-text-muted como rgba del color de texto al 65%', () => {
    const { cssVars } = resolveTheme(undefined);
    // text del preset "natural" es #1b1e1c → rgb(27, 30, 28)
    expect(cssVars['--theme-text-muted']).toBe('rgba(27, 30, 28, 0.65)');
  });

  it('customColors pisa los tokens del preset campo por campo', () => {
    const { cssVars } = resolveTheme({ presetKey: 'natural', customColors: { text: '#ff0000' } } as never);
    expect(cssVars['--theme-text']).toBe('#ff0000');
    // el resto de los tokens del preset se mantienen
    expect(cssVars['--theme-accent']).toBe('#968676');
  });

  it('con backgroundImageUrl, los fondos usan color-mix en vez del hex crudo', () => {
    const { cssVars } = resolveTheme({ backgroundImageUrl: 'https://x/bg.jpg' } as never);
    expect(cssVars['--theme-bg']).toBe('color-mix(in srgb, #f5f5f5 94%, transparent)');
    expect(cssVars['--theme-bg-image']).toBe("url('https://x/bg.jpg')");
  });

  it('fuente curada válida pisa la del preset', () => {
    const { cssVars } = resolveTheme({ headingFont: 'fraunces' } as never);
    expect(cssVars['--theme-font-heading']).toBe('var(--font-fraunces)');
  });

  it('fuente inválida (ni curada ni "custom:") cae a la del preset', () => {
    const { cssVars } = resolveTheme({ headingFont: 'algo-que-no-existe' } as never);
    expect(cssVars['--theme-font-heading']).toBe('var(--font-montserrat)');
  });

  it('fuente propia ("custom:") resuelve a un font-face y family propios', () => {
    const ownerFonts: CustomFont[] = [
      { id: 'abc', fileUrl: 'https://x/font.woff2', format: 'woff2' } as CustomFont,
    ];
    const { cssVars, fontFaceCss } = resolveTheme({ headingFont: 'custom:abc' } as never, ownerFonts);
    expect(cssVars['--theme-font-heading']).toBe("'custom-font-abc', sans-serif");
    expect(fontFaceCss).toContain("font-family: 'custom-font-abc'");
    expect(fontFaceCss).toContain("format('woff2')");
  });

  it('"custom:" que no matchea ningún ownerFont cae al fallback del preset', () => {
    const { cssVars, fontFaceCss } = resolveTheme({ headingFont: 'custom:no-existe' } as never, []);
    expect(cssVars['--theme-font-heading']).toBe('var(--font-montserrat)');
    expect(fontFaceCss).toBe('');
  });

  it('mapea formatos de fuente propia a su valor CSS (otf → opentype, desconocido → truetype)', () => {
    const ownerFonts: CustomFont[] = [{ id: 'a', fileUrl: 'x', format: 'otf' } as CustomFont];
    const { fontFaceCss: otf } = resolveTheme({ headingFont: 'custom:a' } as never, ownerFonts);
    expect(otf).toContain("format('opentype')");

    const ownerFonts2: CustomFont[] = [{ id: 'b', fileUrl: 'x', format: 'raro' } as CustomFont];
    const { fontFaceCss: raro } = resolveTheme({ headingFont: 'custom:b' } as never, ownerFonts2);
    expect(raro).toContain("format('truetype')");
  });
});
