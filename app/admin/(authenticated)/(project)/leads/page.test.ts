// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { replace, busqueda } = vi.hoisted(() => ({ replace: vi.fn(), busqueda: { valor: '' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(busqueda.valor),
  usePathname: () => '/admin/leads',
}));
vi.mock('@/components/ui/TransitionUtils', () => ({
  TransitionLink: ({ children, href }: { children: ReactNode; href: string }) => createElement('a', { href }, children),
}));
// Las pestañas del bot tienen sus propios tests; acá solo importa qué se monta.
vi.mock('./Conversaciones', () => ({ default: () => createElement('div', null, 'PANEL CONVERSACIONES') }));
vi.mock('./BotWhatsapp', () => ({ default: () => createElement('div', null, 'PANEL BOT') }));

import AdminLeads from './page';
import { ProjectRoleProvider } from '@/lib/project-role-context';
import type { ProjectRole } from '@/lib/project-roles';

const leads = [
  { id: 'l1', project_id: 'p1', unit_id: null, unit_name: null, name: 'Ana', email: null, phone: '5491155551234', method: 'whatsapp', message: null, source: 'whatsapp_bot', status: 'nuevo', wa_conversacion_id: 'conv1', created_at: new Date().toISOString() },
  { id: 'l2', project_id: 'p1', unit_id: null, unit_name: null, name: 'Beto', email: 'b@x.com', phone: null, method: 'email', message: null, source: 'form', status: 'nuevo', wa_conversacion_id: null, created_at: new Date().toISOString() },
];

function montar(role: ProjectRole) {
  return render(ProjectRoleProvider({ role, children: createElement(AdminLeads) }));
}

beforeEach(() => {
  replace.mockClear();
  busqueda.valor = '';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.startsWith('/api/admin/leads') ? leads : []),
  })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Leads: encabezado fijo y pestañas por rol', () => {
  it('gestor: un solo título "Leads", pestañas Tablero y Conversaciones, sin Bot', async () => {
    montar('gestor');
    await screen.findAllByText('Ana');
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Leads']);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Tablero', 'Conversaciones']);
  });

  it('el título no cambia entre pestañas (Bot, administrador)', () => {
    busqueda.valor = 'tab=bot';
    montar('administrador');
    expect(screen.getByText('PANEL BOT')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Leads']);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Tablero', 'Conversaciones', 'Bot de WhatsApp']);
  });

  it('?tab=bot para un gestor cae al tablero', async () => {
    busqueda.valor = 'tab=bot';
    montar('gestor');
    expect(screen.queryByText('PANEL BOT')).toBeNull();
    await screen.findAllByText('Ana');
  });

  it('editor: no renderiza nada y vuelve al inicio del panel', async () => {
    const { container } = montar('editor');
    expect(container.textContent).toBe('');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
  });
});

describe('Tablero: "Ver chat"', () => {
  it('va fuera de la tarjeta arrastrable (role="button") y abre la conversación', async () => {
    montar('gestor');
    await screen.findAllByText('Ana');
    const botones = screen.getAllByRole('button', { name: 'Ver chat' });
    expect(botones).toHaveLength(1); // solo el lead que vino del bot
    const boton = botones[0];
    expect(boton.parentElement?.closest('[role="button"]')).toBeNull();
    fireEvent.click(boton);
    expect(replace).toHaveBeenCalledWith('?tab=conversaciones&c=conv1', { scroll: false });
  });
});
