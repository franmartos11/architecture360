// Transcripción de audios del cliente con un servicio compatible con la API
// de OpenAI (/v1/audio/transcriptions: OpenAI Whisper, Groq y otros). Claude no
// transcribe audio. Opcional: sin TRANSCRIPCION_API_KEY no se transcribe nada.
// Sin imports de next/react.

export const URL_TRANSCRIPCION_DEFAULT = 'https://api.openai.com/v1/audio/transcriptions';
export const MODELO_TRANSCRIPCION_DEFAULT = 'whisper-1';
const TIMEOUT_MS = 60_000;

export type Transcriptor = (a: { data: Uint8Array; mime: string; nombre: string }) => Promise<string | null>;

export function crearTranscriptor(
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Transcriptor | null {
  const key = env.TRANSCRIPCION_API_KEY?.trim();
  if (!key) return null;
  const url = env.TRANSCRIPCION_URL?.trim() || URL_TRANSCRIPCION_DEFAULT;
  const modelo = env.TRANSCRIPCION_MODELO?.trim() || MODELO_TRANSCRIPCION_DEFAULT;

  return async ({ data, mime, nombre }) => {
    const form = new FormData();
    form.append('file', new Blob([data as BlobPart], { type: mime }), nombre);
    form.append('model', modelo);
    form.append('language', 'es');
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`transcripción ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { text?: unknown };
    return typeof j.text === 'string' && j.text.trim() ? j.text.trim() : null;
  };
}
