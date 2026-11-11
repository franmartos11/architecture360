'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, btnSecondary } from '@/components/admin/panel-ui';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';

// Dominio propio del proyecto (www.tuproyecto.com). El alta y la verificación
// las hace el servidor contra Vercel (app/api/admin/projects/[id]/domains): acá
// solo se muestra qué DNS tiene que cargar el dueño en su proveedor y en qué
// estado está cada dominio.

interface VerificationRecord { type: string; domain: string; value: string; reason?: string }
interface DomainRow {
  id: string;
  hostname: string;
  status: 'pending' | 'verified' | 'active';
  vercel_verification: { records?: VerificationRecord[]; misconfigured?: boolean } | null;
}

const STATUS: Record<DomainRow['status'], { label: string; tone: 'green' | 'warn' | 'neutral' }> = {
  active: { label: 'Activo', tone: 'green' },
  verified: { label: 'Falta apuntar el DNS', tone: 'warn' },
  pending: { label: 'Pendiente de verificación', tone: 'neutral' },
};

export default function CustomDomainsSection({ projectId }: { projectId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const base = `/api/admin/projects/${projectId}/domains`;
  const [domains, setDomains] = useState<DomainRow[] | null>(null);
  const [automatic, setAutomatic] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'add' | id del dominio que se está verificando/quitando

  const [reloadKey, setReloadKey] = useState(0);
  // Además de recargar la lista, se refresca el layout del panel: el dominio activo vive
  // ahí (contexto del servidor) y de él salen los links de "Ver sitio" y "Copiar".
  const load = () => {
    setReloadKey(k => k + 1);
    router.refresh();
  };

  useEffect(() => {
    let cancelled = false;
    fetch(base)
      .then(res => (res.ok ? res.json() : { domains: [] }))
      .then(data => {
        if (cancelled) return;
        setDomains(data.domains ?? []);
        setAutomatic(data.automatic !== false);
      })
      .catch(() => { if (!cancelled) setDomains([]); });
    return () => { cancelled = true; };
  }, [base, reloadKey]);

  const errorOf = async (res: Response, fallback: string) => ((await res.json().catch(() => ({}))).error as string | undefined) ?? fallback;

  const add = async () => {
    setBusy('add');
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname: input }) });
    setBusy(null);
    if (!res.ok) { toast(await errorOf(res, 'No se pudo agregar el dominio.'), 'error'); return; }
    setInput('');
    toast('Dominio agregado. Cargá el DNS que ves abajo y después tocá "Verificar".');
    load();
  };

  const verify = async (d: DomainRow) => {
    setBusy(d.id);
    const res = await fetch(`${base}/${d.id}`, { method: 'POST' });
    setBusy(null);
    if (!res.ok) { toast(await errorOf(res, 'No se pudo verificar.'), 'error'); return; }
    const { status } = await res.json();
    if (status === 'active') toast(`${d.hostname} ya está activo.`);
    else if (status === 'verified') toast('El dominio es tuyo, pero el DNS todavía no apunta acá. Puede tardar unos minutos en propagarse.', 'error');
    else toast('Todavía no se puede verificar. Revisá los registros DNS y probá de nuevo en unos minutos.', 'error');
    load();
  };

  const remove = async (d: DomainRow) => {
    const ok = await confirm({
      title: 'Quitar dominio',
      message: `${d.hostname} va a dejar de mostrar este proyecto. El link de la plataforma sigue funcionando.`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    setBusy(d.id);
    const res = await fetch(`${base}/${d.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) { toast(await errorOf(res, 'No se pudo quitar el dominio.'), 'error'); return; }
    load();
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="px-5 sm:px-6 py-5 border-b border-gray-200">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Dominio propio</h2>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-gray-600">
          Mostrá este proyecto en tu propia dirección, por ejemplo <span className="font-mono">www.tuproyecto.com</span>. Cuando esté activo, el link de la plataforma redirige a ese dominio.
        </p>
      </div>

      <div className="px-5 sm:px-6 py-5 flex flex-col gap-5">
        {!automatic && (
          <p className="m-0 text-[13px] text-amber-800">El alta automática todavía no está habilitada en este servidor. Escribinos y lo dejamos configurado.</p>
        )}

        {domains?.map(d => {
          const records = d.vercel_verification?.records ?? [];
          const s = STATUS[d.status];
          return (
            <div key={d.id} className="rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[13px] text-gray-900 break-all">{d.hostname}</span>
                <Pill tone={s.tone}>{s.label}</Pill>
                <span className="flex-1" />
                {d.status !== 'active' && (
                  <button type="button" onClick={() => verify(d)} disabled={busy === d.id} className={btnSecondary}>
                    {busy === d.id ? 'Verificando…' : 'Verificar'}
                  </button>
                )}
                <button type="button" onClick={() => remove(d)} disabled={busy === d.id}
                  className="min-h-[44px] px-3 rounded-[10px] text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Quitar</button>
              </div>

              {d.status !== 'active' && (
                <div className="text-[13px] leading-relaxed text-gray-700 flex flex-col gap-2">
                  <p className="m-0">Cargá estos registros en el proveedor donde compraste el dominio (GoDaddy, Namecheap, Cloudflare, Nic.ar…):</p>
                  <ul className="m-0 pl-5 list-disc flex flex-col gap-1">
                    <li>Si es una dirección con subdominio (<span className="font-mono">www.…</span>): tipo <b>CNAME</b>, nombre <span className="font-mono">{d.hostname.split('.')[0]}</span>, valor <span className="font-mono">cname.vercel-dns.com</span></li>
                    <li>Si es el dominio sin <span className="font-mono">www</span>: tipo <b>A</b>, nombre <span className="font-mono">@</span>, valor <span className="font-mono">76.76.21.21</span></li>
                    {records.map(r => (
                      <li key={`${r.domain}-${r.value}`}>Para confirmar que el dominio es tuyo: tipo <b>{r.type}</b>, nombre <span className="font-mono break-all">{r.domain}</span>, valor <span className="font-mono break-all">{r.value}</span></li>
                    ))}
                  </ul>
                  <p className="m-0 text-gray-500">Los cambios de DNS pueden tardar desde unos minutos hasta unas horas en propagarse.</p>
                </div>
              )}
            </div>
          );
        })}

        {automatic && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="custom-domain" className="text-xs font-medium text-gray-700">Agregar dominio</label>
            <div className="flex gap-2 flex-wrap">
              <input id="custom-domain" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && input.trim() && !busy) void add(); }}
                placeholder="www.tuproyecto.com" spellCheck={false} autoComplete="off" inputMode="url"
                className="flex-1 min-w-[220px] min-h-[46px] px-3.5 rounded-[10px] border border-gray-300 bg-white font-mono text-[13px] text-gray-900 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30" />
              <button type="button" onClick={add} disabled={!input.trim() || busy === 'add'} className={btnSecondary}>
                {busy === 'add' ? 'Agregando…' : 'Agregar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
