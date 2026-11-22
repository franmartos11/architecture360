import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import { formatUpdateDate } from '@/lib/construction-progress';
import { escapeHtml } from '@/lib/sanitize';

interface ProgressEmailArgs {
  projectName: string;
  update: ConstructionUpdate;
  progress: ConstructionProgress;
  /** URL absoluta de la landing del proyecto, sin hash. */
  projectUrl: string;
  unsubscribeUrl: string;
}

// Solo http(s): la portada viene del blob del dueño, y un correo no tiene
// por qué renderizar nada que no sea una imagen de la web.
function safeHttpUrl(url: string | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Asunto y cuerpo del correo de novedades. Todo texto del usuario pasa por escapeHtml. */
export function buildProgressEmail({ projectName, update, progress, projectUrl, unsubscribeUrl }: ProgressEmailArgs): { subject: string; html: string } {
  const link = `${projectUrl.replace(/#.*$/, '')}#avance-${encodeURIComponent(update.id)}`;
  const cover = safeHttpUrl(update.images[0]);
  const date = formatUpdateDate(update.date);

  const parts: string[] = [];
  if (cover) {
    parts.push(`<a href="${escapeHtml(link)}"><img src="${escapeHtml(cover)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:8px"></a>`);
  }
  if (date) parts.push(`<p style="margin:16px 0 0;font-size:13px;color:#6b6b6b">${escapeHtml(date)}</p>`);
  parts.push(`<h1 style="margin:4px 0 0;font-size:22px;line-height:1.3">${escapeHtml(update.title)}</h1>`);
  if (update.body) {
    parts.push(`<p style="margin:12px 0 0;font-size:15px;line-height:1.55;white-space:pre-line">${escapeHtml(update.body)}</p>`);
  }
  const facts: string[] = [];
  if (progress.percent != null) facts.push(`Avance de la obra: <strong>${escapeHtml(String(progress.percent))}%</strong>`);
  if (progress.deliveryEstimate) facts.push(`Entrega estimada: <strong>${escapeHtml(progress.deliveryEstimate)}</strong>`);
  if (facts.length) parts.push(`<p style="margin:16px 0 0;font-size:14px;line-height:1.7">${facts.join('<br>')}</p>`);
  parts.push(`<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;background:#1c1a17;color:#fff;text-decoration:none;border-radius:8px;font-size:14px">Ver el avance completo</a></p>`);
  parts.push(`<p style="margin:32px 0 0;font-size:12px;color:#8a8a8a">Recibís este correo porque pediste novedades de esta obra. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a8a8a">Dejar de recibirlas</a>.</p>`);

  return {
    // Sin saltos de línea: el nombre del proyecto es texto libre y el asunto es un header.
    subject: `Novedades de la obra · ${projectName}`.replace(/[\r\n]+/g, ' '),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c1a17;max-width:560px;margin:0 auto">${parts.join('')}</div>`,
  };
}
