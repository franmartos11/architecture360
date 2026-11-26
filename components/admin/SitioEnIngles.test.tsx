// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const toast = vi.fn();
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => toast }));

import SitioEnIngles from './SitioEnIngles';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.mockClear();
});

describe('SitioEnIngles', () => {
  it('activa el inglés con su ruta', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ locales: ['es', 'en'] })));
    vi.stubGlobal('fetch', f);
    render(<SitioEnIngles projectId="p1" activo={false} puede />);
    fireEvent.click(screen.getByRole('switch', { name: 'Sitio en inglés' }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/project/idiomas?projectId=p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ ingles: true });
    expect((screen.getByRole('switch', { name: 'Sitio en inglés' }) as HTMLInputElement).checked).toBe(true);
  });

  it('si falla, vuelve atrás y avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    render(<SitioEnIngles projectId="p1" activo={false} puede />);
    fireEvent.click(screen.getByRole('switch', { name: 'Sitio en inglés' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect((screen.getByRole('switch', { name: 'Sitio en inglés' }) as HTMLInputElement).checked).toBe(false);
  });

  it('sin permiso queda deshabilitado', () => {
    render(<SitioEnIngles projectId="p1" activo puede={false} />);
    expect((screen.getByRole('switch', { name: 'Sitio en inglés' }) as HTMLInputElement).disabled).toBe(true);
  });
});
