// Lo único del puente que toca el interior de WhatsApp Web (pupPage.evaluate
// y módulos internos). Si WhatsApp Web cambia algo, se arregla acá.
// Portado de aspa-software (lib/whatsapp/bridge/whatsapp-web.ts): el parche de
// MsgKey y la bajada de medios desde la caché; sin chats, archivado ni audios.
//
// Sin funciones con nombre dentro de los evaluate: tsx las envuelve con un
// helper __name que no existe en la página de WhatsApp.
import type pkg from 'whatsapp-web.js';

export type ClienteWA = InstanceType<typeof pkg.Client>;

// WhatsApp Web sacó MsgKey._serialized y la librería lo sigue usando: por
// ejemplo para encontrar el mensaje recién enviado (sin esto sendMessage
// devuelve undefined aunque el mensaje salga). Se devuelve como getter de
// toString(), que da el mismo formato. Si WhatsApp lo vuelve a poner como
// propiedad propia, el setter la deja escribir y el parche no estorba.
export async function parcharMsgKey(client: ClienteWA): Promise<void> {
  await client.pupPage!.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const mod = w.require('WAWebMsgKey');
    const proto = (mod?.default ?? mod)?.prototype;
    if (!proto || Object.getOwnPropertyDescriptor(proto, '_serialized')) return;
    Object.defineProperty(proto, '_serialized', {
      configurable: true,
      get() {
        return this.toString();
      },
      set(v: string) {
        Object.defineProperty(this, '_serialized', { value: v, writable: true, configurable: true, enumerable: true });
      },
    });
  });
}

// "Escribiendo…" o nada en un chat. Es lo mismo que hacen Chat.sendStateTyping()
// y Chat.clearState() de la librería, pero sin pasar por getChatById (arma el
// chat con una función de WhatsApp Web que hoy falla en algunos chats).
export async function estadoDeChat(client: ClienteWA, wid: string, estado: 'typing' | 'stop'): Promise<void> {
  await client.pupPage!.evaluate(
    async (chatId: string, e: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      await w.WWebJS.sendChatstate(e, chatId);
    },
    wid,
    estado,
  );
}

export type Bajada = { data: Buffer; mime: string } | { grande: true } | { verUnaVez: true };

// Una foto, audio o documento de un chat, descifrado. Si WhatsApp no lo da
// (el mensaje ya no está en WhatsApp Web, el archivo venció o se está volviendo
// a subir) tira un error con el motivo y la etapa del archivo (mediaStage).
// Si pesa más que topeBytes devuelve { grande: true } sin bajarlo.
//
// No usa Message.downloadMedia de whatsapp-web.js 1.34.7: su
// downloadAndMaybeDecrypt falla con "t: t" en el WhatsApp Web de hoy aunque el
// archivo esté (OpenWA #1739). Hace lo de wwebjs #201697 (en su main, sin
// release todavía): pide el archivo como si lo tocara el usuario y lo lee de la
// caché de WhatsApp Web.
export async function bajarMedio(client: ClienteWA, waId: string, topeBytes: number): Promise<Bajada> {
  const r: { data: string; mimetype: string | null } | { grande: true } | { verUnaVez: true } | { motivo: string } =
    await client.pupPage!.evaluate(
      async (id: string, tope: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const col = w.require('WAWebCollections').Msg;
        const m = col.get(id) || (await col.getMessagesById([id]))?.messages?.[0];
        if (!m) return { motivo: 'WhatsApp Web no encuentra el mensaje' };
        // Un "ver una vez" no se baja.
        if (m.isViewOnce) return { verUnaVez: true as const };
        if (!m.mediaData) return { motivo: 'el mensaje no trae el archivo (sin mediaData)' };
        if (m.mediaData.mediaStage === 'REUPLOADING') return { motivo: 'WhatsApp lo está volviendo a subir (REUPLOADING)' };
        // Pasa el tope: se avisa sin bajar los bytes al puente.
        if ((m.size ?? 0) > tope || (m.mediaData.size ?? 0) > tope) return { grande: true as const };
        try {
          // Siempre, aunque diga RESOLVED: la caché puede haberse vaciado igual.
          await m.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true });
          const etapa = String(m.mediaData.mediaStage);
          if (etapa.includes('ERROR') || etapa === 'FETCHING') return { motivo: `WhatsApp no dio el archivo (${etapa})` };
          const blob =
            w.require('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache.get(m.mediaObject?.filehash) ||
            m.mediaObject?.mediaBlob?.forceToBlob();
          if (!blob) return { motivo: `el archivo no está en la caché de WhatsApp Web (${etapa})` };
          // WhatsApp pudo no declarar el tamaño: se corta antes de pasar a base64.
          if (blob.size > tope) return { grande: true as const };
          const data = await w.WWebJS.arrayBufferToBase64Async(await blob.arrayBuffer());
          return { data, mimetype: m.mimetype ?? null };
        } catch (e) {
          const err = e as { name?: string; message?: string };
          return {
            motivo: `WhatsApp Web falló al bajarlo (${String(m.mediaData.mediaStage)}): ${err?.name ?? ''} ${err?.message ?? String(e)}`.trim(),
          };
        }
      },
      waId,
      topeBytes,
    );
  if ('grande' in r) return { grande: true };
  if ('verUnaVez' in r) return { verUnaVez: true };
  if ('motivo' in r) throw new Error(`${waId}: ${r.motivo}`);
  if (!r.data) throw new Error(`${waId}: WhatsApp dio un archivo vacío`);
  return { data: Buffer.from(r.data, 'base64'), mime: r.mimetype ?? 'application/octet-stream' };
}
