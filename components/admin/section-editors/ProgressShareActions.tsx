'use client';

import { useEffect, useState } from 'react';
import type { ConstructionUpdate } from '@/types';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { formatUpdateDate, isPublishedUpdate } from '@/lib/construction-progress';

interface Props {
  update: ConstructionUpdate;
  /** Si no viene se usa el proyecto activo del panel. */
  projectId?: string;
}

function longDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Dos acciones sobre una entrada del avance de obra YA GUARDADA: compartirla
// en el feed de la plataforma y mandarla por correo a quienes pidieron
// novedades. Las dos rutas leen la entrada de la base, no del panel: si se
// acaba de crear o editar, hay que guardar antes (el servidor contesta 400
// "no existe o no está publicada" si todavía no está).
export default function ProgressShareActions({ update, projectId }: Props) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const activeProjectId = useActiveProjectId();
  const pid = projectId ?? activeProjectId;

  const [sharing, setSharing] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const notifiedAt = update.notifiedAt ?? sentAt;
  const published = isPublishedUpdate(update);
  const blockedReason = update.draft
    ? 'Es un borrador: publicala para poder compartirla o enviarla.'
    : !published
      ? 'Cargale una foto o un clip para poder compartirla o enviarla.'
      : null;

  // Cuántos interesados recibirían el correo, para el texto del botón.
  useEffect(() => {
    if (blockedReason || notifiedAt) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withActiveProject(`/api/admin/project/progress-notify?updateId=${encodeURIComponent(update.id)}`, pid ?? null));
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setRecipients(typeof data?.recipients === 'number' ? data.recipients : null);
      } catch {
        if (!cancelled) setRecipients(null);
      }
    })();
    return () => { cancelled = true; };
  }, [update.id, pid, blockedReason, notifiedAt]);

  const share = async () => {
    if (!pid) { toast('No se pudo determinar el proyecto.', 'error'); return; }
    setSharing(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: `${update.title} · ${formatUpdateDate(update.date)}`.trim(),
          sharedProjectId: pid,
          sharedProjectKind: 'progress',
          sharedProgressUpdateId: update.id,
        }),
      });
      if (res.ok) toast('Compartido en el feed.');
      else toast((await res.json().catch(() => null))?.error ?? 'No se pudo compartir.', 'error');
    } catch {
      toast('No se pudo compartir.', 'error');
    } finally {
      setSharing(false);
    }
  };

  const send = async () => {
    const n = recipients ?? 0;
    const ok = await confirmDialog({
      title: 'Enviar novedades',
      message: `Vamos a mandar esta entrada por correo a ${n} ${n === 1 ? 'interesado' : 'interesados'}. No se puede deshacer.`,
      confirmLabel: 'Enviar',
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await fetch(withActiveProject('/api/admin/project/progress-notify', pid ?? null), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateId: update.id }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        toast(data?.sent ? `Enviado a ${data.sent} ${data.sent === 1 ? 'interesado' : 'interesados'}.` : 'Todavía no hay interesados que hayan pedido novedades.');
        if (data?.sent) setSentAt(new Date().toISOString());
      } else {
        toast(data?.error ?? 'No se pudo enviar.', 'error');
      }
    } catch {
      toast('No se pudo enviar.', 'error');
    } finally {
      setSending(false);
    }
  };

  const sendLabel = notifiedAt
    ? `Enviado el ${longDate(notifiedAt)}`
    : sending
      ? 'Enviando…'
      : recipients === null
        ? 'Enviar a los interesados'
        : `Enviar a ${recipients} ${recipients === 1 ? 'interesado' : 'interesados'}`;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={share} disabled={!!blockedReason || sharing || !pid} title={blockedReason ?? undefined}>
        {sharing ? 'Compartiendo…' : 'Compartir en el feed'}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={send}
        disabled={!!blockedReason || !!notifiedAt || sending || recipients === 0}
        title={blockedReason ?? (recipients === 0 ? 'Nadie pidió novedades todavía.' : undefined)}
      >
        {sendLabel}
      </Button>
    </div>
  );
}
