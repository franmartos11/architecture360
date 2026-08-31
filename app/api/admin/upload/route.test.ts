import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

function uploadRequest(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return new Request('http://localhost/api/admin/upload', { method: 'POST', body: fd });
}

function pngFile(name = 'photo.png', size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

describe('POST /api/admin/upload', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión de admin: 401 antes de rate-limitear', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null);

    const res = await POST(uploadRequest({ file: pngFile(), folder: 'units' }));
    expect(res.status).toBe(401);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin subir nada', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const { NextResponse } = await import('next/server');
    const limited = NextResponse.json({ error: 'Estás subiendo archivos muy rápido' }, { status: 429 });
    vi.mocked(rateLimitOrRespond).mockResolvedValue(limited);

    const res = await POST(uploadRequest({ file: pngFile(), folder: 'units' }));
    expect(res.status).toBe(429);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('sin archivo en el FormData: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);

    const res = await POST(uploadRequest({ folder: 'units' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el archivo');
  });

  it('tipo de archivo no permitido: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const badFile = new File([new Uint8Array(10)], 'malware.exe', { type: 'application/x-msdownload' });

    const res = await POST(uploadRequest({ file: badFile, folder: 'units' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('no permitido');
  });

  it('archivo que excede el tamaño máximo para su tipo: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const bigImage = pngFile('big.png', 16 * 1024 * 1024); // > 15MB de imagen

    const res = await POST(uploadRequest({ file: bigImage, folder: 'units' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('pesa más de');
  });

  it('audio con codec pegado al mimeType (MediaRecorder): se reconoce igual', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const audio = new File([new Uint8Array(10)], 'nota.webm', { type: 'audio/webm;codecs=opus' });
    const admin = mockSupabase({ storage: { getPublicUrl: { data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/project-media/mensajes/nota.webm' } } } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ file: audio, folder: 'mensajes' }));
    expect(res.status).toBe(200);
  });

  it('subida exitosa: sube al bucket y devuelve la url pública y el path', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({
      storage: { getPublicUrl: { data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/project-media/units/photo.png' } } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ file: pngFile(), folder: 'units' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://xxx.supabase.co/storage/v1/object/public/project-media/units/photo.png');
    expect(body.path).toMatch(/^units\/.+\.png$/);
  });

  it('carpeta con caracteres raros: se sanea antes de armar el path', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ file: pngFile(), folder: '../../etc' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toMatch(/^-+etc\/.+\.png$/);
  });

  it('error del storage al subir: 500 con el mensaje', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({ storage: { upload: { data: null, error: { message: 'bucket lleno' } } } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ file: pngFile(), folder: 'units' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('bucket lleno');
  });
});
