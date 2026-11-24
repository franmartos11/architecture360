// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Navbar from './Navbar';
import { exploreCardsFor } from './ProjectMenu';
import type { ProjectNavInfo } from '@/lib/project-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/proyecto/duplex',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

function info(over: Partial<ProjectNavInfo> = {}): ProjectNavInfo {
  return {
    projectName: 'Duplex Rincones', unitsLabel: 'Unidades', projectSlug: 'duplex', showLeads: true,
    hasTour: false, amenitiesCount: 0, hasAmenities: false, hasLocation: false, hasUnits: false, buildingNames: {}, explore: { hasFacade: false },
    ...over,
  } as ProjectNavInfo;
}

describe('Navbar', () => {
  it('no lista Cotizador ni Avance de obra', () => {
    render(<Navbar info={{ ...info(), showCalculator: true, hasProgress: true } as ProjectNavInfo} />);
    expect(screen.queryByRole('link', { name: /Cotizador/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Avance de obra/ })).toBeNull();
  });

  it('con brief: link "Brief" que abre el PDF en otra pestaña; sin brief no aparece', () => {
    render(<Navbar info={info({ briefUrl: 'https://x/brief/1-a/brief.pdf' })} />);
    const link = screen.getByRole('link', { name: /Brief/ });
    expect(link.getAttribute('href')).toBe('https://x/brief/1-a/brief.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
    cleanup();
    render(<Navbar info={info()} />);
    expect(screen.queryByRole('link', { name: /Brief/ })).toBeNull();
  });

  it('sin amenities, ubicación ni unidades: esos links no aparecen', () => {
    render(<Navbar info={info()} />);
    expect(screen.queryByRole('link', { name: 'Amenities' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ubicación' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Unidades/ })).toBeNull();
  });

  it('con contenido: Amenities, Ubicación y Unidades aparecen', () => {
    render(<Navbar info={info({ amenitiesCount: 3, hasAmenities: true, hasLocation: true, hasUnits: true })} />);
    expect(screen.getByRole('link', { name: 'Amenities' }).getAttribute('href')).toBe('/amenities');
    expect(screen.getByRole('link', { name: 'Ubicación' }).getAttribute('href')).toBe('/ubicacion');
    expect(screen.getByRole('link', { name: /Unidades/ }).getAttribute('href')).toBe('/unidades');
  });
});

describe('exploreCardsFor', () => {
  it('sin fachada no ofrece la tarjeta "Fachada"; con fachada sí', () => {
    expect(exploreCardsFor(info({ hasTour: true }), '').map(c => c.label)).toEqual(['Recorrido 360']);
    expect(exploreCardsFor(info({ explore: { hasFacade: true } }), '').map(c => c.label)).toEqual(['Fachada']);
  });
});
