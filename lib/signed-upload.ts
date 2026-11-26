// Subida en dos pasos, para que el archivo nunca pase por una función de
// Vercel (corta cualquier body de más de 4,5MB con un 413):
//   1. POST JSON a `endpoint` con nombre/tipo/peso → la ruta valida y
//      devuelve una URL firmada de Supabase (más lo que la ruta quiera
//      agregar: url pública, path, tipo de adjunto...).
//   2. PUT del archivo directo a esa URL.
// Mismo esquema que ya usa BimModelEditor para los modelos 3D.

export type SignedUploadResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SignedUploadOptions {
  onProgress?: (pct: number) => void;
}

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ ok: true });
        return;
      }
      let message: string | undefined;
      try {
        message = (JSON.parse(xhr.responseText) as { message?: string }).message;
      } catch {
        // Ignore non-JSON error bodies
      }
      resolve({ ok: false, error: message ?? `Error al subir el archivo (HTTP ${xhr.status})` });
    };
    xhr.onerror = () => resolve({ ok: false, error: 'Error de conexión al subir el archivo' });
    xhr.send(file);
  });
}

export async function uploadViaSignedUrl<T>(
  endpoint: string,
  file: File,
  extra: Record<string, string> = {},
  options?: SignedUploadOptions
): Promise<SignedUploadResult<T>> {
  let ticket: { signedUrl: string; contentType?: string; error?: string } & T;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, size: file.size, ...extra }),
    });
    ticket = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: ticket.error ?? 'No se pudo preparar la subida' };
  } catch {
    return { ok: false, error: 'Error de conexión al subir el archivo' };
  }

  if (options?.onProgress && typeof XMLHttpRequest !== 'undefined') {
    const put = await putWithProgress(
      ticket.signedUrl,
      file,
      ticket.contentType ?? file.type,
      options.onProgress
    );
    if (!put.ok) return { ok: false, error: put.error };
  } else {
    try {
      const put = await fetch(ticket.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': ticket.contentType ?? file.type, 'x-upsert': 'false' },
        body: file,
      });
      if (!put.ok) {
        // Supabase contesta { statusCode, error, message } — el message es
        // lo legible (ej. "The object exceeded the maximum allowed size").
        const body = await put.json().catch(() => ({}));
        return { ok: false, error: body.message ?? `Error al subir el archivo (HTTP ${put.status})` };
      }
    } catch {
      return { ok: false, error: 'Error de conexión al subir el archivo' };
    }
  }

  const data: Record<string, unknown> = { ...ticket };
  delete data.signedUrl;
  delete data.contentType;
  return { ok: true, data: data as T };
}
