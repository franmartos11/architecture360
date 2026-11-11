// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import { lapseFrames } from '@/lib/construction-progress-view';
import { visibleUpdates } from '@/lib/construction-progress';
import ConstructionProgressView from '../ConstructionProgressView';
import ProjectHero from '../ProjectHero';
import Summary from './Summary';
import TimeLapse from './TimeLapse';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

beforeAll(() => {
  // jsdom no trae IntersectionObserver (lo usa useInView) ni getBBox (el
  // hero mide el nombre para ajustar la máscara).
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ width: 800, height: 200 } as DOMRect);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  document.body.style.cssText = '';
});

const up = (id: string, date: string, extra: Partial<ConstructionUpdate> = {}): ConstructionUpdate => ({
  id, date, title: `Entrada ${id}`, images: [`/${id}.jpg`], ...extra,
});

const progress = (updates: ConstructionUpdate[], extra: Partial<ConstructionProgress> = {}): ConstructionProgress => ({
  stages: [{ id: 's0', label: 'Estructura' }, { id: 's1', label: 'Terminaciones' }],
  currentStageId: 's1',
  updates,
  ...extra,
});

describe('Resumen', () => {
  it('con movimiento reducido el porcentaje aparece directo, sin contar desde 0', () => {
    render(<MotionProvider><Summary progress={progress([], { percent: 72 })} /></MotionProvider>);
    expect(screen.getByTestId('progress-percent').textContent).toBe('72%');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('72');
  });
});

describe('Carrusel', () => {
  it('no muestra borradores y usa el clip en lugar de la portada', () => {
    const { container } = render(
      <MotionProvider>
        <ConstructionProgressView
          progress={progress([
            up('a', '2026-01-10'),
            up('b', '2026-02-10', { video: '/b.mp4', images: ['/b-poster.jpg'] }),
            up('c', '2026-03-10', { draft: true }),
          ])}
        />
      </MotionProvider>,
    );
    const list = screen.getByRole('list', { name: /Actualizaciones de obra/ });
    expect(within(list).queryByText('Entrada c')).toBeNull();
    expect(within(list).getByText('Entrada a')).toBeTruthy();

    const clipCard = container.querySelector('#avance-b')!;
    const video = clipCard.querySelector('video')!;
    expect(video).toBeTruthy();
    expect(video.getAttribute('src')).toBe('/b.mp4');
    expect(video.getAttribute('poster')).toBe('/b-poster.jpg');
    expect(video.hasAttribute('loop')).toBe(true);
    // La portada del clip no se dibuja además como foto.
    expect(clipCard.querySelector('img')).toBeNull();
    // Cada tarjeta lleva su ancla para el enlace directo.
    expect(container.querySelector('#avance-a')).toBeTruthy();
    expect(container.querySelector('#avance-c')).toBeNull();
  });
});

describe('Time-lapse', () => {
  const p = progress([
    up('a', '2025-08-10', { view: 'Dron' }),
    up('b', '2025-10-10', { view: 'Frente' }),
    up('c', '2025-12-10', { view: 'Dron' }),
    up('d', '2026-02-10', { view: 'Frente' }),
    up('e', '2026-04-10', { view: 'Interior' }),
  ]);
  const frames = lapseFrames(visibleUpdates(p));

  it('el filtro por ángulo deja solo los cuadros de ese ángulo', () => {
    render(<MotionProvider><TimeLapse progress={p} frames={frames} start={0} onClose={() => {}} /></MotionProvider>);
    const group = screen.getByRole('group', { name: 'Ángulo' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Todos', 'Dron', 'Frente']);
    expect(within(group).getByText('Todos').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(group).getByText('Frente'));
    const shown = screen.getAllByTestId('lapse-frame');
    expect(shown.map(f => f.getAttribute('data-angle'))).toEqual(['Frente', 'Frente']);
    // Arranca desde el primer cuadro del ángulo, y la línea de tiempo tiene sus dos entradas.
    expect(screen.getByText('Entrada b')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^(oct 2025|feb 2026)/ })).toHaveLength(2);
  });

  it('Escape cierra, el foco arranca en Cerrar y Tab queda adentro', () => {
    const onClose = vi.fn();
    render(<MotionProvider><TimeLapse progress={p} frames={frames} start={0} onClose={onClose} /></MotionProvider>);
    const close = screen.getByLabelText('Cerrar time-lapse');
    expect(document.activeElement).toBe(close);

    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sin dos ángulos con dos cuadros no hay chips', () => {
    const q = progress([up('a', '2025-08-10', { view: 'Dron' }), up('b', '2025-10-10', { view: 'Dron' }), up('c', '2025-12-10', { view: 'Frente' })]);
    render(<MotionProvider><TimeLapse progress={q} frames={lapseFrames(visibleUpdates(q))} start={0} onClose={() => {}} /></MotionProvider>);
    expect(screen.queryByRole('group', { name: 'Ángulo' })).toBeNull();
  });
});

describe('Hero', () => {
  it('el renglón del avance aparece solo si se lo pasan, y lleva a #avance', () => {
    const { unmount } = render(
      <MotionProvider>
        <ProjectHero name="Torre" image="/hero.jpg" tagline="Vivir cerca" progress={{ href: '#avance', text: '72% de avance · Terminaciones' }} />
      </MotionProvider>,
    );
    const link = screen.getByRole('link', { name: /72% de avance/ });
    expect(link.getAttribute('href')).toBe('#avance');
    unmount();

    render(<MotionProvider><ProjectHero name="Torre" image="/hero.jpg" tagline="Vivir cerca" /></MotionProvider>);
    expect(screen.queryByRole('link', { name: /de avance/ })).toBeNull();
    expect(screen.getByText(/Vivir cerca/)).toBeTruthy();
  });
});
