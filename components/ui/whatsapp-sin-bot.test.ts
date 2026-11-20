// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => createElement('span', { 'data-img': alt }),
}));
vi.mock('@/components/ui/TransitionUtils', () => ({
  TransitionLink: ({ children, href }: { children: ReactNode; href: string }) => createElement('a', { href }, children),
}));
vi.mock('@/components/ui/ShareMenu', () => ({ default: () => null }));

import LeadCaptureModal from '@/components/ui/LeadCaptureModal';
import UnitMobileView from '@/components/unit/UnitMobileView';
import { ProjectWhatsappProvider } from '@/lib/project-whatsapp-context';
import type { Unit } from '@/types';

// En el sitio público, sin bot de WhatsApp conectado (sin número en el
// provider) no se ofrece ningún botón de WhatsApp; con número, sí.

// matchMedia queda puesto todo el archivo (no se saca entre tests): alguna
// lectura diferida (framer-motion, el modal) podría llegar después de cleanup.
const media = { angosta: true };
vi.stubGlobal('scrollTo', () => {});
vi.stubGlobal('matchMedia', (q: string) => ({
  get matches() { return !media.angosta; },
  media: q,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
}));

function pantalla(angosta: boolean) {
  media.angosta = angosta;
}

function conNumero(numero: string | null, hijo: ReactNode) {
  return ProjectWhatsappProvider({ numero, children: hijo });
}

const unidad = {
  id: 'u1', name: '107', modelName: '', buildingId: 'b1', floorId: 'f1', floor: 1, type: 'departamento',
  totalArea: 50, innerArea: 45, balconyArea: 5, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false,
  status: 'available', price: 100000, currency: 'USD',
} as unknown as Unit;

function modal() {
  return createElement(LeadCaptureModal, { isOpen: true, onClose: () => {}, unit: null, projectSlug: 'p1' });
}

function barraMobile() {
  return createElement(UnitMobileView, {
    unit: unidad, allUnits: [unidad], buildingName: 'Torre', floorNumber: 1, basePath: '/proyecto/p1',
    title: 'Unidad 107', heading: '1 dorm.', typeLabel: '1 dorm.', showStatus: true, showPrice: true, showLeads: true,
    showCalculator: false, hasFloorStep: true, unitIsLand: false, isDwelling: true, projectSlug: 'p1',
    mediaTabs: [], mediaTab: null, onMediaTabChange: () => {}, renderMedia: () => null, amenities: [],
    hasPointsOfInterest: false, shareUrl: 'https://x', shareText: 'x', onBack: () => {}, backLabel: 'Volver',
    onContact: () => {},
  });
}

afterEach(() => {
  cleanup();
});

describe('WhatsApp en el sitio público solo con bot conectado', () => {
  it('modal en mobile sin bot: ni "Escribir por WhatsApp" ni el separador', () => {
    pantalla(true);
    render(conNumero(null, modal()));
    expect(screen.queryByText('Escribir por WhatsApp')).toBeNull();
    expect(screen.queryByText('o dejá tus datos y te llamamos')).toBeNull();
  });

  it('modal en mobile con bot: botón y separador', () => {
    pantalla(true);
    render(conNumero('5491144440000', modal()));
    expect(screen.getByText('Escribir por WhatsApp')).toBeTruthy();
    expect(screen.getByText('o dejá tus datos y te llamamos')).toBeTruthy();
  });

  it('modal en escritorio: "Consultar por WhatsApp" solo con bot', () => {
    pantalla(false);
    render(conNumero(null, modal()));
    expect(screen.queryByText('Consultar por WhatsApp')).toBeNull();
    cleanup();
    render(conNumero('5491144440000', modal()));
    expect(screen.getByText('Consultar por WhatsApp')).toBeTruthy();
  });

  it('barra de la unidad en mobile: el botón de WhatsApp solo con bot', () => {
    pantalla(true);
    render(conNumero(null, barraMobile()));
    expect(screen.queryByLabelText('Consultar por WhatsApp')).toBeNull();
    expect(screen.getByText('Consultar')).toBeTruthy();
    cleanup();
    render(conNumero('5491144440000', barraMobile()));
    expect(screen.getByLabelText('Consultar por WhatsApp')).toBeTruthy();
  });
});
