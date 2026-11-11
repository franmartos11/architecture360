import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { storagePathFromPublicUrl, orphanedMediaPaths, removeOrphanedMedia } from './storage-cleanup';

const PUB = 'https://x.supabase.co/storage/v1/object/public';
const opts = { bucket: 'project-media', folder: 'construction' };

describe('storagePathFromPublicUrl', () => {
  it('saca el path del bucket', () => {
    expect(storagePathFromPublicUrl(`${PUB}/project-media/construction/a.jpg`, 'project-media')).toBe('construction/a.jpg');
  });
  it('decodifica y descarta query strings', () => {
    expect(storagePathFromPublicUrl(`${PUB}/project-media/construction/a%20b.jpg?t=1`, 'project-media')).toBe('construction/a b.jpg');
  });
  it('null para otro bucket, URL externa o basura', () => {
    expect(storagePathFromPublicUrl(`${PUB}/bim-models/a.glb`, 'project-media')).toBeNull();
    expect(storagePathFromPublicUrl('https://images.unsplash.com/photo-1', 'project-media')).toBeNull();
    expect(storagePathFromPublicUrl('no es una url', 'project-media')).toBeNull();
    expect(storagePathFromPublicUrl(`${PUB}/project-media/`, 'project-media')).toBeNull();
  });
  it('path traversal: new URL ya normaliza los ".." y el resultado nunca los contiene', () => {
    const path = storagePathFromPublicUrl(`${PUB}/project-media/construction/%2E%2E/x.jpg`, 'project-media');
    expect(path === null || !path.includes('..')).toBe(true);
    // Y si se escapa de la carpeta, la limpieza de construction/ no lo toma.
    expect(orphanedMediaPaths([`${PUB}/project-media/construction/%2E%2E/x.jpg`], [], opts)).toEqual([]);
  });
});

describe('orphanedMediaPaths', () => {
  it('devuelve lo que estaba y ya no, sin duplicados', () => {
    const a = `${PUB}/project-media/construction/a.jpg`;
    const b = `${PUB}/project-media/construction/b.jpg`;
    expect(orphanedMediaPaths([a, a, b], [b], opts)).toEqual(['construction/a.jpg']);
  });
  it('ignora externas, otra carpeta y otro bucket', () => {
    const before = [
      'https://cdn.otro.com/x.jpg',
      `${PUB}/project-media/general/y.jpg`,
      `${PUB}/bim-models/construction/z.glb`,
    ];
    expect(orphanedMediaPaths(before, [], opts)).toEqual([]);
  });
  it('lo que sigue en after no es huérfano', () => {
    const a = `${PUB}/project-media/construction/a.jpg`;
    expect(orphanedMediaPaths([a], [a], opts)).toEqual([]);
  });
});

describe('removeOrphanedMedia', () => {
  beforeEach(() => vi.mocked(createAdminClient).mockReset());

  it('borra de a 100', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({ storage: { from: vi.fn(() => ({ remove })) } } as never);
    const before = Array.from({ length: 250 }, (_, i) => `${PUB}/project-media/construction/${i}.jpg`);
    await removeOrphanedMedia(before, [], opts);
    expect(remove.mock.calls.map(c => c[0].length)).toEqual([100, 100, 50]);
  });

  it('no lanza si el cliente o el borrado fallan', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = [`${PUB}/project-media/construction/a.jpg`];
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error('sin env'); });
    await expect(removeOrphanedMedia(before, [], opts)).resolves.toBeUndefined();
    vi.mocked(createAdminClient).mockReturnValue({ storage: { from: () => ({ remove: vi.fn().mockRejectedValue(new Error('red')) }) } } as never);
    await expect(removeOrphanedMedia(before, [], opts)).resolves.toBeUndefined();
  });
});
