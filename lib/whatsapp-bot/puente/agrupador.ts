// Agrupa ráfagas de mensajes del cliente (la gente manda 3 mensajes seguidos):
// el turno de IA de una conversación corre `msEspera` después del último
// aviso. Nunca corren dos turnos de la misma conversación a la vez: si la
// espera vence mientras hay un turno en curso, corre otro apenas termina
// (ese turno nuevo ve lo que llegó mientras la IA respondía).

export class Agrupador {
  private readonly esperas = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly enCurso = new Set<string>();
  private readonly otraVez = new Set<string>();
  private detenido = false;

  constructor(
    private readonly msEspera: number,
    private readonly correrTurno: (convId: string) => Promise<void>,
    private readonly log: (m: string) => void = (m) => console.error(m),
  ) {}

  avisar(convId: string): void {
    if (this.detenido) return;
    const previa = this.esperas.get(convId);
    if (previa) clearTimeout(previa);
    this.esperas.set(
      convId,
      setTimeout(() => {
        this.esperas.delete(convId);
        this.lanzar(convId);
      }, this.msEspera),
    );
  }

  /** Cancela las esperas pendientes (al cerrar el puente). Los turnos en curso terminan solos. */
  detener(): void {
    this.detenido = true;
    for (const t of this.esperas.values()) clearTimeout(t);
    this.esperas.clear();
    this.otraVez.clear();
  }

  private lanzar(convId: string): void {
    if (this.detenido) return;
    if (this.enCurso.has(convId)) {
      this.otraVez.add(convId);
      return;
    }
    this.enCurso.add(convId);
    void this.correrTurno(convId)
      .catch((e) => this.log(`[agrupador] falló el turno de ${convId}: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        this.enCurso.delete(convId);
        if (this.otraVez.delete(convId)) this.lanzar(convId);
      });
  }
}
