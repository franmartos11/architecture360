// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => toastSpy }));

import { useShareLink } from './useShareLink';

describe('useShareLink', () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('si navigator.share existe, lo usa y no muestra toast', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });

    const { result } = renderHook(() => useShareLink());
    await result.current('https://x/y', 'Título', 'Texto');

    expect(share).toHaveBeenCalledWith({ title: 'Título', text: 'Texto', url: 'https://x/y' });
    expect(writeText).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('si navigator.share tira (ej. el usuario cancela), no rompe ni muestra toast', async () => {
    const share = vi.fn().mockRejectedValue(new Error('cancelado'));
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });

    const { result } = renderHook(() => useShareLink());
    await expect(result.current('https://x', 'T', 'T')).resolves.toBeUndefined();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('sin navigator.share: copia al portapapeles y avisa con un toast', async () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const { result } = renderHook(() => useShareLink());
    await result.current('https://x/y', 'Título', 'Texto');

    expect(writeText).toHaveBeenCalledWith('https://x/y');
    expect(toastSpy).toHaveBeenCalledWith('Link copiado al portapapeles');
  });
});
