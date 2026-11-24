// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import ProjectHero from './ProjectHero';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

beforeAll(() => {
  // jsdom no trae IntersectionObserver ni getBBox (el hero mide el nombre).
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ width: 800, height: 200 } as DOMRect);
});
afterEach(() => cleanup());

describe('ProjectHero: brief', () => {
  it('con brief: link "Descargar brief" que abre el PDF en otra pestaña', () => {
    render(
      <MotionProvider>
        <ProjectHero name="Torre" image="/hero.jpg" primary={{ href: '/unidades', label: 'Ver disponibilidad' }} briefUrl="https://x/brief/1-a/brief.pdf" />
      </MotionProvider>,
    );
    const link = screen.getByRole('link', { name: /Descargar brief/ });
    expect(link.getAttribute('href')).toBe('https://x/brief/1-a/brief.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('sin brief: no aparece', () => {
    render(<MotionProvider><ProjectHero name="Torre" image="/hero.jpg" primary={{ href: '/unidades', label: 'Ver disponibilidad' }} /></MotionProvider>);
    expect(screen.queryByRole('link', { name: /brief/i })).toBeNull();
  });
});
