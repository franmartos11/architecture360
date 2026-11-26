// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import ProjectHero from './ProjectHero';
import QualitiesSection from './QualitiesSection';
import FaqSection from './FaqSection';
import VideoSection, { parseEmbedVideo } from './VideoSection';
import PaymentPlanSection from './PaymentPlanSection';
import HighlightsSection from './HighlightsSection';
import TypologiesSection from './TypologiesSection';
import { withPreviewSampleData } from '@/lib/preview-sample-project';
import { getProjectTypeConfig } from '@/lib/project-types';
import type { Project } from '@/types';

afterEach(() => cleanup());

const typeConfig = getProjectTypeConfig('edificio', 'venta');
const baseProject = {
  id: 'p1',
  slug: 'torre-test',
  name: 'Torre Test',
  description: '',
  location: 'Palermo',
  masterplanImage: '/m.jpg',
  projectType: 'edificio',
  saleMode: 'venta',
  processGallery: [],
  beforeAfter: [],
  collaborators: [],
  aerialSlides: [],
  buildings: [],
  units: [],
  amenities: [],
  pointsOfInterest: [],
  bimModels: [],
  locales: ['es'],
} as Project;

describe('parseEmbedVideo', () => {
  it('convierte URLs de YouTube y Vimeo a iframe embeds', () => {
    expect(parseEmbedVideo('https://www.youtube.com/watch?v=abc123')).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/abc123',
    });
    expect(parseEmbedVideo('https://youtu.be/xyz789')).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/xyz789',
    });
    expect(parseEmbedVideo('https://vimeo.com/987654')).toEqual({
      kind: 'iframe',
      src: 'https://player.vimeo.com/video/987654',
    });
  });

  it('soporta mp4 directo y descarta URLs inválidas', () => {
    expect(parseEmbedVideo('https://cdn.example.com/reel.mp4')).toEqual({
      kind: 'file',
      src: 'https://cdn.example.com/reel.mp4',
    });
    expect(parseEmbedVideo('javascript:alert(1)')).toBeNull();
  });
});

describe('ProjectHero variantes', () => {
  it('renderiza variante comercial con badge y CTA', () => {
    render(
      <MotionProvider>
        <ProjectHero
          variant="comercial"
          badge="8 disponibles"
          name="Torre Test"
          image="/hero.jpg"
          primary={{ href: '/unidades', label: 'Ver disponibilidad' }}
          briefUrl="https://x/brief.pdf"
        />
      </MotionProvider>
    );
    expect(screen.getByText('8 disponibles')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Torre Test' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Descargar brief/ }).getAttribute('href')).toBe('https://x/brief.pdf');
  });

  it('renderiza variante editorial con título y meta', () => {
    render(
      <MotionProvider>
        <ProjectHero
          variant="editorial"
          meta="Palermo · 2027"
          name="Casa Estudio"
          image="/hero.jpg"
        />
      </MotionProvider>
    );
    expect(screen.getByText('Palermo · 2027')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Casa Estudio' })).toBeTruthy();
  });
});

describe('Nuevos bloques (QualitiesSection, FaqSection, VideoSection)', () => {
  it('no renderizan si faltan datos', () => {
    const q = render(<QualitiesSection project={baseProject} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(q.container.innerHTML).toBe('');
    const f = render(<FaqSection project={baseProject} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(f.container.innerHTML).toBe('');
    const v = render(<VideoSection project={baseProject} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(v.container.innerHTML).toBe('');
  });

  it('renderizan calidades, preguntas frecuentes, plan de pagos y diferenciales cuando tienen contenido', () => {
    const projectWithBlocks: Project = {
      ...baseProject,
      themeConfig: {
        qualitiesItems: [{ category: 'Aberturas', detail: 'PVC con DVH' }],
        faqItems: [{ question: '¿Aceptan financiación?', answer: '30% boleto y 24 cuotas.' }],
        paymentPlanItems: [{ label: 'Boleto', value: '30%', note: 'Al firmar' }],
        paymentPlanNote: 'Apto crédito',
        highlightsItems: [{ kicker: 'Ubicación', title: 'Frente al parque', detail: 'Vistas abiertas' }],
      },
    };
    render(<QualitiesSection project={projectWithBlocks} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText('Aberturas')).toBeTruthy();
    expect(screen.getByText('PVC con DVH')).toBeTruthy();

    render(<FaqSection project={projectWithBlocks} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText('¿Aceptan financiación?')).toBeTruthy();
    expect(screen.getByText('30% boleto y 24 cuotas.')).toBeTruthy();

    render(<PaymentPlanSection project={projectWithBlocks} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText('Boleto')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('Apto crédito')).toBeTruthy();

    render(<HighlightsSection project={projectWithBlocks} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText('Frente al parque')).toBeTruthy();
  });

  it('cambia componentes completos entre comercial y editorial', () => {
    const filled = withPreviewSampleData(baseProject, typeConfig).project;

    const comercial = { ...filled, themeConfig: { ...filled.themeConfig, webTemplate: 'comercial' as const } };
    const cView = render(<TypologiesSection project={comercial} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText(/Tipologías y disponibilidad/)).toBeTruthy();
    cView.unmount();

    const editorial = { ...filled, themeConfig: { ...filled.themeConfig, webTemplate: 'editorial' as const } };
    render(<TypologiesSection project={editorial} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText('Catálogo de espacios')).toBeTruthy();

    render(<FaqSection project={editorial} typeConfig={typeConfig} basePath="/proyecto/torre-test" />);
    expect(screen.getByText('Consultas habituales')).toBeTruthy();
  });
});
