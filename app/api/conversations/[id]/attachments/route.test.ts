import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/blocks', () => ({ isBlockedEitherWay: vi.fn().mockResolvedValue(false) }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { isBlockedEitherWay } from '@/lib/blocks';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const CONVO_ID = '11111111-1111-1111-1111-111111111111';
const params = () => ({ params: Promise.resolve({ id: CONVO_ID }) });

function uploadRequest(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return new Request(`http://localhost/api/conversations/${CONVO_ID}/attachments`, { method: 'POST', body: fd });
}

function pngFile(name = 'photo.png', size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'image/png' });
}

describe('POST /api/conversations/[id]/attachments', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
    vi.mocked(isBlockedEitherWay).mockReset().mockResolvedValue(false);
  });

  it('sin sesión: 401, sin tocar la base', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(uploadRequest({ file: pngFile() }), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('conversación inexistente o no participa: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(uploadRequest({ file: pngFile() }), params());
    expect(res.status).toBe(404);
  });

  it('alguno de los dos bloqueó al otro: 403, no llega a rate-limit ni a subir', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(isBlockedEitherWay).mockResolvedValue(true);

    const res = await POST(uploadRequest({ file: pngFile() }), params());
    expect(res.status).toBe(403);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin subir nada', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Estás subiendo archivos muy rápido' }, { status: 429 }));

    const res = await POST(uploadRequest({ file: pngFile() }), params());
    expect(res.status).toBe(429);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('sin archivo en el FormData: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(uploadRequest({}), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el archivo');
  });

  it('tipo de archivo no permitido: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const badFile = new File([new Uint8Array(10)], 'malware.exe', { type: 'application/x-msdownload' });

    const res = await POST(uploadRequest({ file: badFile }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('no permitido');
  });

  it('imagen que excede el tamaño máximo: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(uploadRequest({ file: pngFile('big.png', 16 * 1024 * 1024) }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('pesa más de');
  });

  it('subida exitosa: sube al bucket privado y devuelve la path prefijada por conversationId, sin URL pública', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ file: pngFile() }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toMatch(new RegExp(`^${CONVO_ID}/.+\\.png$`));
    expect(body.attachmentType).toBe('image');
    expect(body.url).toBeUndefined();
  });

  it('error del storage al subir: 500 con el mensaje', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({ storage: { upload: { data: null, error: { message: 'bucket lleno' } } } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(uploadRequest({ file: pngFile() }), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('bucket lleno');
  });
});
