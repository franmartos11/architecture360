'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, MessageCircle, Send, X } from 'lucide-react';
import { useTrack } from '@/components/analytics/SiteTracker';
import { readAttribution } from '@/lib/analytics/client-state';
import { borrarTokenChat, guardarTokenChat, leerTokenChat } from '@/lib/chat/web-token';
import { useProjectWhatsapp } from '@/lib/project-whatsapp-context';
import { useProjectBasePath } from '@/lib/project-base-path-context';

// Chat del sitio: el asistente del proyecto (el mismo cerebro del bot de
// WhatsApp) en una burbuja. La charla vive en el servidor; el navegador solo
// guarda el token para retomarla. Spec: docs/superpowers/specs/2026-11-24-chat-web-design.md

type Mensaje = { autor: 'cliente' | 'bot'; tipo: 'texto' | 'imagen' | 'documento'; cuerpo: string };

const SUGERENCIAS = ['¿Qué unidades hay disponibles?', '¿Tienen planes de pago?', 'Quiero agendar una visita'];
const MAX_MENSAJE = 1000;
const ERRORES: Record<string, string> = {
  limite_dia: 'Ahora no puedo responder. Dejanos tu consulta y te contactamos.',
  limite_charla: 'Llegamos al límite de esta charla. Dejanos tu contacto y te escribimos.',
  sin_respuesta: 'No pude responder eso ahora. Probá escribirlo de nuevo en un momento.',
};
const NO_SE_PUDO = 'No se pudo enviar.';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Aviso debajo de la charla: un error o un tope; `salidas` ofrece seguir por otro lado. */
type Aviso = { texto: string; salidas?: boolean };

export default function ChatWidget({
  projectSlug,
  nombreBot,
  formulario = false,
}: {
  projectSlug: string;
  nombreBot: string | null;
  /** El sitio tiene formulario de contacto (sección #contacto de la portada). */
  formulario?: boolean;
}) {
  const track = useTrack();
  const whatsapp = useProjectWhatsapp();
  const basePath = useProjectBasePath();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  /** Cargando la charla guardada: hasta que llegue no se escribe (los mensajes se mezclarían). */
  const [retomando, setRetomando] = useState(false);
  /** Mensaje que no llegó al servidor: "Reintentar" lo vuelve a mandar sin repetir la burbuja. */
  const [pendiente, setPendiente] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const retomada = useRef(false);
  const fin = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const nombre = nombreBot?.trim() || null;
  const saludo = nombre
    ? `¡Hola! Soy ${nombre}, el asistente virtual del proyecto. ¿En qué te puedo ayudar?`
    : '¡Hola! Soy el asistente virtual del proyecto. ¿En qué te puedo ayudar?';
  const charloAlgo = mensajes.some((m) => m.autor === 'cliente');

  useEffect(() => {
    if (abierto) fin.current?.scrollIntoView({ block: 'end' });
  }, [abierto, mensajes, enviando, aviso]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  /** La charla de este token ya no existe (no confundir con el chat apagado un rato). */
  const olvidarSiNoExiste = (status: number, data: { motivo?: string } | null) => {
    if (status !== 404 || data?.motivo !== 'charla_inexistente') return;
    borrarTokenChat(storage(), projectSlug);
    token.current = null;
  };

  const retomar = async () => {
    const t = leerTokenChat(storage(), projectSlug, Date.now());
    if (!t) return;
    token.current = t;
    setRetomando(true);
    try {
      const res = await fetch(`/api/chat/${projectSlug}?token=${t}`);
      const data = (await res.json().catch(() => null)) as { mensajes?: Mensaje[]; motivo?: string } | null;
      if (!res.ok) {
        olvidarSiNoExiste(res.status, data);
        return;
      }
      if (Array.isArray(data?.mensajes)) setMensajes(data.mensajes);
    } catch {
      /* sin conexión: se ve el saludo y la charla sigue al mandar */
    } finally {
      setRetomando(false);
    }
  };

  const abrir = () => {
    setAbierto(true);
    if (!retomada.current) {
      retomada.current = true;
      void retomar();
    }
    setTimeout(() => campo.current?.focus(), 0);
  };

  const enviar = async (mensaje: string, reintento = false) => {
    const limpio = mensaje.trim().slice(0, MAX_MENSAJE);
    if (!limpio || enviando || retomando) return;
    if (!reintento) setMensajes((ms) => [...ms, { autor: 'cliente', tipo: 'texto', cuerpo: limpio }]);
    setTexto('');
    setAviso(null);
    setPendiente(null);
    setEnviando(true);
    const fallo = () => {
      setPendiente(limpio);
      setAviso({ texto: NO_SE_PUDO });
    };
    try {
      const { visitorId, ref } = readAttribution();
      const res = await fetch(`/api/chat/${projectSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: limpio,
          visitorId,
          ...(ref ? { ref } : {}),
          ...(token.current ? { token: token.current } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { token?: string | null; partes?: string[]; imagenes?: string[]; documentos?: string[]; error?: string; motivo?: string }
        | null;
      if (!res.ok || !data) {
        // Muchos mensajes seguidos (429) o chat sin servicio (503): el mensaje
        // del servidor lo explica y reintentar enseguida no sirve.
        if ((res.status === 429 || res.status === 503) && data?.error) setAviso({ texto: data.error, salidas: res.status === 503 });
        else {
          olvidarSiNoExiste(res.status, data);
          fallo();
        }
        return;
      }
      if (data.token) {
        if (data.token !== token.current) track('chat');
        token.current = data.token;
        guardarTokenChat(storage(), projectSlug, data.token, Date.now());
      }
      if (data.error) {
        const tope = data.error === 'limite_dia' || data.error === 'limite_charla';
        setAviso({ texto: ERRORES[data.error] ?? ERRORES.sin_respuesta, salidas: tope });
        // El mensaje quedó guardado: reintentar no lo repite (el servidor lo reconoce).
        if (!tope) setPendiente(limpio);
        return;
      }
      setMensajes((ms) => [
        ...ms,
        ...(data.imagenes ?? []).map((cuerpo) => ({ autor: 'bot' as const, tipo: 'imagen' as const, cuerpo })),
        ...(data.documentos ?? []).map((cuerpo) => ({ autor: 'bot' as const, tipo: 'documento' as const, cuerpo })),
        ...(data.partes ?? []).map((cuerpo) => ({ autor: 'bot' as const, tipo: 'texto' as const, cuerpo })),
      ]);
    } catch {
      fallo();
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        aria-label="Abrir chat"
        onClick={abrir}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={`Chat con ${nombre ?? 'el asistente virtual'}`}
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--theme-surface)] text-[var(--theme-text)] sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:max-h-[calc(100dvh-48px)] sm:w-[380px] sm:rounded-2xl sm:border sm:border-[var(--theme-border)] sm:shadow-[0_24px_70px_rgba(0,0,0,0.3)] overflow-hidden"
    >
      <header className="flex items-center gap-3 border-b border-[var(--theme-border)] px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)]">
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[15px] font-semibold">{nombre ?? 'Asistente virtual'}</p>
          <p className="m-0 text-xs text-[var(--theme-text-muted)]">Asistente virtual · responde al instante</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar chat"
          onClick={() => setAbierto(false)}
          className="flex min-h-[40px] items-center gap-1 rounded-full px-2.5 text-sm text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
        >
          <span className="sm:hidden">Cerrar</span>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        <div className="flex flex-col gap-2">
          <Burbuja autor="bot">{saludo}</Burbuja>
          {mensajes.map((m, i) =>
            m.tipo === 'documento' ? (
              <a
                key={i}
                href={m.cuerpo}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start flex items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3.5 py-2.5 text-sm font-semibold hover:border-[var(--theme-accent)]"
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                Abrir el PDF
              </a>
            ) : m.tipo === 'imagen' ? (
              <a key={i} href={m.cuerpo} target="_blank" rel="noopener noreferrer" className="self-start max-w-[85%]">
                {/* eslint-disable-next-line @next/next/no-img-element -- imágenes del proyecto, mismas que la galería */}
                <img src={m.cuerpo} alt="Imagen del proyecto" loading="lazy" className="max-h-56 rounded-xl object-cover" />
              </a>
            ) : (
              <Burbuja key={i} autor={m.autor}>{m.cuerpo}</Burbuja>
            ),
          )}
          {enviando && (
            <p className="m-0 self-start rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3.5 py-2 text-sm italic text-[var(--theme-text-muted)]">
              escribiendo…
            </p>
          )}
          {aviso && (
            <div className="self-stretch rounded-xl border border-[var(--theme-border)] px-3.5 py-2.5 text-sm">
              <p className="m-0">{aviso.texto}</p>
              {aviso.salidas && (whatsapp || formulario) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {whatsapp && (
                    <a
                      href={`https://wa.me/${whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-[var(--theme-accent)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--theme-text-on-accent)]"
                    >
                      Escribir por WhatsApp
                    </a>
                  )}
                  {formulario && (
                    <a
                      href={`${basePath}#contacto`}
                      onClick={() => setAbierto(false)}
                      className="rounded-full border border-[var(--theme-border)] px-3.5 py-1.5 text-[13px] font-semibold"
                    >
                      Dejar mis datos
                    </a>
                  )}
                </div>
              )}
              {pendiente && (
                <button
                  type="button"
                  onClick={() => void enviar(pendiente, true)}
                  className="mt-1.5 text-sm font-semibold text-[var(--theme-accent)] underline underline-offset-2"
                >
                  Reintentar
                </button>
              )}
            </div>
          )}
          {retomando && (
            <p className="m-0 self-center text-xs text-[var(--theme-text-muted)]">Cargando la charla…</p>
          )}
          {!charloAlgo && !enviando && !retomando && (
            <div className="mt-1 flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void enviar(s)}
                  className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3.5 py-2 text-[13px] hover:border-[var(--theme-accent)]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={fin} />
        </div>
      </div>

      <form
        className="flex items-center gap-2 border-t border-[var(--theme-border)] px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <input
          ref={campo}
          type="text"
          aria-label="Tu mensaje"
          placeholder="Escribí tu consulta…"
          value={texto}
          disabled={retomando}
          maxLength={MAX_MENSAJE}
          onChange={(e) => setTexto(e.target.value)}
          className="min-h-[44px] flex-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 text-base sm:text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-accent)]"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={enviando || retomando || !texto.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] disabled:opacity-40"
        >
          <Send className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </form>
      <p className="m-0 px-4 pb-3 text-[11px] text-[var(--theme-text-muted)]">
        Respuestas de un asistente con IA: confirmá precios y condiciones con el equipo.
      </p>
    </section>
  );
}

function Burbuja({ autor, children }: { autor: 'cliente' | 'bot'; children: React.ReactNode }) {
  const cliente = autor === 'cliente';
  return (
    <p
      className={`m-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
        cliente
          ? 'self-end bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)]'
          : 'self-start border border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)]'
      }`}
    >
      {children}
    </p>
  );
}
