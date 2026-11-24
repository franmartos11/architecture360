// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import type { Project } from '@/types';
import AerialView from './AerialView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/proyecto/torre/masterplan',
}));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});
afterEach(() => cleanup());

function proyecto(over: Partial<Project> = {}): Project {
  return {
    id: 'p1', slug: 'torre', name: 'Torre', description: '', location: 'Palermo',
    masterplanImage: 'https://x/mp.jpg', projectType: 'edificio', saleMode: 'venta',
    aerialSlides: [], buildings: [], units: [], amenities: [], pointsOfInterest: [],
    ...over,
  } as unknown as Project;
}

describe('AerialView: brief', () => {
  it('con brief: botón "Descargar brief" que abre el PDF en otra pestaña', () => {
    render(<MotionProvider><AerialView project={proyecto({ briefPdfUrl: 'https://x/brief/1-a/brief.pdf' })} /></MotionProvider>);
    const link = screen.getByRole('link', { name: /Descargar brief/ });
    expect(link.getAttribute('href')).toBe('https://x/brief/1-a/brief.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('sin brief: no aparece', () => {
    render(<MotionProvider><AerialView project={proyecto()} /></MotionProvider>);
    expect(screen.queryByRole('link', { name: /brief/i })).toBeNull();
  });
});
