import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request-ip';
import { projectCanonical } from '@/lib/project-canonical';
import { normalizeRef } from '@/lib/analytics/ref';
import { crearClienteClaude } from '@/lib/whatsapp-bot/ia/cliente';
import { responderTurno } from '@/lib/whatsapp-bot/ia/turno';
import { charlaWeb, turnoChatWeb } from '@/lib/whatsapp-bot/web/chat';
import type { WaBot } from '@/types/whatsapp-bot';

// Chat del sitio público: el cerebro del bot de WhatsApp atendiendo en la web.
// Solo en proyectos publicados con el chat encendido en la pestaña del bot.
// Spec: docs/superpowers/specs/2026-11-24-chat-web-design.md

export const runtime = 'nodejs';
// Un turno puede encadenar varias llamadas a Claude (herramientas), como el simulador.
export const maxDuration = 60;

type Ctx = { params: Promise<{ slug: string }> };

const Pedido = z.object({
  token: z.uuid().optional(),
  mensaje: z.string().trim().min(1).max(1000),
  // Un id de visitante roto (formato viejo, storage tocado) no frena el mensaje: va sin atribución.
  visitorId: z.string().max(100).optional(),
  ref: z.string().max(60).optional(),
});

const SIN_CACHE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: SIN_CACHE });
// El navegador olvida su token solo si la charla no existe; con el chat apagado un rato, la guarda.
const chatApagado = () => json({ error: 'Chat no disponible', motivo: 'chat_apagado' }, 404);
const charlaInexistente = () => json({ error: 'La charla no existe', motivo: 'charla_inexistente' }, 404);

/** Base del panel para los links "Ver chat" del aviso (la configurada antes que el Host del pedido). */
function urlPanel(request: Request): string {
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  } catch { /* mal configurada: la del pedido */ }
  return new URL(request.url).origin;
}

/** Proyecto publicado con bot y chat web encendido; si no, null (la ruta responde 404). */
async function chatDelProyecto(slug: string) {
  const sb = createAdminClient();
  const { data: proyecto } = await sb.from('projects').select('id, slug, published').eq('slug', slug).maybeSingle();
  const p = proyecto as { id: string; slug: string; published: boolean } | null;
  if (!p?.published) return null;
  const { data: bot } = await sb.from('wa_bots').select('*').eq('project_id', p.id).maybeSingle();
  const b = bot as WaBot | null;
  if (!b?.chat_web) return null;
  return { sb, proyecto: p, bot: b };
}

async function limitarIp(request: Request, prefijo: string, max: number, windowSeconds = 600) {
  const ip = clientIp(request);
  if (!ip) return null;
  return rateLimitOrRespond(
    { key: `${prefijo}:ip:${ip}`, windowSeconds, max },
    'Mandaste muchos mensajes seguidos. Esperá unos minutos y seguimos.',
  );
}

export async function POST(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const parsed = Pedido.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Mensaje inválido' }, 400);

  // Cada mensaje es una llamada paga a Claude.
  const limitado = await limitarIp(request, 'chat', 20);
  if (limitado) return limitado;
  // Cada mensaje sin token abre una charla nueva: sin este tope, un script
  // esquiva el límite por charla y llena el panel de charlas vacías.
  if (!parsed.data.token) {
    const nuevas = await limitarIp(request, 'chat-nueva', 5, 3600);
    if (nuevas) return nuevas;
  }

  const chat = await chatDelProyecto(slug);
  if (!chat) return chatApagado();
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'El chat no está disponible en este momento.' }, 503);

  // El turno entero tiene que entrar en los 60 s de la función.
  const limiteTurno = AbortSignal.timeout(50_000);
  try {
    const cliente = crearClienteClaude(process.env, { timeout: 25_000, maxRetries: 0 });
    const r = await turnoChatWeb({
      sb: chat.sb,
      bot: chat.bot,
      projectId: chat.proyecto.id,
      token: parsed.data.token ?? null,
      mensaje: parsed.data.mensaje,
      visitorId: z.uuid().safeParse(parsed.data.visitorId).data ?? null,
      ref: normalizeRef(parsed.data.ref) || null,
      sitio: await projectCanonical(slug),
      urlAdmin: urlPanel(request),
      ahora: new Date(),
      responder: (x) => responderTurno({ cliente, ...x, signal: limiteTurno }),
      // Los emails de "nuevo lead" no demoran la respuesta, pero terminan aunque la función responda.
      enSegundoPlano: (tarea) => after(tarea),
    });
    if (!r) return charlaInexistente();
    return json(r);
  } catch (e) {
    console.error('[chat web] falló el turno:', e);
    return json({ error: 'No se pudo responder. Probá de nuevo.' }, 500);
  }
}

export async function GET(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const token = z.uuid().safeParse(new URL(request.url).searchParams.get('token'));
  if (!token.success) return json({ error: 'Falta la charla' }, 400);

  const limitado = await limitarIp(request, 'chat-leer', 60);
  if (limitado) return limitado;

  const chat = await chatDelProyecto(slug);
  if (!chat) return chatApagado();
  try {
    const charla = await charlaWeb(chat.sb, chat.proyecto.id, token.data);
    if (!charla) return charlaInexistente();
    return json(charla);
  } catch (e) {
    console.error('[chat web] no se pudo leer la charla:', e);
    return json({ error: 'No se pudo cargar la charla.' }, 500);
  }
}
