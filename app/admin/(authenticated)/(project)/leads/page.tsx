'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectRole } from '@/lib/project-role-context';
import { hasRole } from '@/lib/project-roles';
import { PageHeader } from '@/components/admin/panel-ui';
import TableroLeads from './TableroLeads';
import Conversaciones from './Conversaciones';
import BotWhatsapp from './BotWhatsapp';
import Visitas from './Visitas';
import { resolverTab, tabsVisibles, type TabLeads } from './bot-whatsapp-estado';
import type { WaVisita } from '@/types/whatsapp-bot';
import { Contador, PuntoVivo } from './leads-ui';

const TAB_LABEL: Record<TabLeads, string> = {
  tablero: 'Tablero',
  conversaciones: 'Conversaciones',
  visitas: 'Visitas',
  bot: 'Bot de WhatsApp',
};

const POLL_NO_LEIDOS_MS = 15_000;

type Resumen = { leads: number | null; visitas: number | null; bot: { activo: boolean; conectado: boolean; numero: string | null } | null };

function LeadsConPestanas() {
  const router = useRouter();
  const params = useSearchParams();
  const activeProjectId = useActiveProjectId();
  // Leads y conversaciones: gestor en adelante (igual que el tablero de main).
  // Configurar el bot y vincular el número: administrador en adelante.
  const role = useProjectRole();
  const canSeeLeads = hasRole(role, 'gestor');
  const puedeConfigurarBot = hasRole(role, 'administrador');
  const conversacionId = params.get('c');
  const tab = resolverTab(params.get('tab'), conversacionId, puedeConfigurarBot);
  const [noLeidos, setNoLeidos] = useState(0);
  const [resumen, setResumen] = useState<Resumen>({ leads: null, visitas: null, bot: null });

  // Misma guarda que el tablero: por debajo de gestor, al inicio del panel.
  useEffect(() => {
    if (!canSeeLeads) router.replace('/admin');
  }, [canSeeLeads, router]);

  useEffect(() => {
    if (!canSeeLeads) return;
    let vivo = true;
    // Solo la suma (?resumen=1), y nada con la pestaña en segundo plano: al
    // volver se pone al día sin esperar el próximo ciclo.
    const url = withActiveProject('/api/admin/whatsapp-bot/conversaciones', activeProjectId);
    const cargar = () => {
      if (document.hidden) return;
      fetch(`${url}${url.includes('?') ? '&' : '?'}resumen=1`)
        .then(r => (r.ok ? r.json() : null))
        .then((data: { noLeidos?: number } | null) => {
          if (vivo && typeof data?.noLeidos === 'number') setNoLeidos(data.noLeidos);
        })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, POLL_NO_LEIDOS_MS);
    const alVolver = () => { if (!document.hidden) cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [activeProjectId, canSeeLeads]);

  // Conteos de las pestañas y el estado del bot (arriba a la derecha). Se
  // refrescan al cambiar de pestaña, que es cuando pueden haber cambiado.
  useEffect(() => {
    if (!canSeeLeads) return;
    let vivo = true;
    const json = (url: string) => fetch(withActiveProject(url, activeProjectId)).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const conConteo = (url: string) => `${url}${url.includes('?') ? '&' : '?'}count=1`;
    Promise.all([
      // Solo el número (count=1 sin since = todos): la lista la baja el tablero.
      fetch(conConteo(withActiveProject('/api/admin/leads', activeProjectId))).then(r => (r.ok ? r.json() : null)).catch(() => null),
      json('/api/admin/whatsapp-bot/visitas'),
      puedeConfigurarBot ? json('/api/admin/whatsapp-bot') : Promise.resolve(null),
    ]).then(([leads, visitas, bot]) => {
      if (!vivo) return;
      const lista: WaVisita[] = Array.isArray(visitas?.visitas) ? visitas.visitas : [];
      const ahora = Date.now();
      const b = bot?.bot as { activo?: boolean; estado?: string; numero?: string | null } | null | undefined;
      setResumen({
        leads: typeof leads?.count === 'number' ? leads.count : null,
        visitas: Array.isArray(visitas?.visitas) ? lista.filter(v => v.estado !== 'cancelada' && new Date(v.fin).getTime() >= ahora).length : null,
        bot: b ? { activo: !!b.activo, conectado: b.estado === 'conectado', numero: b.numero ?? null } : null,
      });
    });
    return () => {
      vivo = false;
    };
  }, [activeProjectId, canSeeLeads, puedeConfigurarBot, tab]);

  const irA = (t: TabLeads) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    if (t !== 'conversaciones') next.delete('c');
    next.delete('lead');
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (!canSeeLeads) return null;

  // Conversaciones ocupa el alto de la pantalla (lista + chat con scroll
  // propio); Tablero y Bot fluyen como el resto del panel, con ese alto como
  // mínimo.
  const alto = tab === 'conversaciones' ? 'h-[calc(100vh-8rem)]' : 'min-h-[calc(100vh-8rem)]';
  const bot = resumen.bot;

  return (
    <div className={`${alto} flex flex-col gap-6 sm:gap-7`}>
      {/* Un solo encabezado, fijo para todas las pestañas, con el estado del bot a la derecha. */}
      <div className="shrink-0">
        <PageHeader
          eyebrow="Operación"
          title="Leads"
          actions={bot && (
            <button
              type="button"
              onClick={() => irA('bot')}
              className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-full border border-gray-300 bg-white text-sm text-gray-900 hover:border-gray-400"
            >
              {bot.activo && bot.conectado ? <PuntoVivo /> : <span aria-hidden="true" className="w-2 h-2 rounded-full bg-gray-400" />}
              {bot.conectado ? (bot.activo ? 'Bot activo' : 'Bot pausado') : 'Bot sin vincular'}
              {bot.conectado && bot.numero && <span className="text-gray-500 tabular-nums">· {bot.numero}</span>}
            </button>
          )}
        />
      </div>

      {/* Pestañas subrayadas del diseño, con sus conteos. */}
      <div
        role="tablist"
        aria-label="Leads"
        className="flex flex-nowrap gap-6 sm:gap-7 overflow-x-auto border-b border-gray-200 shrink-0 [scrollbar-width:none]"
      >
        {tabsVisibles(puedeConfigurarBot).map(id => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => irA(id)}
              className={`-mb-px pb-3 pt-1 px-0.5 flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] border-b-2 transition-colors ${
                on ? 'border-gray-900 font-semibold text-gray-900' : 'border-transparent font-medium text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>{TAB_LABEL[id]}</span>
              {id === 'tablero' && !!resumen.leads && <Contador>{resumen.leads}</Contador>}
              {id === 'conversaciones' && noLeidos > 0 && (
                <Contador tono="brand" label={`${noLeidos} sin leer`}>{noLeidos} sin leer</Contador>
              )}
              {id === 'visitas' && !!resumen.visitas && <Contador label={`${resumen.visitas} próximas`}>{resumen.visitas}</Contador>}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'tablero' && <TableroLeads />}
        {tab === 'conversaciones' && <Conversaciones conversacionId={conversacionId} />}
        {tab === 'visitas' && <Visitas />}
        {tab === 'bot' && <BotWhatsapp />}
      </div>
    </div>
  );
}

export default function AdminLeads() {
  return (
    <Suspense fallback={null}>
      <LeadsConPestanas />
    </Suspense>
  );
}
