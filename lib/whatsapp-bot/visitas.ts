// Visitas al proyecto que agenda el bot: horarios que carga el vendedor,
// turnos libres y formato de fechas. Todo en hora de Argentina (UTC-3 fijo:
// Argentina no usa horario de verano desde 2009).
// Sin imports de next/react.

export const OFFSET_AR = '-03:00';
const MIN_MS = 60_000;
const DIA_MS = 24 * 60 * MIN_MS;

/** Una franja horaria "HH:MM"–"HH:MM". */
export type Franja = [string, string];

/** wa_bots.visitas: la agenda del vendedor para este proyecto. */
export type ConfigVisitas = {
  activo: boolean;
  /** Duración de cada visita, en minutos. */
  duracion_min: number;
  /** Con cuánta anticipación mínima se puede agendar, en horas. */
  anticipacion_horas: number;
  /** Hasta cuántos días para adelante se ofrecen turnos. */
  dias_adelante: number;
  /** Dónde es la visita (showroom, obra), para decírselo al cliente. */
  lugar: string | null;
  /** Franjas por día de la semana: "0" = domingo … "6" = sábado. */
  franjas: Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', Franja[]>>;
};

export const DURACIONES_VISITA = [30, 45, 60, 90] as const;
export const ANTICIPACIONES_VISITA = [2, 12, 24, 48] as const;
export const DIAS_ADELANTE_VISITA = [7, 14, 30] as const;
export const MAX_FRANJAS_POR_DIA = 3;

export const CONFIG_VISITAS_DEFAULT: ConfigVisitas = {
  activo: false,
  duracion_min: 45,
  anticipacion_horas: 12,
  dias_adelante: 14,
  lugar: null,
  franjas: {
    '1': [['10:00', '13:00'], ['15:00', '18:00']],
    '2': [['10:00', '13:00'], ['15:00', '18:00']],
    '3': [['10:00', '13:00'], ['15:00', '18:00']],
    '4': [['10:00', '13:00'], ['15:00', '18:00']],
    '5': [['10:00', '13:00'], ['15:00', '18:00']],
    '6': [['10:00', '13:00']],
  },
};

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutos = (h: string) => {
  const m = HORA_RE.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** La configuración tal como viene de la base, completada y saneada (null = sin visitas). */
export function normalizarConfigVisitas(raw: unknown): ConfigVisitas | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ConfigVisitas>;
  const elegir = <T extends number>(v: unknown, opciones: readonly T[], def: T): T =>
    (opciones as readonly unknown[]).includes(v) ? (v as T) : def;
  const franjas: ConfigVisitas['franjas'] = {};
  for (const dia of ['0', '1', '2', '3', '4', '5', '6'] as const) {
    const lista = Array.isArray(r.franjas?.[dia]) ? r.franjas![dia]! : [];
    const ok = lista
      .filter((f): f is Franja => Array.isArray(f) && f.length === 2)
      .filter(([a, b]) => {
        const ma = minutos(a);
        const mb = minutos(b);
        return ma !== null && mb !== null && ma < mb;
      })
      .slice(0, MAX_FRANJAS_POR_DIA);
    if (ok.length) franjas[dia] = ok;
  }
  return {
    activo: r.activo === true,
    duracion_min: elegir(r.duracion_min, DURACIONES_VISITA, 45),
    anticipacion_horas: elegir(r.anticipacion_horas, ANTICIPACIONES_VISITA, 12),
    dias_adelante: elegir(r.dias_adelante, DIAS_ADELANTE_VISITA, 14),
    lugar: typeof r.lugar === 'string' && r.lugar.trim() ? r.lugar.trim().slice(0, 200) : null,
    franjas,
  };
}

/** "YYYY-MM-DD" de una fecha en Argentina. */
export function fechaAR(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * MIN_MS).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo) de una fecha "YYYY-MM-DD". */
function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00${OFFSET_AR}`).getUTCDay();
}

/** "YYYY-MM-DD" + "HH:MM" en Argentina → instante. null si el formato no sirve. */
export function instanteAR(fecha: string, hora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || minutos(hora) === null) return null;
  const d = new Date(`${fecha}T${hora}:00${OFFSET_AR}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "jue 27/11 10:00" (hora de Argentina). */
export function textoTurno(d: Date): string {
  const f = fechaAR(d);
  const hora = hhmm(Math.round(((d.getTime() - 3 * 60 * MIN_MS) % DIA_MS + DIA_MS) % DIA_MS / MIN_MS));
  return `${DIAS_CORTOS[diaSemana(f)]} ${f.slice(8, 10)}/${f.slice(5, 7)} ${hora}`;
}

export type Ocupado = { inicio: Date; fin: Date };

/**
 * Turnos libres desde ahora + anticipación hasta `dias_adelante`: cada franja
 * se parte en turnos de `duracion_min`; se descartan los que se superponen
 * con una visita ya agendada. `soloFecha` limita a un día.
 */
export function turnosLibres(c: ConfigVisitas, ocupados: Ocupado[], ahora: Date, soloFecha?: string | null): Date[] {
  const desde = ahora.getTime() + c.anticipacion_horas * 60 * MIN_MS;
  const hoy = fechaAR(ahora);
  const libres: Date[] = [];
  for (let k = 0; k <= c.dias_adelante; k++) {
    const fecha = fechaAR(new Date(new Date(`${hoy}T12:00:00${OFFSET_AR}`).getTime() + k * DIA_MS));
    if (soloFecha && fecha !== soloFecha) continue;
    const franjas = c.franjas[String(diaSemana(fecha)) as keyof ConfigVisitas['franjas']] ?? [];
    for (const [a, b] of franjas) {
      const ma = minutos(a)!;
      const mb = minutos(b)!;
      for (let m = ma; m + c.duracion_min <= mb; m += c.duracion_min) {
        const inicio = instanteAR(fecha, hhmm(m))!;
        const fin = inicio.getTime() + c.duracion_min * MIN_MS;
        if (inicio.getTime() < desde) continue;
        if (ocupados.some((o) => inicio.getTime() < o.fin.getTime() && o.inicio.getTime() < fin)) continue;
        libres.push(inicio);
      }
    }
  }
  return libres;
}

/** Para la herramienta: turnos agrupados por día, como mucho `maxDias` días y `maxPorDia` turnos por día. */
export function textoTurnosLibres(turnos: Date[], maxDias = 5, maxPorDia = 8): string {
  const porDia = new Map<string, Date[]>();
  for (const t of turnos) {
    const f = fechaAR(t);
    if (!porDia.has(f)) porDia.set(f, []);
    porDia.get(f)!.push(t);
  }
  const lineas = [...porDia.entries()].slice(0, maxDias).map(([f, ts]) => {
    const horas = ts.slice(0, maxPorDia).map((t) => textoTurno(t).split(' ')[2]);
    const mas = ts.length > maxPorDia ? ` (y ${ts.length - maxPorDia} más)` : '';
    return `- ${textoTurno(ts[0]).split(' ').slice(0, 2).join(' ')} [${f}]: ${horas.join(', ')}${mas}`;
  });
  return lineas.join('\n');
}

/** Para la ficha: "lunes a viernes 10:00–13:00 y 15:00–18:00; sábado 10:00–13:00". */
export function textoHorarios(c: ConfigVisitas): string {
  const grupos: { dias: number[]; franjas: string }[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const fr = c.franjas[String(d) as keyof ConfigVisitas['franjas']];
    if (!fr?.length) continue;
    const texto = fr.map(([a, b]) => `${a}–${b}`).join(' y ');
    const ultimo = grupos[grupos.length - 1];
    const anterior = ultimo?.dias[ultimo.dias.length - 1];
    if (ultimo && ultimo.franjas === texto && anterior !== undefined && (anterior + 1) % 7 === d) ultimo.dias.push(d);
    else grupos.push({ dias: [d], franjas: texto });
  }
  return grupos
    .map((g) => {
      const dias =
        g.dias.length === 1
          ? DIAS_LARGOS[g.dias[0]]
          : g.dias.length === 2
            ? `${DIAS_LARGOS[g.dias[0]]} y ${DIAS_LARGOS[g.dias[1]]}`
            : `${DIAS_LARGOS[g.dias[0]]} a ${DIAS_LARGOS[g.dias[g.dias.length - 1]]}`;
      return `${dias} ${g.franjas}`;
    })
    .join('; ');
}
