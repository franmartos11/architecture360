// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type W = Record<string, unknown>;
const win = () => window as unknown as W;

beforeEach(() => {
  vi.resetModules();
  delete win().google;
  document.head.innerHTML = '';
});
afterEach(() => { delete win().google; });

describe('loadGoogleMaps', () => {
  it('con loading=async espera el callback de Google, no el onload del script', async () => {
    const { loadGoogleMaps } = await import('./google-maps-loader');
    let resolved = false;
    const p = loadGoogleMaps('k').then(api => { resolved = true; return api; });

    const script = document.head.querySelector('script')!;
    const src = new URL(script.src);
    expect(src.searchParams.get('loading')).toBe('async');
    const cb = src.searchParams.get('callback');
    expect(cb).toBeTruthy();

    // Bootstrap: google.maps existe pero todavía sin Map.
    win().google = { maps: { importLibrary: vi.fn() } };
    script.onload?.(new Event('load'));
    await Promise.resolve();
    expect(resolved).toBe(false);

    const full = { Map: function Map() {}, importLibrary: vi.fn() };
    win().google = { maps: full };
    (win()[cb!] as () => void)();
    expect(await p).toBe(full);
  });

  it('si google.maps.Map ya está cargado, resuelve sin inyectar el script', async () => {
    const full = { Map: function Map() {} };
    win().google = { maps: full };
    const { loadGoogleMaps } = await import('./google-maps-loader');
    expect(await loadGoogleMaps('k')).toBe(full);
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('error de red: rechaza y permite reintentar', async () => {
    const { loadGoogleMaps } = await import('./google-maps-loader');
    const p = loadGoogleMaps('k');
    document.head.querySelector('script')!.onerror?.(new Event('error'));
    await expect(p).rejects.toThrow();
    loadGoogleMaps('k').catch(() => {});
    expect(document.head.querySelectorAll('script')).toHaveLength(2);
  });
});
