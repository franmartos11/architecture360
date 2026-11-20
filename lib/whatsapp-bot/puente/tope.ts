// Topes de tiempo para llamadas a WhatsApp Web que pueden no volver nunca
// (Chromium colgado, un fetch sin timeout). Sin dependencias: lo usan la
// sesión y el despacho.

/**
 * sendMessage no volvió a tiempo: el mensaje pudo haber salido o no. Quien
 * despacha NO lo marca como fallo (se reenviaría seguro); lo deja 'enviando'
 * para que tomarSiguienteSalida lo resuelva como colgado.
 */
export class EnvioIncierto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'EnvioIncierto';
  }
}

/**
 * El envío no puede salir nunca así (un adjunto rechazado por seguridad, muy
 * grande o de un tipo no permitido): quien despacha lo pasa a 'error' de una,
 * sin reintentos.
 */
export class EnvioImposible extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'EnvioImposible';
  }
}

/** Rechaza con `crearError` (por defecto un Error común) si `p` no se resuelve en `ms`. */
export function conTope<T>(
  p: Promise<T>,
  ms: number,
  que: string,
  crearError: (mensaje: string) => Error = (m) => new Error(m),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const corte = new Promise<never>((_, rechazar) => {
    timer = setTimeout(() => rechazar(crearError(`${que} no respondió en ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, corte]).finally(() => clearTimeout(timer));
}
