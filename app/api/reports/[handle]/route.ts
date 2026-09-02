import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';
import { sanitizeMultiline } from '@/lib/sanitize';

const MAX_REASON_LENGTH = 500;

// entity_type fijo en 'conversation' por ahora — user_reports.entity_type
// admite 'post'/'comment' a propósito para reusar esta misma tabla el día
// que haya reportar-desde-el-feed, sin migrar de nuevo (ver
// supabase/schema.sql).
const reportSchema = z.object({
  reason: z.string().trim().min(1, 'Contá brevemente qué pasó.').max(MAX_REASON_LENGTH),
  entityId: uuidSchema.optional(),
});

// POST /api/reports/[handle] → denunciar un perfil (hoy, desde un hilo de
// mensajes — entityId es el id de la conversación). No hay policy de
// select sobre user_reports: se revisan por fuera de la app, con la
// service_role key — la API solo necesita poder insertar.
export async function POST(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond(
    { key: `reports:user:${user.id}`, windowSeconds: 3600, max: 10 },
    'Ya mandaste varias denuncias — esperá un poco antes de mandar otra.'
  );
  if (limited) return limited;

  const parsed = await parseJsonBody(request, reportSchema);
  if ('error' in parsed) return parsed.error;
  const reason = sanitizeMultiline(parsed.data.reason, MAX_REASON_LENGTH);
  if (!reason) return NextResponse.json({ error: 'Contá brevemente qué pasó.' }, { status: 400 });

  const { data: target } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: 'No podés denunciarte a vos mismo.' }, { status: 400 });

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_id: target.id,
    entity_type: 'conversation',
    entity_id: parsed.data.entityId ?? null,
    reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}
