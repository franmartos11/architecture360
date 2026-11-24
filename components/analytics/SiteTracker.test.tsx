// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

let pathname = '/proyecto/torre';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/lib/analytics/send', () => ({ sendEvent: vi.fn() }));

import { sendEvent } from '@/lib/analytics/send';
import SiteTracker from './SiteTracker';
import { useUnitViewTracking } from '@/hooks/useUnitViewTracking';

const sent = () => vi.mocked(sendEvent).mock.calls.map(c => c[0]);

function UnitProbe({ id }: { id: string | null }) {
  useUnitViewTracking(id);
  return null;
}

beforeEach(() => {
  vi.mocked(sendEvent).mockReset();
  pathname = '/proyecto/torre';
  window.history.replaceState({}, '', '/proyecto/torre');
});
afterEach(() => cleanup());

describe('SiteTracker', () => {
  it('al montar con ?ref=Perez manda un page con ref perez', () => {
    window.history.replaceState({}, '', '/proyecto/torre?ref=Perez');
    render(<SiteTracker projectSlug="torre" isDraftPreview={false}><p>hola</p></SiteTracker>);
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ type: 'page', projectSlug: 'torre', path: '/proyecto/torre', ref: 'perez' });
  });

  it('cambio de ruta: otro page', () => {
    const { rerender } = render(<SiteTracker projectSlug="torre" isDraftPreview={false}><p /></SiteTracker>);
    pathname = '/proyecto/torre/unidades';
    rerender(<SiteTracker projectSlug="torre" isDraftPreview={false}><p /></SiteTracker>);
    expect(sent().filter(e => e.type === 'page')).toHaveLength(2);
  });

  it('vista previa del borrador: ningún evento', () => {
    const { getByText } = render(
      <SiteTracker projectSlug="torre" isDraftPreview><a href="https://wa.me/5493510000000">WhatsApp</a></SiteTracker>,
    );
    fireEvent.click(getByText('WhatsApp'));
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('clics: WhatsApp y brief se registran, otro link no', () => {
    const { getByText } = render(
      <SiteTracker projectSlug="torre" isDraftPreview={false} briefUrl="https://cdn.x/brief.pdf">
        <a href="https://wa.me/5493510000000?text=hola" onClick={e => e.preventDefault()}>WhatsApp</a>
        <a href="https://cdn.x/brief.pdf" onClick={e => e.preventDefault()}><span>Descargar brief</span></a>
        <a href="https://instagram.com/torre" onClick={e => e.preventDefault()}>Instagram</a>
      </SiteTracker>,
    );
    vi.mocked(sendEvent).mockClear();
    fireEvent.click(getByText('WhatsApp'));
    fireEvent.click(getByText('Descargar brief'));
    fireEvent.click(getByText("Instagram"));
    expect(sent().map(e => e.type)).toEqual(['whatsapp', 'brief']);
  });
});

describe('SiteTracker — compartir no es consultar', () => {
  it('el link de compartir por WhatsApp (sin número) no cuenta como consulta', () => {
    const { getByText } = render(
      <SiteTracker projectSlug="torre" isDraftPreview={false}>
        <a href="https://wa.me/?text=Mir%C3%A1%20esta%20unidad" onClick={e => e.preventDefault()}>Compartir</a>
      </SiteTracker>,
    );
    vi.mocked(sendEvent).mockClear();
    fireEvent.click(getByText('Compartir'));
    expect(sent().filter(e => e.type === 'whatsapp')).toHaveLength(0);
  });
});

describe('useUnitViewTracking', () => {
  it('cambiar de unidad cierra la anterior con su duración (mismo id) y abre la nueva', () => {
    vi.useFakeTimers();
    const tree = (id: string | null) => <SiteTracker projectSlug="torre" isDraftPreview={false}><UnitProbe id={id} /></SiteTracker>;
    const { rerender } = render(tree('u1'));
    act(() => { vi.advanceTimersByTime(12_000); });
    rerender(tree('u2'));
    vi.useRealTimers();

    const units = sent().filter(e => e.type === 'unit');
    expect(units).toHaveLength(3);
    expect(units[0]).toMatchObject({ unitId: 'u1' });
    expect(units[0].durationSeconds).toBeUndefined();
    expect(units[1]).toMatchObject({ id: units[0].id, unitId: 'u1', durationSeconds: 12 });
    expect(units[2]).toMatchObject({ unitId: 'u2' });
    expect(units[2].id).not.toBe(units[0].id);
  });

  it('sin id (unidad de demo o nada seleccionado): no manda nada', () => {
    render(<SiteTracker projectSlug="torre" isDraftPreview={false}><UnitProbe id={null} /></SiteTracker>);
    expect(sent().filter(e => e.type === 'unit')).toHaveLength(0);
  });

  it('pestaña oculta: manda la duración una sola vez', () => {
    render(<SiteTracker projectSlug="torre" isDraftPreview={false}><UnitProbe id="u1" /></SiteTracker>);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    cleanup();
    expect(sent().filter(e => e.type === 'unit' && e.durationSeconds !== undefined)).toHaveLength(1);
  });
});
