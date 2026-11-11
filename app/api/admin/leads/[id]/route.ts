import { NextResponse } from 'next/server';
import { resolveProjectIdFromLead, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { isValidEnum, LEAD_STATUSES } from '@/lib/validate';
import { serverError } from '@/lib/api-errors';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { leadPatchSchema } from '@/lib/content-schemas';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromLead(id);
  if (!projectId) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (raw.data.status !== undefined && !isValidEnum(raw.data.status, LEAD_STATUSES)) {
    return NextResponse.json({ error: `status debe ser uno de: ${LEAD_STATUSES.join(', ')}` }, { status: 400 });
  }
  const parsed = validateJson(raw.data, leadPatchSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  if (error) return serverError(error);
  return NextResponse.json(data);
}
