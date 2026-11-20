import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { AccionConversacion } from '@/lib/whatsapp-bot/esquemas';
import { ordenarHistorial } from '@/lib/whatsapp-bot/ia/historial';
import { HORAS_MODO_HUMANO } from '@/lib/whatsapp-bot/reglas';
import type { WaConversacion, WaMensaje } from '@/types/whatsapp-bot';

const LIMITE_MENSAJES = 200;
const URL_FIRMADA_SEG = 3600;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Lee la conversación con el cliente de sesión (RLS: gestor en adelante) para
 * resolver el proyecto; el rol se vuelve a exigir con requireProjectAccess.
 */
async function resolverConversacion(id: string): Promise<WaConversacion | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('wa_conversaciones').select('*').eq('id', id).maybeSingle();
  return (data as WaConversacion | null) ?? null;
}

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const conv = await resolverConversacion(id);
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  const access = await requireProjectAccess(conv.project_id, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // Los últimos N, y se devuelven en orden ascendente.
  const { data, error } = await supabase
    .from('wa_mensajes')
    .select('*')
    .eq('conversacion_id', id)
    .order('enviado_at', { ascending: false })
    .limit(LIMITE_MENSAJES);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Envíos del vendedor que todavía no se registraron como mensaje (pendientes o fallidos).
  const { data: salidasData } = await supabase
    .from('wa_salida')
    .select('id, estado, error, cuerpo, created_at')
    .eq('conversacion_id', id)
    .eq('origen', 'vendedor')
    .neq('estado', 'enviado')
    .order('created_at', { ascending: true });
  const salidas = salidasData ?? [];

  const filas = ordenarHistorial((data ?? []) as WaMensaje[]);

  // Medios del cliente: URL firmada del bucket privado (ownership ya probada arriba).
  const paths = [...new Set(filas.map((m) => m.media_path).filter((p): p is string => !!p))];
  const firmadas = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await createAdminClient().storage.from('wa-medios').createSignedUrls(paths, URL_FIRMADA_SEG);
    for (const u of urls ?? []) if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl);
  }

  // Imágenes enviadas por el bot: URL pública del adjunto de la wa_salida.
  const salidaIds = [...new Set(filas.filter((m) => !m.media_path && m.salida_id).map((m) => m.salida_id as string))];
  const adjuntos = new Map<string, string>();
  if (salidaIds.length > 0) {
    const { data: salidas } = await supabase.from('wa_salida').select('id, adjunto_url').in('id', salidaIds);
    for (const s of salidas ?? []) if (s.adjunto_url) adjuntos.set(s.id, s.adjunto_url);
  }

  const mensajes = filas.map((m) => ({
    ...m,
    media_url: m.media_path
      ? (firmadas.get(m.media_path) ?? null)
      : m.salida_id
        ? (adjuntos.get(m.salida_id) ?? null)
        : null,
  }));
  return NextResponse.json({ conversacion: conv, mensajes, salidas });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const conv = await resolverConversacion(id);
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  const access = await requireProjectAccess(conv.project_id, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = AccionConversacion.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });

  const cambios =
    parsed.data.accion === 'tomar'
      ? { modo: 'humano', humano_hasta: new Date(Date.now() + HORAS_MODO_HUMANO * 3600_000).toISOString() }
      : parsed.data.accion === 'devolver'
        ? { modo: 'bot', humano_hasta: null }
        : { no_leidos: 0 };

  const { data, error } = await access.supabase
    .from('wa_conversaciones')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
