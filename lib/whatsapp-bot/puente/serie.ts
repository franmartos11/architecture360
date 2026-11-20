// Cadena de promesas por clave: lo que se pide con la misma clave corre de a
// uno y en orden de llegada; claves distintas corren en paralelo. El puente
// la usa por conversación porque guardarMensaje lee y reescribe no_leidos.

export type EnSerie = <T>(clave: string, fn: () => Promise<T>) => Promise<T>;

export function crearSerie(): EnSerie {
  const colas = new Map<string, Promise<unknown>>();
  return <T>(clave: string, fn: () => Promise<T>): Promise<T> => {
    const anterior = colas.get(clave) ?? Promise.resolve();
    // Un error del anterior no corta la cadena: ya le llegó a quien lo pidió.
    const actual = anterior.catch(() => {}).then(fn);
    const cola = actual.catch(() => {});
    colas.set(clave, cola);
    // La última de la cadena se borra al terminar, así el mapa no crece.
    void cola.then(() => {
      if (colas.get(clave) === cola) colas.delete(clave);
    });
    return actual;
  };
}
