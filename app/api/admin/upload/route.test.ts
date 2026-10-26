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

// La ruta ya no recibe el archivo, solo sus datos (ver lib/signed-upload.ts).
function uploadRequest(fields: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

function pngFile(name = 'photo.png', size = 10) {
  return { name, type: 'image/png', size };
}

describe('POST /api/admin/upload', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión de admin: 401 antes de rate-limitear', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null);

    const res = await POST(uploadRequest({ ...pngFile(), folder: 'units' }));
    expect(res.status).toBe(401);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin subir nada', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const { NextResponse } = await import('next/server');
    const limited = NextResponse.json({ error: 'Estás subiendo archivos muy rápido' }, { status: 429 });
    vi.mocked(rateLimitOrRespond).mockResolvedValue(limited);

    const res = await POST(uploadRequest({ ...pngFile(), folder: 'units' }));
    expect(res.status).toBe(429);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('sin datos del archivo: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);

    const res = await POST(uploadRequest({ folder: 'units' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^name:/);
  });

  it('tipo de archivo no permitido: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const badFile = { name: 'malware.exe', type: 'application/x-msdownload', size: 10 };

    const res = await POST(uploadRequest({ ...badFile, folder: 'units' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('no permitido');
  });

  it('archivo que excede el tamaño máximo para su tipo: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const bigImage = pngFile('big.png', 16 * 1024 * 1024); // > 15MB de imagen

    const res = await POST(uploadRequest({ ...bigImage, folder: 'units' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('pesa más de');
  });

  it('audio con codec pegado al mimeType (MediaRecorder): se reconoce igual', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const audio = { name: 'nota.webm', type: 'audio/webm;codecs=opus', size: 10 };
    const admin = mockSupabase({ storage: { getPublicUrl: { data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/project-media/mensajes/nota.webm' } } } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ ...audio, folder: 'mensajes' }));
    expect(res.status).toBe(200);
    expect((await res.json()).contentType).toBe('audio/webm');
  });

  it('foto 4K de 9MB (más que los 4,5MB que deja pasar Vercel): se firma igual, nunca viaja el archivo', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ ...pngFile('render.png', 9 * 1024 * 1024), folder: 'units' }));
    expect(res.status).toBe(200);
    expect((await res.json()).signedUrl).toContain('/object/upload/sign/units/');
  });

  it('subida firmada: devuelve la url pública, el path y la URL de subida directa', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({
      storage: { getPublicUrl: { data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/project-media/units/photo.png' } } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ ...pngFile(), folder: 'units' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://xxx.supabase.co/storage/v1/object/public/project-media/units/photo.png');
    expect(body.path).toMatch(/^units\/.+\.png$/);
    expect(body.signedUrl).toContain(body.path);
    expect(body.contentType).toBe('image/png');
  });

  it('carpeta con caracteres raros: se sanea antes de armar el path', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ ...pngFile(), folder: '../../etc' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toMatch(/^-+etc\/.+\.png$/);
  });

  it('error del storage al firmar: 500 con el mensaje', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const admin = mockSupabase({ storage: { createSignedUploadUrl: { data: null, error: { message: 'bucket lleno' } } } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ ...pngFile(), folder: 'units' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('bucket lleno');
  });
});
