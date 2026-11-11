// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import MotionProvider from '@/components/ui/MotionProvider';
import { stubLayout } from '@/components/admin/test-layout';
import ProjectAdminShell from './ProjectAdminShell';

let pathname = '/admin/proyecto';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/hooks/useNewLeadsCount', () => ({ useNewLeadsCount: () => ({ count: 0, markSeen: () => {} }) }));
// El estado de publicación tiene su propio contexto; acá no importa.
vi.mock('@/components/admin/SitePublishStatus', () => ({
  default: () => null,
  PublishReadinessCard: () => null,
}));
vi.mock('@/components/ui/TransitionUtils', () => ({
  TransitionLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
// Instantáneo: se mira dónde queda el indicador, no el resorte.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

beforeAll(stubLayout);
afterEach(cleanup);

const PROJECT = { id: 'p1', slug: 'torre', name: 'Torre', project_type: 'edificio', sale_mode: 'venta' };

function Shell() {
  return (
    <MotionProvider>
      <ProjectAdminShell project={PROJECT} userEmail={null}>
        <p>contenido</p>
      </ProjectAdminShell>
    </MotionProvider>
  );
}

const nav = () => screen.getByRole('navigation');
// El indicador de primer nivel es hijo directo del nav (los de subítems van adentro de su bloque).
const topIndicator = () => nav().querySelector<HTMLElement>(':scope > [data-sliding-indicator]');

describe('ProjectAdminShell — menú', () => {
  it('en la Ficha despliega sus capítulos; en otra sección no', () => {
    pathname = '/admin/proyecto/relato';
    const { rerender } = render(<Shell />);
    const relato = within(nav()).getByRole('link', { name: 'Relato' });
    expect(relato.getAttribute('aria-current')).toBe('page');
    expect(within(nav()).getByRole('link', { name: 'Ficha' }).getAttribute('aria-current')).toBe('true');

    pathname = '/admin/leads';
    rerender(<Shell />);
    return waitFor(() => expect(within(nav()).queryByRole('link', { name: 'Relato' })).toBeNull());
  });

  it('al entrar a "Sitio web" se despliegan Secciones y Estilo', () => {
    pathname = '/admin/leads';
    const { rerender } = render(<Shell />);
    expect(within(nav()).queryByRole('link', { name: 'Estilo' })).toBeNull();
    pathname = '/admin/estilo';
    rerender(<Shell />);
    expect(within(nav()).getByRole('link', { name: 'Estilo' }).getAttribute('aria-current')).toBe('page');
  });

  it('el indicador se para en el ítem activo y lo sigue al navegar', async () => {
    pathname = '/admin/proyecto';
    const { rerender } = render(<Shell />);
    // test-layout: el link de la Ficha es el primero de su bloque → y=10.
    await waitFor(() => expect(topIndicator()!.style.transform).toContain('translateY(10px)'));
    const leads = within(nav()).getByRole('link', { name: /Leads/ });
    // El activo no pinta su propio fondo: lo pone el indicador.
    expect(within(nav()).getByRole('link', { name: 'Ficha' }).className).not.toContain('bg-[#EAE7E0]');

    pathname = '/admin/leads';
    rerender(<Shell />);
    expect(leads.getAttribute('aria-current')).toBe('page');
    expect(leads.className).toContain('font-semibold');
    const y = 10 + Array.from(nav().children).filter(n => !n.hasAttribute('data-sliding-indicator')).indexOf(leads) * 100;
    await waitFor(() => expect(topIndicator()!.style.transform).toContain(`translateY(${y}px)`));
  });
});
