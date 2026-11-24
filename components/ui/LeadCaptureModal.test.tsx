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
