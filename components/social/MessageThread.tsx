'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip, Mic, Square, FileText } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import { formatRelativeTime } from '@/lib/relativeTime';
import { useConversationMessages, type ApiMessage } from '@/hooks/useConversationMessages';
import EmbeddedPostCard from '@/components/social/EmbeddedPostCard';
import EmojiPicker from '@/components/ui/EmojiPicker';
import KebabMenu from '@/components/ui/KebabMenu';
import { useIsOnline } from '@/lib/presence-context';

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;
const MAX_REPORT_REASON_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 2000;
const QUICK_REPLIES = ['Dale, te aviso', 'Lo miro y te comento', '¿Podemos hablar mañana?'];

// "Hoy" / "Ayer" / fecha completa — mismo criterio que formatRelativeTime
// pero para separadores de día en el hilo, no para cada mensaje.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: sameYear ? undefined : 'numeric' });
}
function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// Modal chiquito y autocontenido para las dos únicas acciones que
// necesita el menú "⋯" del hilo — no vale la pena traer ConfirmProvider
// acá (vive solo bajo /admin hoy, montarlo en el layout social para esto
// solo sería blast radius de más) ni un textarea-modal genérico para un
// único uso.
function ThreadActionDialog({
  kind, otherName, onCancel, onConfirmBlock, onSubmitReport, submitting,
}: {
  kind: 'block' | 'report';
  otherName: string;
  onCancel: () => void;
  onConfirmBlock: () => void;
  onSubmitReport: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[300] p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        {kind === 'block' ? (
          <>
            <h3 className="text-lg font-semibold text-trevo-dark mb-1.5">¿Bloquear a {otherName}?</h3>
            <p className="text-sm text-trevo-dark/60">
              No van a poder mandarse mensajes nuevos en ninguna dirección. Podés desbloquear cuando quieras.
            </p>
            <div className="flex items-center gap-3 mt-5 justify-end">
              <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-trevo-dark/60 hover:bg-trevo-dark/5 transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirmBlock}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Bloquear
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-trevo-dark mb-1.5">Reportar a {otherName}</h3>
            <p className="text-sm text-trevo-dark/60 mb-3">Contanos brevemente qué pasó — lo revisamos nosotros, {otherName} no se entera.</p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={MAX_REPORT_REASON_LENGTH}
              rows={4}
              autoFocus
              placeholder="Qué pasó..."
              className="w-full px-3 py-2 rounded-xl border border-trevo-dark/15 text-sm text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 outline-none resize-none"
            />
            <div className="flex items-center gap-3 mt-4 justify-end">
              <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-trevo-dark/60 hover:bg-trevo-dark/5 transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onSubmitReport(reason.trim())}
                disabled={submitting || !reason.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-trevo-dark disabled:opacity-40 transition-colors"
              >
                Enviar denuncia
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function attachmentFileName(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'archivo');
    return last.replace(/^\d+-[a-z0-9]{4,8}\./, '.').replace(/^\./, 'archivo.');
  } catch {
    return 'archivo';
  }
}

function MessageAttachment({ message }: { message: ApiMessage }) {
  const url = message.attachment_url;
  if (!url) return null;
  if (message.attachment_type === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="max-w-full rounded-xl max-h-72 object-cover cursor-pointer"
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      />
    );
  }
  if (message.attachment_type === 'audio') {
    return <audio controls src={url} className="max-w-full h-10" style={{ width: 240 }} />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/5 hover:bg-black/10 transition-colors text-sm"
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="truncate">{attachmentFileName(url)}</span>
    </a>
  );
}

interface OtherParticipant {
  id: string;
  handle: string;
  display_name: string;
  avatar_image: string | null;
}

export default function MessageThread({ conversationId, other }: { conversationId: string; other: OtherParticipant | null }) {
  const { messages, loading, loadingMore, hasMore, loadMore, sendMessage, otherTyping, notifyTyping } = useConversationMessages(conversationId);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToast();
  const otherOnline = useIsOnline(other?.id);
  const router = useRouter();
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [canMessage, setCanMessage] = useState(true);
  const [dialog, setDialog] = useState<'block' | 'report' | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  // Primer mensaje sin leer del otro participante, congelado la primera
  // vez que hay mensajes+usuario listos — antes de que el POST a .../read
  // (más abajo) los marque como leídos y se pierda el punto de corte para
  // el divisor "Mensajes nuevos". Se calcula ajustando estado durante el
  // render (patrón soportado por React para "derivar de props/estado que
  // recién está listo"), no en un efecto — MessageThread ya se remonta con
  // `key={conversationId}` en MessagesShell, así que no hace falta resetear
  // esto al cambiar de hilo.
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [unreadComputed, setUnreadComputed] = useState(false);
  if (!unreadComputed && !loading && userId) {
    const firstUnread = messages.find(m => m.sender_id !== userId && !m.read_at);
    setFirstUnreadId(firstUnread?.id ?? null);
    setUnreadComputed(true);
  }

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Abrir el hilo implica verlo — se marca leído una vez al montar, no en cada poll.
  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (!other?.handle) return;
    fetch(`/api/blocks/${other.handle}`)
      .then(res => res.json())
      .then(data => {
        setBlockedByMe(!!data.isBlockedByMe);
        setCanMessage(data.canMessage !== false);
      })
      .catch(() => {});
  }, [other?.handle]);

  const handleUnblock = async () => {
    if (!other?.handle) return;
    const res = await fetch(`/api/blocks/${other.handle}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setBlockedByMe(false);
      setCanMessage(data.canMessage !== false);
      toast('Desbloqueado.', 'success');
    } else {
      toast('No se pudo desbloquear.', 'error');
    }
  };

  const handleConfirmBlock = async () => {
    if (!other?.handle) return;
    setActionSubmitting(true);
    const res = await fetch(`/api/blocks/${other.handle}`, { method: 'POST' });
    setActionSubmitting(false);
    setDialog(null);
    if (res.ok) {
      toast(`Bloqueaste a ${other.display_name}.`, 'success');
      router.push('/mensajes');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo bloquear.', 'error');
    }
  };

  const handleSubmitReport = async (reason: string) => {
    if (!other?.handle || !reason) return;
    setActionSubmitting(true);
    const res = await fetch(`/api/reports/${other.handle}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, entityId: conversationId }),
    });
    setActionSubmitting(false);
    if (res.ok) {
      setDialog(null);
      toast('Denuncia enviada — gracias por avisarnos.', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo enviar la denuncia.', 'error');
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const res = await sendMessage(text.trim());
    setSending(false);
    if (res.ok) {
      setText('');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo enviar.', 'error');
    }
  };

  const uploadAndSend = async (file: File, type: 'image' | 'audio' | 'file') => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast(`El archivo pesa más de ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB.`, 'error');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch(`/api/conversations/${conversationId}/attachments`, { method: 'POST', body: formData });
    if (!uploadRes.ok) {
      setUploading(false);
      const data = await uploadRes.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo subir el archivo.', 'error');
      return;
    }
    const { path } = await uploadRes.json();
    const res = await sendMessage('', { path, type });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo enviar.', 'error');
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadAndSend(file, file.type.startsWith('image/') ? 'image' : 'file');
  };

  const startRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('No se pudo acceder al micrófono.', 'error');
      return;
    }
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setRecordSeconds(0);
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const ext = recorder.mimeType?.includes('mp4') ? 'mp4' : 'webm';
      uploadAndSend(new File([blob], `nota-de-voz.${ext}`, { type: blob.type }), 'audio');
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setRecordSeconds(0);
    recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-trevo-dark/10 shrink-0">
        <Link href="/mensajes" className="md:hidden p-1 -ml-1 text-trevo-dark/50 hover:text-trevo-dark transition-colors" aria-label="Volver a mensajes">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Link href={`/portfolio/${other?.handle ?? ''}`} className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
          {other?.avatar_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={other.avatar_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-trevo-dark/40 font-medium">{(other?.display_name ?? 'U').charAt(0).toUpperCase()}</span>
          )}
          {otherOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" aria-hidden="true" />
          )}
        </Link>
        <div className="min-w-0">
          <Link href={`/portfolio/${other?.handle ?? ''}`} className="font-semibold text-trevo-dark text-sm hover:underline block">
            {other?.display_name ?? 'Usuario'}
          </Link>
          {otherOnline && <p className="text-xs text-green-600">En línea</p>}
        </div>
        {other && (
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href={`/portfolio/${other.handle}`}
              className="hidden sm:block px-3 py-1.5 rounded-full border border-trevo-dark/15 text-xs font-medium text-trevo-dark hover:border-trevo-dark/30 transition-colors"
            >
              Ver perfil
            </Link>
            <KebabMenu
              items={[
                blockedByMe
                  ? { label: 'Desbloquear', onClick: handleUnblock }
                  : { label: 'Bloquear', onClick: () => setDialog('block'), danger: true },
                { label: 'Reportar', onClick: () => setDialog('report') },
              ]}
            />
          </div>
        )}
      </div>

      {dialog && other && (
        <ThreadActionDialog
          kind={dialog}
          otherName={other.display_name}
          onCancel={() => setDialog(null)}
          onConfirmBlock={handleConfirmBlock}
          onSubmitReport={handleSubmitReport}
          submitting={actionSubmitting}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {hasMore && (
          <div className="text-center pb-2">
            <button onClick={loadMore} disabled={loadingMore} className="text-xs font-medium text-trevo-dark/50 hover:text-trevo-dark transition-colors disabled:opacity-50">
              {loadingMore ? 'Cargando...' : 'Cargar mensajes anteriores'}
            </button>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center h-full text-sm text-trevo-dark/30 text-center px-6">
            Todavía no hay mensajes — escribile algo a {other?.display_name ?? 'esta persona'}.
          </div>
        )}
        {!loading && messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const prev = messages[i - 1];
          const showDateSeparator = !prev || !sameDay(prev.created_at, m.created_at);
          const showNewDivider = firstUnreadId === m.id;
          // Agrupadas: mismo remitente que el mensaje anterior, mismo día, sin
          // el divisor "Mensajes nuevos" de por medio — se les achica el
          // margen y el pico de la burbuja, como una tanda de mensajes.
          const grouped = !showDateSeparator && !showNewDivider && !!prev && prev.sender_id === m.sender_id;
          const isLastMine = mine && !messages.slice(i + 1).some(x => x.sender_id === userId);
          const bubbleRadius = mine
            ? `rounded-2xl ${grouped ? '' : 'rounded-br-sm'}`
            : `rounded-2xl ${grouped ? '' : 'rounded-bl-sm'}`;

          return (
            <div key={m.id}>
              {showDateSeparator && (
                <div className="flex items-center gap-3 py-3" role="separator">
                  <div className="flex-1 h-px bg-trevo-dark/8" />
                  <span className="text-[10.5px] font-medium text-trevo-dark/40 capitalize">{dayLabel(m.created_at)}</span>
                  <div className="flex-1 h-px bg-trevo-dark/8" />
                </div>
              )}
              {showNewDivider && (
                <div className="flex items-center gap-2.5 py-2.5" role="separator">
                  <div className="flex-1 h-px bg-brand-400/40" />
                  <span className="text-[10px] font-semibold text-brand-600 tracking-wide uppercase">Mensajes nuevos</span>
                  <div className="flex-1 h-px bg-brand-400/40" />
                </div>
              )}

              {m.shared_post ? (
                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                  <div className="max-w-[75%] w-full">
                    {m.body && <p className="text-sm text-trevo-dark px-1 mb-1">{m.body}</p>}
                    <EmbeddedPostCard post={m.shared_post} />
                  </div>
                  <MessageMeta mine={mine} isLastMine={isLastMine} message={m} />
                </div>
              ) : m.attachment_url ? (
                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                  <div className={`max-w-[75%] px-2 py-2 ${bubbleRadius} text-sm space-y-1.5 ${mine ? 'bg-trevo-dark text-white' : 'bg-trevo-dark/5 text-trevo-dark'}`}>
                    {m.body && <p className="whitespace-pre-line px-1.5 pt-1">{m.body}</p>}
                    <MessageAttachment message={m} />
                  </div>
                  <MessageMeta mine={mine} isLastMine={isLastMine} message={m} />
                </div>
              ) : (
                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                  <div className={`max-w-[75%] px-3.5 py-2 ${bubbleRadius} text-sm ${mine ? 'bg-trevo-dark text-white' : 'bg-trevo-dark/5 text-trevo-dark'}`}>
                    <p className="whitespace-pre-line">{m.body}</p>
                  </div>
                  <MessageMeta mine={mine} isLastMine={isLastMine} message={m} />
                </div>
              )}
            </div>
          );
        })}

        {otherTyping && (
          <div className="flex items-center gap-2 pt-2">
            <div className="flex items-center gap-1 px-3 py-2.5 rounded-2xl rounded-bl-sm bg-trevo-dark/5">
              <span className="w-1.5 h-1.5 rounded-full bg-trevo-dark/40 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-trevo-dark/40 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-trevo-dark/40 animate-bounce" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!canMessage ? (
        <div className="px-4 py-3 border-t border-trevo-dark/10 shrink-0 text-center text-sm text-trevo-dark/40">
          Ya no podés mandar mensajes en esta conversación.
        </div>
      ) : (
      <div className="border-t border-trevo-dark/10 shrink-0 px-4 py-3 flex flex-col gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_REPLIES.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => { setText(q); textareaRef.current?.focus(); }}
              className="h-7 px-3 rounded-full border border-trevo-dark/12 text-xs text-trevo-dark/65 hover:border-trevo-dark/25 hover:text-trevo-dark transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFilePick}
          />
          {recording ? (
            <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-red-50 text-red-600 text-sm">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              Grabando... {String(Math.floor(recordSeconds / 60)).padStart(1, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
            </div>
          ) : (
            <div className="flex-1 min-w-0 flex items-end gap-1.5 border border-trevo-dark/15 rounded-2xl px-2 py-1.5 focus-within:ring-2 focus-within:ring-trevo-dark/20 transition-all">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Adjuntar foto o archivo"
                className="p-1.5 rounded-full text-trevo-dark/40 hover:text-trevo-dark hover:bg-trevo-dark/5 transition-colors disabled:opacity-40 shrink-0"
              >
                <Paperclip className="w-4.5 h-4.5" />
              </button>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  notifyTyping();
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                rows={1}
                placeholder={uploading ? 'Subiendo...' : 'Escribí un mensaje...'}
                aria-label="Escribí un mensaje"
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={uploading}
                className="flex-1 min-w-0 max-h-[104px] py-1.5 bg-transparent text-sm text-trevo-dark placeholder:text-trevo-dark/30 outline-none resize-none disabled:opacity-60"
              />
              <EmojiPicker onSelect={e => setText(t => t + e)} />
            </div>
          )}
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            aria-label={recording ? 'Detener grabación' : 'Grabar nota de audio'}
            className={`p-2 rounded-full transition-colors disabled:opacity-40 shrink-0 ${
              recording ? 'text-white bg-red-500 hover:bg-red-600' : 'text-trevo-dark/40 hover:text-trevo-dark hover:bg-trevo-dark/5'
            }`}
          >
            {recording ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
          </button>
          {!recording && (
            <button
              type="submit"
              disabled={sending || uploading || !text.trim()}
              className="px-4 py-2 rounded-full bg-trevo-dark text-white text-sm font-medium disabled:opacity-40 transition-opacity shrink-0"
            >
              Enviar
            </button>
          )}
        </form>
        <div className="flex items-center justify-between px-1">
          <p className="text-[10.5px] text-trevo-dark/30">Enter para enviar · Shift + Enter para saltar de línea</p>
          {text.length > MAX_MESSAGE_LENGTH * 0.75 && (
            <p className={`text-[10.5px] ${text.length >= MAX_MESSAGE_LENGTH ? 'text-red-500' : 'text-trevo-dark/40'}`}>
              {text.length}/{MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// "12:04" a secas del otro lado; "12:04 · Enviado/Visto" bajo el ÚLTIMO
// mensaje propio del hilo — los anteriores solo muestran la hora, igual
// que cualquier chat real (el recibo de lectura no se repite por mensaje).
function MessageMeta({ mine, isLastMine, message }: { mine: boolean; isLastMine: boolean; message: ApiMessage }) {
  const time = formatRelativeTime(message.created_at);
  const status = isLastMine ? (message.read_at ? 'Visto' : 'Enviado') : null;
  return (
    <p className={`text-[10px] mt-1 px-1 ${mine ? 'text-trevo-dark/35' : 'text-trevo-dark/30'}`}>
      {time}{status ? ` · ${status}` : ''}
    </p>
  );
}
