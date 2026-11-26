'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Check, ChevronLeft, ChevronRight, Info, MessageSquare } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectRole } from '@/lib/project-role-context';
import { hasRole } from '@/lib/project-roles';
import { fechaAR, normalizarConfigVisitas, textoHorarios, textoTurno, type ConfigVisitas } from '@/lib/whatsapp-bot/visitas';
import type { WaEstadoVisita, WaVisita } from '@/types/whatsapp-bot';
import { Cifra, Nota, PuntoVivo } from './leads-ui';

const ESTADO: Record<WaEstadoVisita, { label: string; cls: string }> = {
  agendada: { label: 'Por confirmar', cls: 'bg-amber-50 text-amber-800 border border-amber-200' },
  confirmada: { label: 'Confirmada', cls: 'bg-brand-100 text-brand-800' },
  realizada: { label: 'Realizada', cls: 'bg-brand-100 text-brand-800' },
  no_vino: { label: 'No vino', cls: 'bg-red-50 text-red-700 border border-red-200' },
  cancelada: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500 border border-gray-200 line-through' },
};

const BTN = 'inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-[10px] border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:border-gray-400 disabled:opacity-50';
const BTN_PRIMARIO = 'inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 text-sm font-semibold text-white hover:bg-black disabled:opacity-50';
const DIA_MS = 86_400_000;
const ANTICIPACION_LABEL: Record<number, string> = { 2: '2 horas', 12: '12 horas', 24: '1 día', 48: '2 días' };
const TZ = 'America/Argentina/Buenos_Aires';

/** Acciones que tienen sentido según si la visita ya pasó. */
function acciones(v: WaVisita, pasada: boolean): { estado: WaEstadoVisita; label: string; primaria?: boolean }[] {
  if (v.estado === 'cancelada') return pasada ? [] : [{ estado: 'agendada', label: 'Reabrir' }];
  if (pasada) {
    return v.estado === 'realizada' || v.estado === 'no_vino'
      ? []
      : [
          { estado: 'realizada', label: 'Vino' },
          { estado: 'no_vino', label: 'No vino' },
        ];
  }
  return [
    ...(v.estado === 'agendada' ? [{ estado: 'confirmada' as const, label: 'Confirmar', primaria: true }] : []),
    { estado: 'cancelada', label: 'Cancelar' },
  ];
}

/** Mediodía (hora AR) del día `f` (YYYY-MM-DD): seguro para sumar días y formatear. */
const mediodia = (f: string) => new Date(`${f}T12:00:00-03:00`);
const formato = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...o }).format(d);
const diaCorto = (d: Date) => formato(d, { weekday: 'short' }).replace('.', '').toUpperCase();

function PillEstado({ e }: { e: WaEstadoVisita }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ESTADO[e].cls}`}>
      {(e === 'confirmada' || e === 'realizada') && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
      {ESTADO[e].label}
    </span>
  );
}

export default function Visitas() {
  const activeProjectId = useActiveProjectId();
  const router = useRouter();
  const params = useSearchParams();
  // La agenda del bot (columna derecha) sale de su configuración: administrador en adelante.
  const puedeVerAgenda = hasRole(useProjectRole(), 'administrador');
  const url = withActiveProject('/api/admin/whatsapp-bot/visitas', activeProjectId);
  const [visitas, setVisitas] = useState<WaVisita[]>([]);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<ConfigVisitas | null>(null);
  const [semana, setSemana] = useState(0);
  const [diaFiltro, setDiaFiltro] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<'todas' | 'agendada' | 'confirmada'>('todas');
  // Hora de referencia para separar próximas de pasadas: se toma al cargar.
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Request failed');
      const data: { visitas?: WaVisita[]; faltaTabla?: boolean } = await res.json();
      setVisitas(Array.isArray(data.visitas) ? data.visitas : []);
      setAhora(Date.now());
      setFaltaTabla(!!data.faltaTabla);
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [url]);

  useEffect(() => {
    // Carga inicial desde la API: los setState ocurren después del fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!puedeVerAgenda) return;
    let vivo = true;
    fetch(withActiveProject('/api/admin/whatsapp-bot', activeProjectId))
      .then(r => (r.ok ? r.json() : null))
      .then((d: { bot?: { visitas?: unknown } | null } | null) => {
        if (vivo) setAgenda(normalizarConfigVisitas(d?.bot?.visitas));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [activeProjectId, puedeVerAgenda]);

  const cambiar = async (v: WaVisita, estado: WaEstadoVisita) => {
    setOcupada(v.id);
    setErrorAccion(null);
    try {
      const res = await fetch(`/api/admin/whatsapp-bot/visitas/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrorAccion((data as { error?: string } | null)?.error ?? 'No se pudo guardar');
        return;
      }
      setVisitas(vs => vs.map(x => (x.id === v.id ? (data as WaVisita) : x)));
    } catch {
      setErrorAccion('No se pudo conectar');
    } finally {
      setOcupada(null);
    }
  };

  const verChat = (convId: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', 'conversaciones');
    next.set('c', convId);
    router.push(`?${next.toString()}`);
  };

  if (cargando) return <LoadingSpinner text="Cargando visitas..." tone="light" />;
  if (error) return <ErrorState message="No se pudieron cargar las visitas." onRetry={() => { setCargando(true); cargar(); }} />;

  const proximas = visitas.filter(v => new Date(v.fin).getTime() >= ahora);
  const pasadas = visitas.filter(v => new Date(v.fin).getTime() < ahora).reverse();
  const activas = proximas.filter(v => v.estado !== 'cancelada');
  const realizadas = pasadas.filter(v => v.estado === 'realizada').length;
  const noVino = pasadas.filter(v => v.estado === 'no_vino').length;
  const pasadasValidas = pasadas.filter(v => v.estado !== 'cancelada').length;

  const proximasFiltradas = proximas.filter(v => {
    if (diaFiltro && fechaAR(new Date(v.inicio)) !== diaFiltro) return false;
    if (estadoFiltro !== 'todas' && v.estado !== estadoFiltro) return false;
    return true;
  });

  // Próximas agrupadas por día.
  const porDia = new Map<string, WaVisita[]>();
  for (const v of proximasFiltradas) {
    const f = fechaAR(new Date(v.inicio));
    if (!porDia.has(f)) porDia.set(f, []);
    porDia.get(f)!.push(v);
  }
  const porConfirmarCount = activas.filter(v => v.estado === 'agendada').length;
  const confirmadasCount = activas.filter(v => v.estado === 'confirmada').length;

  // Semana (lunes a domingo, hora AR) que muestra la tira de días.
  const hoy = fechaAR(new Date(ahora));
  // Arranca en la semana de la próxima visita (o en la actual si no hay ninguna).
  const primera = activas.reduce<string | null>((min, v) => (!min || v.inicio < min ? v.inicio : min), null);
  const baseHoy = mediodia(primera ? fechaAR(new Date(primera)) : hoy);
  const lunes = new Date(baseHoy.getTime() - ((baseHoy.getUTCDay() + 6) % 7) * DIA_MS + semana * 7 * DIA_MS);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes.getTime() + i * DIA_MS);
    const f = fechaAR(d);
    const cuantas = visitas.filter(v => v.estado !== 'cancelada' && fechaAR(new Date(v.inicio)) === f).length;
    const cerrado = !!agenda && !(agenda.franjas[String(d.getUTCDay()) as keyof ConfigVisitas['franjas']]?.length);
    return { d, f, cuantas, cerrado, esHoy: f === hoy };
  });
  const domingo = dias[6].d;
  const tituloSemana = lunes.getUTCMonth() === domingo.getUTCMonth()
    ? `Semana del ${formato(lunes, { day: 'numeric' })} al ${formato(domingo, { day: 'numeric', month: 'long' })}`
    : `Semana del ${formato(lunes, { day: 'numeric', month: 'long' })} al ${formato(domingo, { day: 'numeric', month: 'long' })}`;

  const fila = (v: WaVisita, pasada: boolean) => {
    const hora = textoTurno(new Date(v.inicio)).split(' ')[2];
    const botones = (
      <span className="flex gap-1.5 flex-wrap">
        {acciones(v, pasada).filter(a => a.primaria).map(a => (
          <button key={a.estado} type="button" onClick={() => cambiar(v, a.estado)} disabled={ocupada === v.id} className={BTN_PRIMARIO}>{a.label}</button>
        ))}
        {v.conversacion_id && (
          <button type="button" onClick={() => verChat(v.conversacion_id!)} className={`${BTN} gap-1.5`}>
            <MessageSquare className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
            {pasada && v.estado === 'no_vino' ? 'Reagendar' : 'Ver chat'}
          </button>
        )}
        {acciones(v, pasada).filter(a => !a.primaria).map(a => (
          <button key={a.estado} type="button" onClick={() => cambiar(v, a.estado)} disabled={ocupada === v.id} className={BTN}>{a.label}</button>
        ))}
      </span>
    );
    if (pasada) {
      const [dia, fecha] = textoTurno(new Date(v.inicio)).split(' ');
      return (
        <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5">
          <span className="w-[92px] shrink-0 text-[13px] text-gray-600 first-letter:uppercase">
            {dia} {fecha}
            <span className="block text-[15px] font-semibold text-gray-900 tabular-nums">{hora}</span>
          </span>
          <span className="flex-1 min-w-[160px]">
            <span className="block text-[15px] font-semibold text-gray-900 truncate">{v.nombre?.trim() || 'Sin nombre'}</span>
            <span className="block text-[13px] text-gray-600 mt-0.5 tabular-nums">{v.telefono ?? 'número oculto'}</span>
          </span>
          <PillEstado e={v.estado} />
          {botones}
        </li>
      );
    }
    return (
      <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 rounded-xl border border-[#ECE9E3] bg-gray-50">
        <span className="w-[56px] shrink-0 text-lg font-bold text-gray-900 tabular-nums">{hora}</span>
        <span className="flex-1 min-w-[180px]">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-gray-900 truncate">{v.nombre?.trim() || 'Sin nombre'}</span>
            <PillEstado e={v.estado} />
          </span>
          <span className="block text-[13px] text-gray-600 mt-0.5 tabular-nums">{v.telefono ?? 'número oculto'}</span>
        </span>
        {botones}
      </li>
    );
  };

  return (
    <div className="flex flex-wrap gap-6 items-start">
      <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-5">
        {faltaTabla && (
          <p className="m-0 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800" role="status">
            Falta actualizar la base de datos: volvé a correr supabase/schema.sql en Supabase.
          </p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cifra label="Próximas" valor={activas.length} />
          <Cifra tono="amber" label="Por confirmar" valor={activas.filter(v => v.estado === 'agendada').length} />
          <Cifra label="Confirmadas" valor={activas.filter(v => v.estado === 'confirmada').length} />
          <Cifra
            label="Realizadas · 30 días"
            valor={<>{realizadas}{pasadasValidas > 0 && <span className="text-[15px] font-medium text-gray-600"> de {pasadasValidas}</span>}</>}
          />
        </div>

        <section aria-label="Semana" className="rounded-2xl border border-gray-200 bg-white px-4 sm:px-5 py-4">
          <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
            <h2 className="m-0 text-[15px] font-semibold text-gray-900">{tituloSemana}</h2>
            <div className="flex items-center gap-1.5">
              {(semana !== 0 || diaFiltro) && (
                <button
                  type="button"
                  onClick={() => { setSemana(0); setDiaFiltro(null); }}
                  className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:border-gray-400"
                >
                  Hoy
                </button>
              )}
              <button type="button" aria-label="Semana anterior" onClick={() => setSemana(s => s - 1)} className="w-9 h-9 rounded-lg border border-gray-300 bg-white flex items-center justify-center text-gray-900 hover:border-gray-400">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Semana siguiente" onClick={() => setSemana(s => s + 1)} className="w-9 h-9 rounded-lg border border-gray-300 bg-white flex items-center justify-center text-gray-900 hover:border-gray-400">
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <ol className="m-0 p-0 list-none grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
            {dias.map(({ d, f, cuantas, cerrado, esHoy }) => {
              const seleccionado = diaFiltro === f;
              return (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => setDiaFiltro(prev => (prev === f ? null : f))}
                    aria-pressed={seleccionado}
                    aria-label={`${formato(d, { weekday: 'long', day: 'numeric' })}: ${cuantas ? `${cuantas} ${cuantas === 1 ? 'visita' : 'visitas'}` : cerrado ? 'cerrado' : 'sin visitas'}`}
                    className={`w-full py-2.5 rounded-[10px] transition-all cursor-pointer ${
                      cuantas
                        ? 'bg-brand-700 text-white hover:bg-brand-800'
                        : cerrado
                          ? 'bg-gray-100 text-gray-500 hover:bg-gray-200/70'
                          : 'hover:bg-gray-50'
                    } ${seleccionado ? 'ring-2 ring-offset-2 ring-gray-900' : esHoy && !cuantas ? 'ring-1 ring-inset ring-gray-300' : ''}`}
                  >
                    <div className={`text-[11px] sm:text-xs ${cuantas ? 'text-white/80' : 'text-gray-600'}`}>{diaCorto(d)}</div>
                    <div className="text-base sm:text-lg font-semibold mt-0.5 tabular-nums">{formato(d, { day: 'numeric' })}</div>
                    <div className="text-[11px] sm:text-xs mt-0.5 h-4 font-semibold">
                      {cuantas ? <><span className="sm:hidden">{cuantas}</span><span className="hidden sm:inline">{cuantas} {cuantas === 1 ? 'visita' : 'visitas'}</span></> : cerrado ? <span className="font-normal hidden sm:inline">Cerrado</span> : ''}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <Nota icono={<Info className="w-4 h-4" />}>Las agenda el bot por WhatsApp o por el chat del sitio. Cambiar el estado acá no le avisa al cliente.</Nota>
        {errorAccion && <p className="m-0 text-[13px] font-medium text-red-700" role="alert">{errorAccion}</p>}

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-base font-semibold text-gray-900">Próximas</h2>
              {diaFiltro && (
                <button
                  type="button"
                  onClick={() => setDiaFiltro(null)}
                  className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  {formato(mediodia(diaFiltro), { day: 'numeric', month: 'short' })} ×
                </button>
              )}
            </div>
            {proximas.length > 0 && (
              <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-xs">
                {(
                  [
                    { id: 'todas', label: `Todas (${proximas.length})` },
                    { id: 'agendada', label: `Por confirmar (${porConfirmarCount})` },
                    { id: 'confirmada', label: `Confirmadas (${confirmadasCount})` },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEstadoFiltro(tab.id)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${estadoFiltro === tab.id ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {porDia.size === 0 ? (
            <div className="px-5 py-6 flex flex-col items-start gap-3">
              <p className="m-0 text-sm text-gray-600">
                {diaFiltro || estadoFiltro !== 'todas'
                  ? 'No hay visitas que coincidan con este filtro.'
                  : puedeVerAgenda && !agenda?.activo
                    ? 'La agenda del bot está apagada. Activala para que los clientes puedan reservar horario directo desde el chat.'
                    : 'No hay visitas agendadas. Cuando un cliente reserve desde WhatsApp o el chat del sitio, aparece acá.'}
              </p>
              {!diaFiltro && estadoFiltro === 'todas' && puedeVerAgenda && !agenda?.activo && (
                <button
                  type="button"
                  onClick={() => router.replace('?tab=bot', { scroll: false })}
                  className={`${BTN_PRIMARIO} gap-1.5`}
                >
                  <Calendar className="w-4 h-4" aria-hidden="true" />
                  Activar agenda en Bot
                </button>
              )}
            </div>
          ) : (
            [...porDia.entries()].map(([f, vs]) => {
              const d = mediodia(f);
              return (
                <div key={f} className="flex gap-4 sm:gap-5 px-4 sm:px-5 py-4 border-b border-gray-100 last:border-b-0">
                  <h3 className="m-0 w-12 sm:w-14 shrink-0 text-center font-normal" aria-label={formato(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
                    <span className="block text-xs font-semibold text-gray-600">{diaCorto(d)}</span>
                    <span className="block font-display text-[28px] font-semibold leading-[1.1] text-gray-900 tabular-nums">{formato(d, { day: 'numeric' })}</span>
                    <span className="block text-xs text-gray-600">{formato(d, { month: 'short' }).replace('.', '')}</span>
                  </h3>
                  <ul className="m-0 p-0 list-none flex-1 min-w-0 flex flex-col gap-2.5">{vs.map(v => fila(v, false))}</ul>
                </div>
              );
            })
          )}
        </section>

        {pasadas.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <h2 className="m-0 px-5 py-4 text-base font-semibold text-gray-900 border-b border-gray-100">Últimos 30 días</h2>
            <ul className="m-0 p-0 list-none divide-y divide-gray-100">{pasadas.map(v => fila(v, true))}</ul>
          </section>
        )}
      </div>

      {((puedeVerAgenda && agenda) || realizadas + noVino > 0) && (
      <aside className="flex-[1_1_280px] min-w-0 flex flex-col gap-4 lg:sticky lg:top-20">
        {puedeVerAgenda && agenda && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">Agenda del bot</h2>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${agenda.activo ? 'text-brand-700' : 'text-gray-500'}`}>
                {agenda.activo ? <PuntoVivo /> : <span aria-hidden="true" className="w-2 h-2 rounded-full bg-gray-400" />}
                {agenda.activo ? 'Activa' : 'Apagada'}
              </span>
            </div>
            <dl className="m-0 mt-4 flex flex-col gap-3.5 text-sm">
              {agenda.lugar && <div><dt className="text-xs text-gray-600">Dónde</dt><dd className="m-0 mt-0.5 font-medium text-gray-900">{agenda.lugar}</dd></div>}
              <div>
                <dt className="text-xs text-gray-600">Horarios</dt>
                <dd className="m-0 mt-0.5 font-medium text-gray-900 leading-relaxed">
                  {textoHorarios(agenda) ? textoHorarios(agenda).split('; ').map(l => <span key={l} className="block first-letter:uppercase">{l}</span>) : 'Sin horarios'}
                </dd>
              </div>
              <div className="flex gap-6">
                <div><dt className="text-xs text-gray-600">Duración</dt><dd className="m-0 mt-0.5 font-medium text-gray-900">{agenda.duracion_min} min</dd></div>
                <div><dt className="text-xs text-gray-600">Anticipación</dt><dd className="m-0 mt-0.5 font-medium text-gray-900">{ANTICIPACION_LABEL[agenda.anticipacion_horas] ?? `${agenda.anticipacion_horas} h`}</dd></div>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => router.replace('?tab=bot', { scroll: false })}
              className="mt-4 w-full min-h-[44px] rounded-[10px] border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:border-gray-400"
            >
              Editar agenda
            </button>
          </div>
        )}
        {realizadas + noVino > 0 && (
          <div className="rounded-2xl bg-brand-700 text-white p-5">
            <div className="text-[13px] text-white/80">Asistencia · 30 días</div>
            <div className="font-display text-[28px] font-semibold mt-1 tabular-nums">{realizadas} de {realizadas + noVino}</div>
            <div className="h-1.5 rounded-full bg-white/20 mt-3" aria-hidden="true">
              <div className="h-1.5 rounded-full bg-white" style={{ width: `${Math.round((realizadas / (realizadas + noVino)) * 100)}%` }} />
            </div>
            <div className="text-[13px] text-white/80 mt-2.5">Visitas pasadas que se hicieron.</div>
          </div>
        )}
      </aside>
      )}
    </div>
  );
}
