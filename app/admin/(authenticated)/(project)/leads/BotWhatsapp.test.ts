// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Proyecto activo controlable desde el test.
const proyecto = vi.hoisted(() => ({ id: 'p1' as string | null }));
vi.mock('@/lib/active-project-context', () => ({
  useActiveProjectId: () => proyecto.id,
  withActiveProject: (url: string, id: string | null) => (id ? `${url}?projectId=${id}` : url),
}));
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => async () => true }));
// next/font no corre en Vitest.
vi.mock('@/lib/panel-comercial-style', () => ({ poppins: { className: '' }, DARK: '#101828' }));

import BotWhatsapp from './BotWhatsapp';

const bot = (projectId: string) => ({
  id: `bot-${projectId}`,
  project_id: projectId,
  estado: 'desconectado',
  host_permitido: 'srv1',
  activo: false,
  nombre_bot: '',
  vendedor_nombre: '',
  vendedor_whatsapp: '',
  conocimiento: '',
  criterio_aviso: '',
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  proyecto.id = 'p1';
});

describe('BotWhatsapp', () => {
  it('cambiar de proyecto con un guardado en vuelo no deja "Guardando…" fijo', async () => {
    const fetchFalso = vi.fn((url: string, init?: RequestInit) => {
      // El PATCH del proyecto 1 no vuelve nunca (en vuelo al cambiar de proyecto).
      if (init?.method === 'PATCH') return new Promise<Response>(() => {});
      if (url.includes('/preguntas')) return Promise.resolve(new Response(JSON.stringify({ preguntas: [] })));
      if (url.includes('/metricas')) return Promise.resolve(new Response(JSON.stringify({ dias: 30, porDia: [], unidades: [] })));
      const id = new URL(url, 'http://x').searchParams.get('projectId') ?? 'p1';
      return Promise.resolve(new Response(JSON.stringify({ bot: bot(id), puenteVivo: true })));
    });
    vi.stubGlobal('fetch', fetchFalso);

    const { rerender } = render(createElement(BotWhatsapp));
    const input = await screen.findByPlaceholderText('Sofía, del equipo de Torre Alba');
    fireEvent.change(input, { target: { value: 'Sofía' } });
    await waitFor(() => expect(screen.getByText('Guardando…')).toBeTruthy(), { timeout: 3000 });

    await act(async () => {
      proyecto.id = 'p2';
      rerender(createElement(BotWhatsapp));
    });
    await screen.findByPlaceholderText('Sofía, del equipo de Torre Alba');
    expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('projectId=p2'));
    expect(screen.queryByText('Guardando…')).toBeNull();
  });

  it('el aviso de servidor caído solo sale si el bot tiene host_permitido', async () => {
    const respuesta = (b: unknown) => vi.fn(async () => new Response(JSON.stringify({ bot: b, puenteVivo: false })));

    vi.stubGlobal('fetch', respuesta({ ...bot('p1'), host_permitido: null }));
    render(createElement(BotWhatsapp));
    await screen.findByText('Falta habilitar el servidor para este proyecto');
    expect(screen.queryByText('El servidor del bot no responde')).toBeNull();
    cleanup();

    vi.stubGlobal('fetch', respuesta(bot('p1')));
    render(createElement(BotWhatsapp));
    await screen.findByText('El servidor del bot no responde');
  });
});
