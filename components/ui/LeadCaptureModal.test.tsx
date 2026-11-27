// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/proyecto/torre/edificio/a/unidad/N01-07' }));
vi.mock('@/lib/analytics/send', () => ({ sendEvent: vi.fn() }));

import { sendEvent } from '@/lib/analytics/send';
import SiteTracker from '@/components/analytics/SiteTracker';
import { ProjectWhatsappProvider } from '@/lib/project-whatsapp-context';
import LeadCaptureModal from './LeadCaptureModal';
import type { Unit } from '@/types';

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.open = vi.fn() as unknown as typeof window.open;
});
afterEach(() => cleanup());

const UNIT = { id: 'N01-07', dbId: '44444444-4444-4444-8444-444444444444', name: 'N01-07', modelName: '', floor: 1 } as Unit;

describe('LeadCaptureModal — analítica', () => {
  it('"Consultar por WhatsApp" registra un evento whatsapp con la unidad', () => {
    render(
      <ProjectWhatsappProvider numero="5493515550000">
        <SiteTracker projectSlug="torre" isDraftPreview={false}>
          <LeadCaptureModal isOpen onClose={() => {}} unit={UNIT} projectSlug="torre" />
        </SiteTracker>
      </ProjectWhatsappProvider>,
    );
    vi.mocked(sendEvent).mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: /WhatsApp/ })[0]);
    const events = vi.mocked(sendEvent).mock.calls.map(c => c[0]);
    expect(events.filter(e => e.type === 'whatsapp')).toHaveLength(1);
    expect(events.find(e => e.type === 'whatsapp')).toMatchObject({ unitId: UNIT.dbId });
    expect(window.open).toHaveBeenCalled();
  });
});

// ── Idioma de la página: mensaje prearmado, teléfono y precio ─────────
import { LocaleProvider } from '@/lib/i18n/client';
import { ProjectTypeProvider } from '@/lib/project-type-context';
import type { Locale } from '@/lib/i18n/locales';

const UNIDAD = { id: '101', dbId: '55555555-5555-4555-8555-555555555555', name: '101', modelName: 'Duet', floor: 3, totalArea: 80, price: 85_000_000, currency: 'ARS' } as Unit;

function montar(locale: Locale, unit: Unit | null = UNIDAD) {
  return render(
    <LocaleProvider locale={locale} disponibles={['es', 'en']}>
      <ProjectTypeProvider projectType="edificio" saleMode="venta">
        <LeadCaptureModal isOpen onClose={() => {}} unit={unit} projectSlug="torre" />
      </ProjectTypeProvider>
    </LocaleProvider>,
  );
}

const mensaje = () => (screen.getByLabelText(/Mensaje|Message/) as HTMLTextAreaElement).value;

describe('LeadCaptureModal — idioma de la página', () => {
  it('en castellano, el mensaje por defecto queda igual que siempre', () => {
    montar('es');
    expect(mensaje()).toBe('Hola, me interesa recibir más información sobre la unidad 101 (Duet) en el piso 3.');
  });

  it('en inglés, el mensaje por defecto de una unidad sale en inglés', () => {
    montar('en');
    expect(mensaje()).toBe("Hi, I'd like more information about unit 101 (Duet) on floor 3.");
  });

  it('en inglés, el mensaje por defecto del proyecto sale en inglés', () => {
    montar('en', null);
    expect(mensaje()).toBe("Hi, I'd like more information about the project.");
  });

  it('en inglés, el precio de la unidad usa separadores de EE. UU.', () => {
    montar('en');
    expect(screen.getByText(/ARS\s85,000,000/)).toBeTruthy();
  });

  describe('teléfono', () => {
    const enviado = async (locale: Locale, telefono: string) => {
      const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
      vi.stubGlobal('fetch', fetchMock);
      montar(locale);
      fireEvent.change(screen.getByLabelText(/Nombre y apellido|Full name/), { target: { value: 'Ana' } });
      fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'ana@example.com' } });
      fireEvent.change(document.getElementById('lead-m-phone')!, { target: { value: telefono } });
      fireEvent.submit(document.getElementById('lead-form-mobile')!);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      vi.unstubAllGlobals();
      const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
      return JSON.parse(String(init.body)).phone as string;
    };

    it('en castellano: caja fija +54 y se antepone al enviar', async () => {
      expect(await enviado('es', '387 123 4567')).toBe('+54 387 123 4567');
      expect(screen.getByText('+54')).toBeTruthy();
    });

    it('en inglés: sin +54 forzado, el número va tal cual se escribió', async () => {
      expect(await enviado('en', '305 555 1234')).toBe('305 555 1234');
      expect(screen.queryByText('+54')).toBeNull();
      expect((document.getElementById('lead-m-phone') as HTMLInputElement).placeholder).toBe('+1 305 555 1234');
    });
  });
});
