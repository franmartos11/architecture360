import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Project } from '@/types';

const h = vi.hoisted(() => ({ host: 'torre.plataforma.com' }));
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => h.host }) }));
vi.mock('@/data/project-repository', () => ({ getPublicProjectBySlug: vi.fn() }));
vi.mock('@/data/profile-repository', () => ({ getIndexableProfileHandles: vi.fn(async () => []) }));
vi.mock('@/lib/project-host', () => ({ resolveProjectSlugForHost: vi.fn(async () => 'torre') }));
vi.mock('@/lib/project-content', () => ({
  projectHasContent: () => ({ facade: false, units: true, tour: false, amenities: false, location: false }),
}));

import { getPublicProjectBySlug } from '@/data/project-repository';
import sitemap from './sitemap';

const project = (locales: Project['locales']) => ({ slug: 'torre', locales, buildings: [{ id: 'b1' }] }) as unknown as Project;

beforeEach(() => vi.mocked(getPublicProjectBySlug).mockReset());

describe('sitemap del proyecto', () => {
  it('con inglés activado suma las mismas páginas en /en', async () => {
    vi.mocked(getPublicProjectBySlug).mockResolvedValue(project(['es', 'en']));
    const urls = (await sitemap()).map((r) => r.url);
    expect(urls).toEqual([
      'https://torre.plataforma.com',
      'https://torre.plataforma.com/unidades',
      'https://torre.plataforma.com/edificio/b1',
      'https://torre.plataforma.com/en',
      'https://torre.plataforma.com/en/unidades',
      'https://torre.plataforma.com/en/edificio/b1',
    ]);
  });

  it('sin inglés, como siempre', async () => {
    vi.mocked(getPublicProjectBySlug).mockResolvedValue(project(['es']));
    const urls = (await sitemap()).map((r) => r.url);
    expect(urls.some((u) => u.includes('/en'))).toBe(false);
    expect(urls).toHaveLength(3);
  });
});
