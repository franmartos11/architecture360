import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import type { Project } from '@/types';

vi.mock('server-only', () => ({}));
vi.mock('@/data/project-repository', () => ({ getSiteProject: vi.fn() }));
vi.mock('@/lib/project-base-path', () => ({ getProjectBasePath: vi.fn(async () => '/proyecto/torre') }));
vi.mock('@/lib/i18n/server', () => ({ getLocale: vi.fn(async () => 'es'), getT: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));
vi.mock('@/components/ui/ProjectChrome', () => ({ default: () => null }));
vi.mock('@/components/analytics/SiteTracker', () => ({ default: () => null }));
vi.mock('@/components/chat/ChatWidgetLoader', () => ({ default: () => null }));
vi.mock('@/components/project-landing/DraftPreviewBar', () => ({ default: () => null }));
vi.mock('@/lib/fonts', () => ({ ALL_FONT_CLASSNAMES: '' }));
vi.mock('@/lib/resolve-theme', () => ({ resolveTheme: () => ({ cssVars: {}, fontFaceCss: '' }) }));

import { getSiteProject } from '@/data/project-repository';
import { getLocale } from '@/lib/i18n/server';
import { LocaleProvider } from '@/lib/i18n/client';
import ProjectLayout from './layout';

const project = (locales: Project['locales']) =>
  ({
    id: 'p', slug: 'torre', name: 'Torre', projectType: 'edificio', saleMode: 'venta', locales,
    buildings: [], units: [], amenities: [], pointsOfInterest: [], aerialSlides: [], processGallery: [], beforeAfter: [],
  }) as unknown as Project;

const render = () => ProjectLayout({ children: null, params: Promise.resolve({ slug: 'torre' }) });

/** El primer elemento del árbol con ese tipo (recorre props.children). */
function buscar(el: unknown, tipo: unknown): ReactElement | null {
  if (!el || typeof el !== 'object') return null;
  const e = el as ReactElement<{ children?: unknown }>;
  if (e.type === tipo) return e;
  const hijos = ([] as unknown[]).concat(e.props?.children ?? []);
  for (const h of hijos) {
    const r = buscar(h, tipo);
    if (r) return r;
  }
  return null;
}

beforeEach(() => vi.mocked(getLocale).mockResolvedValue('es'));

describe('layout del proyecto: idioma', () => {
  it('en inglés, un proyecto sin inglés activado da 404', async () => {
    vi.mocked(getLocale).mockResolvedValue('en');
    vi.mocked(getSiteProject).mockResolvedValue({ project: project(['es']), isDraftPreview: false, canPublish: false } as never);
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('en inglés con inglés activado: reparte el idioma y los disponibles', async () => {
    vi.mocked(getLocale).mockResolvedValue('en');
    vi.mocked(getSiteProject).mockResolvedValue({ project: project(['es', 'en']), isDraftPreview: false, canPublish: false } as never);
    const prov = buscar(await render(), LocaleProvider);
    expect(prov?.props).toMatchObject({ locale: 'en', disponibles: ['es', 'en'] });
  });

  it('en castellano, igual que siempre', async () => {
    vi.mocked(getSiteProject).mockResolvedValue({ project: project(['es']), isDraftPreview: false, canPublish: false } as never);
    const prov = buscar(await render(), LocaleProvider);
    expect(prov?.props).toMatchObject({ locale: 'es', disponibles: ['es'] });
  });
});
