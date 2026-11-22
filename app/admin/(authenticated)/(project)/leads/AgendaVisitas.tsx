'use client';

import { fieldClass } from '@/components/admin/panel-ui';
import { Interruptor } from './leads-ui';
import {
  ANTICIPACIONES_VISITA,
  DIAS_ADELANTE_VISITA,
  DURACIONES_VISITA,
  MAX_FRANJAS_POR_DIA,
  type ConfigVisitas,
  type Franja,
} from '@/lib/whatsapp-bot/visitas';

type Dia = keyof ConfigVisitas['franjas'];

// Lunes primero, como se lee una agenda.
const DIAS: { id: Dia; label: string }[] = [
  { id: '1', label: 'Lunes' },
  { id: '2', label: 'Martes' },
  { id: '3', label: 'Miércoles' },
  { id: '4', label: 'Jueves' },
  { id: '5', label: 'Viernes' },
  { id: '6', label: 'Sábado' },
  { id: '0', label: 'Domingo' },
];

const ANTICIPACION_LABEL: Record<number, string> = { 2: '2 horas', 12: '12 horas', 24: '1 día', 48: '2 días' };
const DIAS_ADELANTE_LABEL: Record<number, string> = { 7: '1 semana', 14: '2 semanas', 30: '1 mes' };

const ETIQUETA = 'text-sm font-medium text-gray-900';

/** Editor de la agenda de visitas del bot (controlado: guarda el padre). */
export default function AgendaVisitas({
  valor,
  onChange,
  error,
}: {
  valor: ConfigVisitas;
  onChange: (v: ConfigVisitas) => void;
  error?: string;
}) {
  const set = <K extends keyof ConfigVisitas>(k: K, v: ConfigVisitas[K]) => onChange({ ...valor, [k]: v });
  const setFranjas = (dia: Dia, fr: Franja[]) => {
    const franjas = { ...valor.franjas };
    if (fr.length) franjas[dia] = fr;
    else delete franjas[dia];
    set('franjas', franjas);
  };

  const hora = `${fieldClass.replace('w-full ', '')} w-[136px] shrink-0 px-3 tabular-nums`;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className={`px-5 sm:px-6 py-4 flex items-center gap-4 ${valor.activo ? 'border-b border-gray-100' : ''}`}>
        <div className="flex-1 min-w-0">
          <h2 className="m-0 text-base font-semibold text-gray-900">Agendar visitas por WhatsApp</h2>
          <p className="m-0 mt-1 text-sm text-gray-600">El bot ofrece turnos libres, agenda la visita y te avisa.</p>
        </div>
        <Interruptor label="Agendar visitas por WhatsApp" checked={valor.activo} onChange={v => set('activo', v)} />
      </div>

      {valor.activo && (
        <div className="px-5 sm:px-6 py-5 flex flex-col gap-[18px]">
          <label className="flex flex-col gap-1.5">
            <span className={ETIQUETA}>Dónde es la visita</span>
            <input
              className={fieldClass}
              value={valor.lugar ?? ''}
              maxLength={200}
              onChange={e => set('lugar', e.target.value || null)}
              placeholder="Showroom en Av. Libertador 1234"
            />
          </label>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Duración</span>
              <select className={fieldClass} value={valor.duracion_min} onChange={e => set('duracion_min', Number(e.target.value))}>
                {DURACIONES_VISITA.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Anticipación mínima</span>
              <select className={fieldClass} value={valor.anticipacion_horas} onChange={e => set('anticipacion_horas', Number(e.target.value))}>
                {ANTICIPACIONES_VISITA.map(h => <option key={h} value={h}>{ANTICIPACION_LABEL[h]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Ofrecer turnos hasta</span>
              <select className={fieldClass} value={valor.dias_adelante} onChange={e => set('dias_adelante', Number(e.target.value))}>
                {DIAS_ADELANTE_VISITA.map(d => <option key={d} value={d}>{DIAS_ADELANTE_LABEL[d]}</option>)}
              </select>
            </label>
          </div>

          <fieldset className="m-0 p-0 border-0 min-w-0">
            <legend className="w-full flex justify-between items-baseline mb-2">
              <span className={ETIQUETA}>Horarios</span>
              <span className="text-xs text-gray-600">Hora de Argentina</span>
            </legend>
            <ul className="m-0 p-0 list-none divide-y divide-[#F1EFEA] rounded-xl border border-[#ECE9E3]">
              {DIAS.map(({ id, label }) => {
                const franjas = valor.franjas[id] ?? [];
                const abre = franjas.length > 0;
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span className={`w-[96px] shrink-0 text-sm font-semibold ${abre ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
                    {abre ? (
                      <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
                        {franjas.map(([desde, hasta], k) => (
                          <div key={k} className="flex items-center gap-2 flex-wrap">
                            <input
                              type="time"
                              step={900}
                              className={hora}
                              value={desde}
                              aria-label={`${label}: desde`}
                              onChange={e => setFranjas(id, franjas.map((f, j) => (j === k ? [e.target.value, f[1]] : f)))}
                            />
                            <span className="text-gray-500" aria-hidden="true">–</span>
                            <input
                              type="time"
                              step={900}
                              className={hora}
                              value={hasta}
                              aria-label={`${label}: hasta`}
                              onChange={e => setFranjas(id, franjas.map((f, j) => (j === k ? [f[0], e.target.value] : f)))}
                            />
                            <button
                              type="button"
                              onClick={() => setFranjas(id, franjas.filter((_, j) => j !== k))}
                              className="min-h-[40px] px-2 text-[13px] text-gray-600 hover:text-red-700"
                              aria-label={`Quitar franja del ${label.toLowerCase()}`}
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="flex-1 text-sm text-gray-500">Sin visitas</span>
                    )}
                    {franjas.length < MAX_FRANJAS_POR_DIA && (
                      <button
                        type="button"
                        onClick={() => setFranjas(id, [...franjas, abre ? ['15:00', '18:00'] : ['10:00', '13:00']])}
                        className="ml-auto min-h-[36px] px-3 rounded-lg border border-gray-300 bg-white text-[13px] text-gray-900 hover:border-gray-400"
                        aria-label={abre ? `Agregar franja el ${label.toLowerCase()}` : `Agregar horario el ${label.toLowerCase()}`}
                      >
                        Agregar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </div>
      )}
      {error && <p className="m-0 px-5 sm:px-6 pb-4 text-xs font-medium text-red-700" role="alert">{error}</p>}
    </section>
  );
}
