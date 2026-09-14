import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// toStorageKey() matchea contra este prefijo real de URL pública — hace
// falta setearlo antes de importar el módulo para que las URLs de los
// tests de abajo (armadas con BASE) caigan dentro del prefijo esperado.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xxx.supabase.co';

import { bimStorageKeys, deleteBimStorageFiles } from './delete-bim-storage';

const BASE = 'https://xxx.supabase.co/storage/v1/object/public/bim-models';

describe('bimStorageKeys', () => {
  it('junta todas las columnas de archivo y la galería, relativas al bucket', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: `${BASE}/u1/model.frag`,
        properties_url: `${BASE}/u1/props.json`,
        cover_image: `${BASE}/u1/cover.png`,
        source_url: null,
        gallery_images: [`${BASE}/u1/a.png`, `${BASE}/u1/b.png`],
      },
    ]);
    expect(keys.sort()).toEqual(['u1/a.png', 'u1/b.png', 'u1/cover.png', 'u1/model.frag', 'u1/props.json']);
  });

  it('ignora URLs de otro bucket o pegadas a mano', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: null,
        properties_url: null,
        cover_image: 'https://otro-host.com/imagen.png',
        source_url: null,
        gallery_images: ['https://xxx.supabase.co/storage/v1/object/public/project-media/x.png'],
      },
    ]);
    expect(keys).toEqual([]);
  });

  it('rechaza una URL que contiene "/bim-models/" pero no tiene el prefijo real del bucket', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: null,
        properties_url: null,
        cover_image: 'https://evil.example.com/algo/bim-models/u1/model.frag',
        source_url: null,
        gallery_images: ['https://otro-proyecto.supabase.co/storage/v1/object/public/bim-models/u1/a.png'],
      },
    ]);
    expect(keys).toEqual([]);
  });

  it('dedupea — la portada suele ser también la primera foto de la galería', () => {
    const keys = bimStorageKeys([
      {
        geometry_url: null,
        properties_url: null,
        cover_image: `${BASE}/u1/a.png`,
        source_url: null,
        gallery_images: [`${BASE}/u1/a.png`],
      },
    ]);
    expect(keys).toEqual(['u1/a.png']);
  });
});

describe('deleteBimStorageFiles', () => {
  it('sin archivos: no llama a storage', async () => {
    const remove = vi.fn();
    const supabase = { storage: { from: vi.fn(() => ({ remove })) } };
    await deleteBimStorageFiles(supabase as never, [
      { geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
    ]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('borra del bucket bim-models', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ remove }));
    const supabase = { storage: { from } };
    await deleteBimStorageFiles(supabase as never, [
      { geometry_url: `${BASE}/u1/model.frag`, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
    ]);
    expect(from).toHaveBeenCalledWith('bim-models');
    expect(remove).toHaveBeenCalledWith(['u1/model.frag']);
  });
});
