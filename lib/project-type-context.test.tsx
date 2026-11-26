// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectTypeProvider, useProjectTypeConfig } from './project-type-context';
import { LocaleProvider } from '@/lib/i18n/client';

afterEach(() => cleanup());

function Etiqueta() {
  return <p>{useProjectTypeConfig().unitLabel}</p>;
}

describe('ProjectTypeProvider', () => {
  it('toma el idioma del sitio', () => {
    render(<LocaleProvider locale="en" disponibles={['es', 'en']}><ProjectTypeProvider projectType="loteo" saleMode="venta"><Etiqueta /></ProjectTypeProvider></LocaleProvider>);
    expect(screen.getByText('Lot')).toBeTruthy();
  });
  it('sin idioma (panel), castellano', () => {
    render(<ProjectTypeProvider projectType="loteo" saleMode="venta"><Etiqueta /></ProjectTypeProvider>);
    expect(screen.getByText('Lote')).toBeTruthy();
  });
});
