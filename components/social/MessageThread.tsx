'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Paperclip, Mic, Square, FileText } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import { formatRelativeTime } from '@/lib/relativeTime';
import { useConversationMessages, type ApiMessage } from '@/hooks/useConversationMessages';
import EmbeddedPostCard from '@/components/social/EmbeddedPostCard';
import EmojiPicker from '@/components/ui/EmojiPicker';
import { useIsOnline } from '@/lib/presence-context';

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;

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
  const { messages, loading, loadingMore, hasMore, loadMore, sendMessage } = useConversationMessages(conversationId);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToast();
  const otherOnline = useIsOnline(other?.id);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Abrir el hilo implica verlo — se marca leído una vez al montar, no en cada poll.
  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, [conversationId]);

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
    formData.append('folder', 'messages');
    const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: formData });
    if (!uploadRes.ok) {
      setUploading(false);
      const data = await uploadRes.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo subir el archivo.', 'error');
      return;
    }
    const { url } = await uploadRes.json();
    const res = await sendMessage('', { url, type });
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasMore && (
          <div className="text-center pb-1">
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
        {!loading && messages.map(m => {
          const mine = m.sender_id === userId;
          if (m.shared_post) {
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className="max-w-[75%] w-full">
                  {m.body && <p className="text-sm text-trevo-dark px-1 mb-1">{m.body}</p>}
                  <EmbeddedPostCard post={m.shared_post} />
                </div>
                <p className="text-[10px] text-trevo-dark/30 mt-1 px-1">{formatRelativeTime(m.created_at)}</p>
              </div>
            );
          }
          if (m.attachment_url) {
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[75%] px-2 py-2 rounded-2xl text-sm space-y-1.5 ${mine ? 'bg-trevo-dark text-white rounded-br-sm' : 'bg-trevo-dark/5 text-trevo-dark rounded-bl-sm'}`}
                >
                  {m.body && <p className="whitespace-pre-line px-1.5 pt-1">{m.body}</p>}
                  <MessageAttachment message={m} />
                </div>
                <p className="text-[10px] text-trevo-dark/30 mt-1 px-1">{formatRelativeTime(m.created_at)}</p>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-trevo-dark text-white rounded-br-sm' : 'bg-trevo-dark/5 text-trevo-dark rounded-bl-sm'}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`text-[10px] mt-1 ${mine ? 'text-white/50' : 'text-trevo-dark/30'}`}>{formatRelativeTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-trevo-dark/10 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFilePick}
        />
        {recording ? (
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-full bg-red-50 text-red-600 text-sm">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            Grabando... {String(Math.floor(recordSeconds / 60)).padStart(1, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Adjuntar foto o archivo"
              className="p-2 rounded-full text-trevo-dark/40 hover:text-trevo-dark hover:bg-trevo-dark/5 transition-colors disabled:opacity-40 shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={uploading ? 'Subiendo...' : 'Escribí un mensaje...'}
              aria-label="Escribí un mensaje"
              maxLength={2000}
              disabled={uploading}
              className="flex-1 min-w-0 px-3.5 py-2 rounded-full border border-trevo-dark/15 text-sm text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 outline-none transition-all disabled:opacity-60"
            />
            <EmojiPicker onSelect={e => setText(t => t + e)} />
          </>
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
    </div>
  );
}
