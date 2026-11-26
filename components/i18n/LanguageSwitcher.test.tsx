// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ pathname: '/proyecto/torre/unidades' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import LanguageSwitcher from './LanguageSwitcher';
import { LocaleProvider } from '@/lib/i18n/client';
import { ProjectBasePathProvider } from '@/lib/project-base-path-context';

afterEach(() => cleanup());

const montar = (locale: 'es' | 'en', disponibles: ('es' | 'en')[], basePath: string) =>
  render(
    <LocaleProvider locale={locale} disponibles={disponibles}>
      <ProjectBasePathProvider basePath={basePath}>
        <LanguageSwitcher />
      </ProjectBasePathProvider>
    </LocaleProvider>,
  );

describe('LanguageSwitcher', () => {
  it('sin inglés activado no aparece', () => {
    const { container } = montar('es', ['es'], '/proyecto/torre');
    expect(container.innerHTML).toBe('');
  });

  it('muestra ES / EN, marca el actual y lleva a la misma página en el otro idioma', () => {
    nav.pathname = '/proyecto/torre/unidades';
    montar('es', ['es', 'en'], '/proyecto/torre');
    const es = screen.getByRole('link', { name: 'Español' });
    const en = screen.getByRole('link', { name: 'English' });
    expect(es.getAttribute('aria-current')).toBe('true');
    expect(en.getAttribute('aria-current')).toBeNull();
    expect(en.getAttribute('hreflang')).toBe('en');
    expect(en.getAttribute('href')).toBe('/proyecto/torre/en/unidades');
  });

  it('al cambiar conserva la query (?ref=, filtros)', () => {
    nav.pathname = '/en/unidades';
    window.history.replaceState(null, '', '/en/unidades?ref=perez');
    montar('en', ['es', 'en'], '/en');
    const es = screen.getByRole('link', { name: 'Español' });
    fireEvent.click(es);
    expect(es.getAttribute('href')).toBe('/unidades?ref=perez');
  });
});
