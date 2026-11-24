'use client';

import { useState } from 'react';
import { Card, CardHeader } from '@/components/admin/panel-ui';
import { formatDuration, sortUnitStats, type UnitSortKey, type UnitStat } from '@/lib/analytics/metrics';
import { fmtInt } from './format';

const STATUS: Record<string, { label: string; className: string }> = {
  available: { label: 'Disponible', className: 'bg-[#eaf4ee] text-[#0f7a4d]' },
  reserved: { label: 'Reservada', className: 'bg-[#fdf7ec] text-[#a06a12]' },
  sold: { label: 'Vendida', className: 'bg-[#eaf0f6] text-[#2f5d7c]' },
};

const COLUMNS: { key: UnitSortKey; label: string; numeric: boolean }[] = [
  { key: 'code', label: 'Unidad', numeric: false },
  { key: 'views', label: 'Vistas', numeric: true },
  { key: 'viewers', label: 'Visitantes', numeric: true },
  { key: 'avg_seconds', label: 'Tiempo prom.', numeric: true },
  { key: 'tours', label: '360', numeric: true },
  { key: 'leads', label: 'Consultas', numeric: true },
];

export default function UnitRanking({ units, showStatus }: { units: UnitStat[]; showStatus: boolean }) {
  const [sort, setSort] = useState<{ key: UnitSortKey; dir: 'asc' | 'desc' }>({ key: 'views', dir: 'desc' });
  const rows = sortUnitStats(units, sort.key, sort.dir);
  const multiBuilding = new Set(units.map(u => u.building_name)).size > 1;

  const toggle = (key: UnitSortKey) =>
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'code' ? 'asc' : 'desc' });

  return (
    <Card padded={false}>
      <div className="px-5 sm:px-6 pt-5 sm:pt-6">
        <CardHeader title="Unidades más miradas" />
        <p className="m-0 mt-1 text-[13px] text-gray-600">Cuenta las vistas de la ficha y las aperturas en el plano del piso. Tocá una columna para ordenar.</p>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 px-5 sm:px-6 py-6 text-sm text-gray-600">Todavía nadie miró una unidad en este período.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead>
              <tr className="border-y border-gray-200 bg-gray-50">
                {COLUMNS.map(c => {
                  const on = sort.key === c.key;
                  return (
                    <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-4 py-2.5 font-semibold text-gray-700 ${c.numeric ? 'text-right' : 'text-left'} first:pl-5 sm:first:pl-6`}>
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-gray-900">
                        {c.label}
                        <span aria-hidden="true" className={on ? 'text-gray-900' : 'text-gray-300'}>{on && sort.dir === 'asc' ? '↑' : '↓'}</span>
                      </button>
                    </th>
                  );
                })}
                {showStatus && <th scope="col" className="px-4 pr-5 sm:pr-6 py-2.5 text-left font-semibold text-gray-700">Estado</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(u => {
                const st = STATUS[u.status];
                return (
                  <tr key={u.unit_id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 pl-5 sm:pl-6 py-3">
                      <span className="font-semibold text-gray-900">{u.code}</span>
                      <span className="ml-2 text-xs text-gray-500">{multiBuilding ? `${u.building_name} · ` : ''}Piso {u.floor_number}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(u.views)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(u.viewers)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatDuration(u.avg_seconds)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(u.tours)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtInt(u.leads)}</td>
                    {showStatus && (
                      <td className="px-4 pr-5 sm:pr-6 py-3">
                        {st && <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
