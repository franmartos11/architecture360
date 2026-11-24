'use client';

import { Card, CardHeader, StatStrip } from '@/components/admin/panel-ui';
import type { MetricsResponse } from '@/lib/analytics/metrics';
import { fmtInt, fmtPct } from './format';

// Resumen de la pantalla Métricas: cifras, embudo, origen del tráfico y dispositivo.

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full bg-brand-700" style={{ width: `${w}%` }} />
    </div>
  );
}

export default function MetricsSummary({ data, onGoToChannels }: { data: MetricsResponse; onGoToChannels: () => void }) {
  const s = data.summary;
  const funnel = [
    { label: 'Visitaron el sitio', value: s.visitors },
    { label: 'Vieron una unidad', value: s.unit_viewers },
    { label: 'Abrieron un recorrido 360', value: s.tour_viewers },
    { label: 'Consultaron', value: s.web_converters },
  ];

  const origins = [
    ...data.sources.channels.filter(c => c.visitors > 0).map(c => ({ key: `c:${c.slug}`, label: c.name, detail: c.kind === 'campaña' ? 'Campaña' : 'Inmobiliaria', visitors: c.visitors, converters: c.converters })),
    ...data.sources.unregistered.map(u => ({ key: `u:${u.ref}`, label: `?ref=${u.ref}`, detail: 'Link sin registrar', visitors: u.visitors, converters: u.converters })),
    ...data.sources.direct.map(d => ({ key: `d:${d.host ?? ''}`, label: d.host ?? 'Directo', detail: d.host ? 'Sin link · llegó desde ahí' : 'Sin link ni sitio de origen', visitors: d.visitors, converters: d.converters })),
  ].sort((a, b) => b.visitors - a.visitors);
  const maxOrigin = origins[0]?.visitors ?? 0;

  const devices = s.mobile_visitors + s.desktop_visitors;
  const mobileShare = devices > 0 ? s.mobile_visitors / devices : null;

  return (
    <div className="flex flex-col gap-4">
      <StatStrip
        stats={[
          { label: 'Visitantes únicos', value: fmtInt(s.visitors), hint: `${fmtInt(s.sessions)} visitas` },
          { label: 'Consultas web', value: fmtInt(s.web_converters), hint: `${fmtInt(s.web_leads)} por formulario · ${fmtInt(s.whatsapp_clickers)} por WhatsApp` },
          { label: 'Conversión', value: fmtPct(s.rate), hint: 'Visitantes que consultaron' },
          { label: 'Otros leads', value: fmtInt(s.other_leads), hint: 'Bot de WhatsApp o cargados a mano' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Embudo" />
          <ol className="m-0 mt-4 p-0 list-none flex flex-col gap-3.5">
            {funnel.map(step => (
              <li key={step.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-gray-700">{step.label}</span>
                  <span className="tabular-nums font-semibold text-gray-900">
                    {fmtInt(step.value)}
                    {step !== funnel[0] && s.visitors > 0 && <span className="ml-1.5 font-normal text-gray-500">{fmtPct(step.value / s.visitors)}</span>}
                  </span>
                </div>
                <Bar value={step.value} max={s.visitors} />
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="De dónde llegan"
            action={<button type="button" onClick={onGoToChannels} className="underline underline-offset-2">Inmobiliarias y canales →</button>}
          />
          {origins.length === 0 ? (
            <p className="m-0 mt-4 text-sm text-gray-600">Sin visitas en este período.</p>
          ) : (
            <ul className="m-0 mt-4 p-0 list-none flex flex-col gap-3.5">
              {origins.slice(0, 8).map(o => (
                <li key={o.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-gray-900 font-medium">{o.label}</span>
                      <span className="ml-2 text-xs text-gray-500">{o.detail}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-900">
                      {fmtInt(o.visitors)}
                      <span className="ml-1.5 text-gray-500">· {fmtInt(o.converters)} consultas</span>
                    </span>
                  </div>
                  <Bar value={o.visitors} max={maxOrigin} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Dispositivo" />
        {mobileShare == null ? (
          <p className="m-0 mt-3 text-sm text-gray-600">Sin visitas en este período.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-3 rounded-full bg-gray-200 overflow-hidden flex" aria-hidden="true">
              <div className="h-full bg-brand-700" style={{ width: `${mobileShare * 100}%` }} />
            </div>
            <div className="flex justify-between text-sm text-gray-700">
              <span>Celular <strong className="text-gray-900 tabular-nums">{fmtPct(mobileShare)}</strong></span>
              <span>Computadora <strong className="text-gray-900 tabular-nums">{fmtPct(1 - mobileShare)}</strong></span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
