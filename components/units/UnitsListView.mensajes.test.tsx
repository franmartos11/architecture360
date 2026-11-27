// @vitest-environment jsdom
// Mensajes prearmados y precios de la lista de unidades en el idioma de la página.
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import { LocaleProvider } from '@/lib/i18n/client';
import { getProjectTypeConfig } from '@/lib/project-types';
import type { Locale } from '@/lib/i18n/locales';
import type { Project, Unit } from '@/types';
import UnitsListView from './UnitsListView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/proyecto/torre/unidades',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});
// El modal de contacto se reemplaza por uno que muestra el mensaje que recibe.
vi.mock('@/components/ui/LeadCaptureModal', () => ({
  default: (p: { isOpen: boolean; initialMessage?: string }) => (p.isOpen ? <output data-testid="mensaje">{p.initialMessage}</output> : null),
}));

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
beforeEach(() => window.history.replaceState(null, '', '/proyecto/torre/unidades'));
afterEach(() => cleanup());

const unit = (over: Partial<Unit>): Unit => ({
  id: 'x', dbId: 'x', name: 'x', buildingId: 'b1', floorId: 'f1', floor: 1, type: '2 dormitorios' as Unit['type'],
  totalArea: 60, innerArea: 55, balconyArea: 0, externalArea: 0, bedrooms: 2, bathrooms: 1, hasServiceRoom: false,
  status: 'available', price: 85_000_000, currency: 'ARS', ...over,
} as Unit);

const project = {
  id: 'p', slug: 'torre', name: 'Torre', projectType: 'edificio', saleMode: 'venta',
  aerialSlides: [], amenities: [], pointsOfInterest: [], location: '',
  buildings: [{ id: 'b1', name: 'Torre A', floors: [] }],
  units: [unit({ id: '1A', dbId: 'u1', name: '1A' }), unit({ id: '2A', dbId: 'u2', name: '2A', floor: 2, price: 90_000_000 })],
} as unknown as Project;

// Como la página: el typeConfig llega ya en el idioma de la dirección.
function montar(locale: Locale) {
  return render(
    <MotionProvider>
      <LocaleProvider locale={locale} disponibles={['es', 'en']}>
        <UnitsListView project={project} typeConfig={getProjectTypeConfig('edificio', 'venta', locale)} />
      </LocaleProvider>
    </MotionProvider>,
  );
}

describe('UnitsListView: mensaje prearmado del asesor', () => {
  it('en castellano queda igual que siempre', () => {
    montar('es');
    fireEvent.click(screen.getByRole('button', { name: 'Hablar con un asesor' }));
    expect(screen.getByTestId('mensaje').textContent)
      .toBe('Hola, busco unidades en Torre y me gustaría que un asesor me ayude a encontrar la opción indicada.');
  });

  it('en inglés sale en inglés y con "units" (no "unites")', () => {
    montar('en');
    fireEvent.click(screen.getByRole('button', { name: 'Talk to an advisor' }));
    const msg = screen.getByTestId('mensaje').textContent!;
    expect(msg).toBe("Hi, I'm looking for units at Torre and would like an advisor to help me find the right option.");
    expect(msg).not.toMatch(/unites/);
  });
});

describe('UnitsListView: precios con el formato del idioma', () => {
  it('en inglés, pesos con coma de miles', () => {
    montar('en');
    expect(screen.getAllByText(/ARS\s85,000,000/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/85\.000\.000/)).toBeNull();
  });

  it('en castellano, sin cambios', () => {
    montar('es');
    expect(screen.getAllByText(/\$\s85\.000\.000/).length).toBeGreaterThan(0);
  });
});
