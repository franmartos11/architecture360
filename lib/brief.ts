// Brief del proyecto: un PDF para el cliente que se descarga desde el sitio
// y que el bot de WhatsApp manda cuando se lo piden. Helpers puros que usan
// el admin (PdfUploader) y la web pública.

/** Tope del brief: lo máximo que el bot puede mandar por WhatsApp (ADJUNTO_TOPE_BYTES). */
export const BRIEF_MAX_BYTES = 16 * 1024 * 1024;

/** Por qué un archivo no sirve como brief, o null si sirve. */
export function pdfFileError(file: { type: string; size: number }): string | null {
  if (file.type.split(';')[0].trim().toLowerCase() !== 'application/pdf') return 'Tiene que ser un PDF.';
  if (file.size > BRIEF_MAX_BYTES) return 'El PDF pesa más de 16 MB y no se podría mandar por WhatsApp.';
  return null;
}

/** Nombre del archivo para mostrar en el admin: el último segmento de la URL. */
export function fileNameFromUrl(url: string): string {
  let last = '';
  try {
    last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    last = url.split('/').pop() ?? '';
  }
  return last || 'brief.pdf';
}

/**
 * Link para pedirle el brief al bot del proyecto: abre WhatsApp con el
 * mensaje ya escrito, así el cliente escribe primero (el bot nunca lo hace).
 */
export function briefWhatsappHref(numero: string, nombre: string, proyecto: string): string {
  const quien = nombre.trim();
  const texto = quien
    ? `Hola, soy ${quien}, quiero el brief de ${proyecto}`
    : `Hola, quiero el brief de ${proyecto}`;
  return `https://wa.me/${numero.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}
