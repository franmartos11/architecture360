import { describe, expect, it } from 'vitest';
import { bajarMedio, estadoDeChat, parcharMsgKey, type ClienteWA } from './whatsapp-web';

// Portado de aspa-software (lib/whatsapp/bridge/whatsapp-web.test.ts), sin la
// parte de audios/voz. Lo que devuelve la página (el archivo o el motivo) se
// convierte en el medio o en un error con el motivo para el log.

const WA_ID = 'false_263346104320137@lid_3AF01DAA95BA0D2844BE';

// La página de WhatsApp Web: evaluate devuelve lo que diga `respuesta` y anota con qué la llamaron.
function clienteQueDevuelve(respuesta: unknown) {
  const ids: unknown[] = [];
  const extras: unknown[][] = [];
  const client = {
    pupPage: {
      evaluate: async (_fn: unknown, id?: unknown, ...resto: unknown[]) => {
        ids.push(id);
        extras.push(resto);
        return respuesta;
      },
    },
  } as unknown as ClienteWA;
  return { client, ids, extras };
}

async function motivo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'no tiró';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('bajarMedio', () => {
  it('grande pasa tal cual y busca el mensaje por su id', async () => {
    const { client, ids } = clienteQueDevuelve({ grande: true });
    expect(await bajarMedio(client, WA_ID, 1000)).toEqual({ grande: true });
    expect(ids).toEqual([WA_ID]);
  });

  it('el tope llega a la página', async () => {
    const { client, extras } = clienteQueDevuelve({ grande: true });
    await bajarMedio(client, WA_ID, 1000);
    expect(extras).toEqual([[1000]]);
  });

  it('verUnaVez pasa tal cual', async () => {
    const { client } = clienteQueDevuelve({ verUnaVez: true });
    expect(await bajarMedio(client, WA_ID, 1000)).toEqual({ verUnaVez: true });
  });

  it('medio en base64 vuelve como Buffer con su mime', async () => {
    const { client } = clienteQueDevuelve({ data: Buffer.from('JPEG').toString('base64'), mimetype: 'image/jpeg' });
    expect(await bajarMedio(client, WA_ID, 1000)).toEqual({ data: Buffer.from('JPEG'), mime: 'image/jpeg' });
  });

  it('sin mimetype: application/octet-stream', async () => {
    const { client } = clienteQueDevuelve({ data: Buffer.from('x').toString('base64'), mimetype: null });
    expect(await bajarMedio(client, WA_ID, 1000)).toEqual({ data: Buffer.from('x'), mime: 'application/octet-stream' });
  });

  it('WhatsApp no lo da: tira el motivo', async () => {
    const { client } = clienteQueDevuelve({ motivo: 'WhatsApp no dio el archivo (ERROR_MISSING)' });
    expect(await motivo(bajarMedio(client, WA_ID, 1000))).toBe(`${WA_ID}: WhatsApp no dio el archivo (ERROR_MISSING)`);
  });

  it('un archivo vacío no cuenta como bajado', async () => {
    const { client } = clienteQueDevuelve({ data: '', mimetype: 'image/jpeg' });
    expect(await motivo(bajarMedio(client, WA_ID, 1000))).toBe(`${WA_ID}: WhatsApp dio un archivo vacío`);
  });
});

describe('estadoDeChat', () => {
  it('manda "escribiendo" y "stop" al chat por su wid', async () => {
    const { client, ids, extras } = clienteQueDevuelve(true);
    await estadoDeChat(client, '263346104320137@lid', 'typing');
    await estadoDeChat(client, '263346104320137@lid', 'stop');
    expect(ids).toEqual(['263346104320137@lid', '263346104320137@lid']);
    expect(extras).toEqual([['typing'], ['stop']]);
  });
});

describe('parcharMsgKey', () => {
  it('corre en la página de WhatsApp Web', async () => {
    const { client, ids } = clienteQueDevuelve(undefined);
    await parcharMsgKey(client);
    expect(ids).toHaveLength(1);
  });
});
