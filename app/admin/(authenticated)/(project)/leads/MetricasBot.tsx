'use client';

import { useCallback, useEffect, useState } from 'react';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { RANGOS_METRICAS, type MetricasBot as Metricas, type RangoMetricas } from '@/lib/whatsapp-bot/metricas';

const num = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('es-AR').format(n));
const diaCorto = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
// Montos chicos (un turno cuesta centavos): con 2 decimales, y con 3 por debajo de 1 USD.
const usd = (n: number | null) =>
  n === null ? '—' : `US$ ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 }).format(n)}`;

/** Costo estimado de la IA en el período (precios de lista, ver lib/whatsapp-bot/ia/uso.ts). */
function CostoIa({ c }: { c: NonNullable<Metricas['costoIa']> }) {
  if (c.turnos === 0 && c.simuladorUsd === null) {
    return <p className="m-0 text-[13px] text-gray-600">Todavía no hay uso de la IA registrado en este período.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-semibold text-gray-900">Costo de la IA (estimado)</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Cifra valor={usd(c.usd)} label="Total del bot" detalle={`${num(c.turnos)} ${c.turnos === 1 ? 'respuesta' : 'respuestas'} de la IA`} />
        <Cifra valor={usd(c.usdPorConversacion)} label="Por conversación" detalle={`${num(c.conversaciones)} ${c.conversaciones === 1 ? 'conversación' : 'conversaciones'}`} />
        <Cifra valor={c.cachePct === null ? '—' : `${c.cachePct}%`} label="Leído de la caché" detalle="Más alto, más barato" />
      </div>
      <span className="text-xs text-gray-600">
        Con precios de lista de Anthropic; la factura real puede variar.
        {c.simuladorUsd !== null && ` Pruebas del simulador aparte: ${usd(c.simuladorUsd)}.`}
        {c.incompleto && ' Algunas respuestas las dio un modelo sin precio cargado y no están en el total.'}
      </span>
    </div>
  );
}

function Cifra({ valor, label, detalle }: { valor: string; label: string; detalle?: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-gray-100 px-4 py-3.5 min-w-0">
      <span className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 tabular-nums">{valor}</span>
      <span className="text-[13px] text-gray-800">{label}</span>
      {detalle && <span className="text-xs text-gray-600 mt-0.5">{detalle}</span>}
    </div>
  );
}

/** Barras de conversaciones nuevas por día: una serie, color de la marca, tooltip por barra. */
function BarrasPorDia({ datos }: { datos: Metricas['porDia'] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map(d => d.conversaciones));
  const total = datos.reduce((a, d) => a + d.conversaciones, 0);
  // Rótulos del eje: primero, medio y último (nunca uno por barra).
  const rotulos = new Set([0, Math.floor((datos.length - 1) / 2), datos.length - 1]);
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-[13px] font-semibold text-gray-900">Conversaciones nuevas por día</figcaption>
      {total === 0 ? (
        <p className="m-0 text-[13px] text-gray-500">Todavía no hubo conversaciones en este período.</p>
      ) : (
        <>
          <div className="relative">
            <div className="flex items-end gap-[3px] h-[120px] border-b border-gray-200" aria-hidden="true">
              {datos.map((d, i) => (
                <div
                  key={d.fecha}
                  className="flex-1 h-full flex items-end cursor-default"
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(a => (a === i ? null : a))}
                >
                  <div
                    className={`w-full rounded-t-[3px] transition-opacity ${activo === null || activo === i ? 'opacity-100' : 'opacity-40'} ${d.conversaciones ? 'bg-brand-700' : 'bg-gray-200'}`}
                    style={{ height: d.conversaciones ? `${Math.max(4, (d.conversaciones / max) * 100)}%` : 2 }}
                  />
                </div>
              ))}
            </div>
            {activo !== null && (
              <div
                className="pointer-events-none absolute -top-2 -translate-y-full -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-[12px] text-white shadow"
                style={{ left: `${((activo + 0.5) / datos.length) * 100}%` }}
              >
                {diaCorto(datos[activo].fecha)} · {datos[activo].conversaciones} {datos[activo].conversaciones === 1 ? 'conversación' : 'conversaciones'}
              </div>
            )}
          </div>
          <div className="relative h-4 text-xs text-gray-600" aria-hidden="true">
            {datos.map((d, i) =>
              rotulos.has(i) ? (
                <span
                  key={d.fecha}
                  className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                  style={{ left: i === 0 ? 0 : i === datos.length - 1 ? '100%' : `${((i + 0.5) / datos.length) * 100}%` }}
                >
                  {diaCorto(d.fecha)}
                </span>
              ) : null,
            )}
          </div>
          {/* Vista en tabla para lectores de pantalla. */}
          <table className="sr-only">
            <caption>Conversaciones nuevas por día</caption>
            <thead><tr><th>Día</th><th>Conversaciones</th></tr></thead>
            <tbody>{datos.map(d => <tr key={d.fecha}><td>{diaCorto(d.fecha)}</td><td>{d.conversaciones}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </figure>
  );
}

export default function MetricasBot() {
  const activeProjectId = useActiveProjectId();
  const [dias, setDias] = useState<RangoMetricas>(30);
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState(false);
  const url = withActiveProject(`/api/admin/whatsapp-bot/metricas?dias=${dias}`, activeProjectId);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Request failed');
      const data = (await res.json()) as Partial<Metricas> | null;
      if (!data || !Array.isArray(data.porDia) || !Array.isArray(data.unidades)) throw new Error('Respuesta inesperada');
      setM(data as Metricas);
      setError(false);
    } catch (e) {
      console.error(e);
      setError(true);
    }
  }, [url]);

  useEffect(() => {
    // Carga desde la API al cambiar el rango: los setState ocurren después del fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const maxUnidad = m ? Math.max(1, ...m.unidades.map(u => u.leads)) : 1;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-5 sm:px-6 py-5 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-base font-semibold text-gray-900">Resultados del bot</h2>
        <div role="group" aria-label="Período" className="inline-flex rounded-[10px] bg-[#EBE8E2] p-1">
          {RANGOS_METRICAS.map(r => (
            <button
              key={r}
              type="button"
              aria-pressed={dias === r}
              onClick={() => setDias(r)}
              className={`min-h-[32px] px-3 rounded-[7px] text-[13px] ${dias === r ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.08)]' : 'text-gray-700 hover:text-gray-900'}`}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>
      {error && <p className="m-0 text-[13px] font-medium text-red-700" role="alert">No se pudieron cargar los resultados.</p>}
      {!m && !error && <p className="m-0 text-[13px] text-gray-600">Cargando…</p>}
      {m && (
        <div className="flex flex-wrap gap-6">
          <div className="flex-[1_1_320px] grid grid-cols-2 gap-2.5 content-start">
            <Cifra valor={num(m.conversaciones)} label="Conversaciones nuevas" detalle={m.mensajesClientes !== null ? `${num(m.mensajesClientes)} mensajes de clientes` : undefined} />
            <Cifra valor={num(m.leads)} label="Leads del bot" detalle={m.conversion !== null ? `${m.conversion}% de las conversaciones` : undefined} />
            <Cifra valor={num(m.leadsCalientes)} label="Leads calientes" detalle={`${num(m.respuestasBot)} respuestas del bot`} />
            <Cifra valor={num(m.visitasAgendadas)} label="Visitas agendadas" detalle={m.visitasRealizadas !== null ? `${num(m.visitasRealizadas)} realizadas` : undefined} />
          </div>
          <div className="flex-[2_1_380px] min-w-0">
            <BarrasPorDia datos={m.porDia} />
          </div>
          <div className="flex-[1_1_220px] flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold text-gray-900">Unidades más pedidas</span>
            {m.unidades.length === 0 ? (
              <span className="text-[13px] text-gray-600">Sin leads con unidad en este período.</span>
            ) : (
              <ol className="m-0 p-0 list-none grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-2 text-[13px]">
                {m.unidades.map(u => (
                  <li key={u.unidad} className="contents">
                    <span className="font-semibold text-gray-900 max-w-[96px] truncate">{u.unidad}</span>
                    <span className="h-2 rounded-full bg-[#EBE8E2]" aria-hidden="true">
                      <span className="block h-2 rounded-full bg-brand-700" style={{ width: `${Math.round((u.leads / maxUnidad) * 100)}%` }} />
                    </span>
                    <span className="text-gray-700 tabular-nums text-right whitespace-nowrap">{u.leads} {u.leads === 1 ? 'lead' : 'leads'}</span>
                  </li>
                ))}
              </ol>
            )}
            {m.preguntasPendientes !== null && m.preguntasPendientes > 0 && (
              <span className="mt-1 text-[13px] text-amber-800">
                {m.preguntasPendientes} {m.preguntasPendientes === 1 ? 'pregunta' : 'preguntas'} sin responder (más abajo).
              </span>
            )}
          </div>
        </div>
      )}
      {m?.costoIa && (
        <div className="border-t border-gray-200 pt-5">
          <CostoIa c={m.costoIa} />
        </div>
      )}
      {m?.web && ((m.web.charlas ?? 0) > 0 || m.web.costoUsd !== null) && (
        <div className="border-t border-gray-200 pt-5 flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold text-gray-900">Chat en el sitio</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Cifra valor={num(m.web.charlas)} label="Charlas" detalle="Visitantes que escribieron" />
            <Cifra
              valor={num(m.web.contactos)}
              label="Dejaron contacto"
              detalle={m.web.charlas && m.web.contactos !== null ? `${Math.round((m.web.contactos / m.web.charlas) * 100)}% de las charlas` : undefined}
            />
            <Cifra valor={usd(m.web.costoUsd)} label="Costo de la IA" detalle="Estimado, aparte del WhatsApp" />
          </div>
        </div>
      )}
    </section>
  );
}
