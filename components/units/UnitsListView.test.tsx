// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import { LocaleProvider } from '@/lib/i18n/client';
import { getProjectTypeConfig } from '@/lib/project-types';
import type { Locale } from '@/lib/i18n/locales';
import type { Project, Unit } from '@/types';
import UnitsListView from './UnitsListView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/proyecto/torre/en/unidades',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});
// El modal de contacto no es de esta zona ni de este test.
vi.mock('@/components/ui/LeadCaptureModal', () => ({ default: () => null }));

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  window.history.replaceState(null, '', '/proyecto/torre/en/unidades?tipo=2+dormitorios');
});
afterEach(() => cleanup());

const unit = (over: Partial<Unit>): Unit => ({
  id: 'x', dbId: 'x', name: 'x', buildingId: 'b1', floorId: 'f1', floor: 1, type: '2 dormitorios' as Unit['type'],
  totalArea: 60, innerArea: 55, balconyArea: 0, externalArea: 0, bedrooms: 2, bathrooms: 1, hasServiceRoom: false,
  status: 'available', price: 100000, currency: 'USD', ...over,
} as Unit);

const project = {
  id: 'p', slug: 'torre', name: 'Torre', projectType: 'edificio', saleMode: 'venta',
  aerialSlides: [], amenities: [], pointsOfInterest: [], location: '',
  buildings: [{ id: 'b1', name: 'Torre A', floors: [] }],
  units: [
    unit({ id: '1A', dbId: 'u1', name: '1A' }),
    unit({ id: '1B', dbId: 'u2', name: '1B', type: '3 dormitorios' as Unit['type'], bedrooms: 3 }),
    unit({ id: '2A', dbId: 'u3', name: '2A', floor: 2 }),
    unit({ id: '2B', dbId: 'u4', name: '2B', floor: 2, type: 'monoambiente' as Unit['type'], bedrooms: 0 }),
  ],
} as unknown as Project;

function montar(locale: Locale) {
  return render(
    <MotionProvider>
      <LocaleProvider locale={locale} disponibles={['es', 'en']}>
        <UnitsListView project={project} initialQuery="tipo=2+dormitorios" typeConfig={getProjectTypeConfig('edificio', 'venta')} />
      </LocaleProvider>
    </MotionProvider>,
  );
}

/** Nombres de las fichas (escritorio) que quedan en la lista. */
const fichas = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

describe('UnitsListView en inglés: filtro por tipología', () => {
  it('con tipo=2 dormitorios filtra las mismas unidades que en castellano', () => {
    montar('es');
    const enCastellano = fichas();
    cleanup();
    montar('en');
    expect(enCastellano).toEqual(['1A', '2A']);
    expect(fichas()).toEqual(enCastellano);
  });

  it('el chip del filtro muestra "2 bedrooms" (y no el valor guardado en castellano)', () => {
    montar('en');
    expect(screen.getByRole('button', { name: '2 bedrooms · 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '3 bedrooms · 1' })).toBeTruthy();
    expect(screen.queryByText(/dormitorios/)).toBeNull();
  });

  it('al cambiar o quitar el filtro, la URL sigue usando el valor en castellano', () => {
    montar('en');
    expect(window.location.search).toBe('?tipo=2+dormitorios');
    fireEvent.click(screen.getByRole('button', { name: '3 bedrooms · 1' }));
    expect(window.location.search).toBe('?tipo=3+dormitorios');
    expect(fichas()).toEqual(['1B']);
    // Tocar el chip activo quita el filtro.
    fireEvent.click(screen.getByRole('button', { name: '3 bedrooms · 1' }));
    expect(window.location.search).toBe('');
    expect(fichas()).toHaveLength(4);
  });

  it('en castellano, sin cambios: el chip dice "2 dormitorios"', () => {
    montar('es');
    const chip = screen.getByRole('button', { name: '2 dormitorios · 2' });
    expect(within(chip).getByText(/2 dormitorios/)).toBeTruthy();
  });
});
