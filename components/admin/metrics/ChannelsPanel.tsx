'use client';

import { useState } from 'react';
import { Card, CardHeader, Pill, SegmentedTabs, btnPrimary, btnSecondary, fieldClass } from '@/components/admin/panel-ui';
import { useToast } from '@/components/ui/ToastProvider';
import { withActiveProject } from '@/lib/active-project-context';
import { channelLink, channelSlug, type Channel, type ChannelKind } from '@/lib/analytics/channels';
import type { SourcesBreakdown } from '@/lib/analytics/metrics';
import { fmtInt, fmtPct } from './format';

// Inmobiliarias y campañas: cada una con su link (?ref=) y sus números del
// período. El slug se bloquea apenas el link tuvo tráfico (ver la API).

interface Props {
  channels: Channel[];
  stats: SourcesBreakdown;
  projectSlug: string;
  customDomain: string | null;
  activeProjectId: string | null;
  onChanged: () => void;
}

const KIND_OPTIONS: { value: ChannelKind; label: string }[] = [
  { value: 'inmobiliaria', label: 'Inmobiliaria' },
  { value: 'campaña', label: 'Campaña' },
];

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : 'No se pudo guardar.';
}

export default function ChannelsPanel({ channels, stats, projectSlug, customDomain, activeProjectId, onChanged }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('inmobiliaria');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const linkOf = (slug: string) => channelLink(slug, projectSlug, origin, customDomain);
  const statOf = (slug: string) => stats.channels.find(c => c.slug === slug);
  const active = channels.filter(c => !c.archived_at);
  const archived = channels.filter(c => c.archived_at);
  const api = (path = '') => withActiveProject(`/api/admin/channels${path}`, activeProjectId);

  const run = async (fn: () => Promise<string | null>, ok: string) => {
    setBusy(true);
    const error = await fn().catch(() => 'No se pudo guardar.');
    setBusy(false);
    if (error) { toast(error); return false; }
    toast(ok);
    onChanged();
    return true;
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (await run(() => send(api(), 'POST', { name, kind }), 'Canal agregado')) setName('');
  };

  const copy = (slug: string) => {
    navigator.clipboard?.writeText(linkOf(slug)).then(() => toast('Link copiado al portapapeles'), () => toast('No se pudo copiar'));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Agregar inmobiliaria o campaña" />
        <p className="m-0 mt-1 text-[13px] text-gray-600">
          Cada una recibe su propio link al sitio. El comprador ve lo mismo; acá ves cuántas visitas y consultas trajo cada una.
        </p>
        <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-gray-900 flex-[1_1_260px]">
            Nombre
            <input className={fieldClass} value={name} onChange={e => setName(e.target.value)} placeholder="Inmobiliaria Pérez" maxLength={120} />
          </label>
          <SegmentedTabs label="Tipo de canal" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <button type="submit" className={btnPrimary} disabled={busy || !channelSlug(name)}>Agregar</button>
        </form>
        {name.trim() && channelSlug(name) && (
          <p className="m-0 mt-2 text-xs text-gray-500 break-all">Link: {linkOf(channelSlug(name))}</p>
        )}
      </Card>

      <Card padded={false}>
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <CardHeader title={`Canales · ${active.length}`} />
          <p className="m-0 mt-1 text-[13px] text-gray-600">Visitantes y consultas del período elegido arriba.</p>
        </div>
        {active.length === 0 ? (
          <p className="m-0 px-5 sm:px-6 pb-6 pt-2 text-sm text-gray-600">Todavía no cargaste ninguna inmobiliaria ni campaña.</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {active.map(c => (
              <ChannelRow
                key={c.id}
                channel={c}
                link={linkOf(c.slug)}
                stat={statOf(c.slug)}
                editing={editing === c.id}
                busy={busy}
                onEdit={() => setEditing(c.id)}
                onCancel={() => setEditing(null)}
                onCopy={() => copy(c.slug)}
                onSave={async changes => { if (await run(() => send(api(`/${c.id}`), 'PATCH', changes), 'Cambios guardados')) setEditing(null); }}
                onArchive={() => run(() => send(api(`/${c.id}`), 'PATCH', { archived: true }), 'Canal archivado. Su link sigue contando visitas.')}
              />
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="border-t border-gray-200 px-5 sm:px-6 py-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700">Archivados · {archived.length}</summary>
            <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-2">
              {archived.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-gray-700">{c.name} <span className="text-gray-500">· ?ref={c.slug}</span></span>
                  <button type="button" className={btnSecondary} disabled={busy} onClick={() => run(() => send(api(`/${c.id}`), 'PATCH', { archived: false }), 'Canal reactivado')}>Reactivar</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {stats.unregistered.length > 0 && (
        <Card padded={false}>
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
            <CardHeader title="Links sin registrar" />
            <p className="m-0 mt-1 text-[13px] text-gray-600">
              Llegaron visitas con un <code>?ref=</code> que no es de ningún canal (por ejemplo, alguien armó el link a mano). Registralo para verlo como canal; lo que ya trajo queda asignado.
            </p>
          </div>
          <ul className="m-0 p-0 list-none">
            {stats.unregistered.map(u => (
              <li key={u.ref} className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-t border-gray-100">
                <span className="min-w-0 truncate text-sm">
                  <span className="font-medium text-gray-900">?ref={u.ref}</span>
                  <span className="ml-2 text-gray-500 tabular-nums">{fmtInt(u.visitors)} visitantes · {fmtInt(u.converters)} consultas</span>
                </span>
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => run(() => send(api(), 'POST', { name: u.ref, slug: u.ref, kind: 'campaña' }), 'Link registrado como canal')}>
                  Registrar
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ChannelRow({ channel, link, stat, editing, busy, onEdit, onCancel, onCopy, onSave, onArchive }: {
  channel: Channel;
  link: string;
  stat: { visitors: number; converters: number; rate: number | null } | undefined;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onCopy: () => void;
  onSave: (changes: { name?: string; slug?: string }) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState(channel.name);
  const [slug, setSlug] = useState(channel.slug);

  if (editing) {
    return (
      <li className="px-5 sm:px-6 py-4 border-t border-gray-100">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            const changes: { name?: string; slug?: string } = {};
            if (name.trim() !== channel.name) changes.name = name;
            if (!channel.has_traffic && channelSlug(slug) !== channel.slug) changes.slug = slug;
            if (Object.keys(changes).length) onSave(changes); else onCancel();
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-gray-900 flex-[1_1_220px]">
            Nombre
            <input className={fieldClass} value={name} onChange={e => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-gray-900 flex-[1_1_220px]">
            Link (?ref=)
            <input className={fieldClass} value={slug} onChange={e => setSlug(e.target.value)} disabled={channel.has_traffic} maxLength={60} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>Guardar</button>
            <button type="button" className={btnSecondary} onClick={onCancel}>Cancelar</button>
          </div>
        </form>
        {channel.has_traffic && (
          <p className="m-0 mt-2 text-xs text-gray-500">El link ya tuvo visitas: no se puede cambiar para no romper los que ya se repartieron.</p>
        )}
      </li>
    );
  }

  return (
    <li className="px-5 sm:px-6 py-4 border-t border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">{channel.name}</span>
          <Pill>{channel.kind === 'campaña' ? 'Campaña' : 'Inmobiliaria'}</Pill>
        </div>
        <span className="text-xs text-gray-500 break-all">{link}</span>
      </div>
      <div className="flex gap-5 text-sm tabular-nums shrink-0">
        <span><strong className="text-gray-900">{fmtInt(stat?.visitors)}</strong> <span className="text-gray-500">visitantes</span></span>
        <span><strong className="text-gray-900">{fmtInt(stat?.converters)}</strong> <span className="text-gray-500">consultas</span></span>
        <span><strong className="text-gray-900">{fmtPct(stat?.rate)}</strong> <span className="text-gray-500">conv.</span></span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button type="button" className={btnPrimary} onClick={onCopy}>Copiar link</button>
        <button type="button" className={btnSecondary} onClick={onEdit}>Editar</button>
        <button type="button" className={btnSecondary} disabled={busy} onClick={onArchive}>Archivar</button>
      </div>
    </li>
  );
}
