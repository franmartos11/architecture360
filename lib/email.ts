import 'server-only';
import { Resend } from 'resend';

// Sin RESEND_API_KEY configurada, todo envío es un no-op silencioso (no
// rompe la ruta que lo llama) — mismo criterio que SUPABASE_CONFIGURED:
// la app sigue funcionando sin esta pieza mientras no esté seteada.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY no configurada — no se envía "${subject}" a ${to}`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) console.error('[email] error al enviar', error);
}
