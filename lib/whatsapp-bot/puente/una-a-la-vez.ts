// Corre una tarea async sin esperarla y sin apilarla: si la anterior sigue en
// curso, la nueva se saltea. El bucle del puente la usa por bot, así un bot
// colgado (un logout o una operación que no vuelve) no traba el tick de los demás.

export class UnaALaVez {
  private enCurso = false;

  constructor(private readonly log: (m: string) => void = (m) => console.error(m)) {}

  get ocupada(): boolean {
    return this.enCurso;
  }

  /** Arranca `fn` si no hay otra en curso. Devuelve si la arrancó. Nunca rechaza. */
  correr(fn: () => Promise<unknown>): boolean {
    if (this.enCurso) return false;
    this.enCurso = true;
    let p: Promise<unknown>;
    try {
      p = fn();
    } catch (e) {
      p = Promise.reject(e);
    }
    void p
      .catch((e) => this.log(`falló una tarea: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        this.enCurso = false;
      });
    return true;
  }
}
