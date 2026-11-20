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
import { resolverTab, tabsVisibles, totalNoLeidos, type TabLeads } from './bot-whatsapp-estado';
import type { WaConversacion } from '@/types/whatsapp-bot';

const TAB_LABEL: Record<TabLeads, string> = {
  tablero: 'Tablero',
  conversaciones: 'Conversaciones',
  bot: 'Bot de WhatsApp',
};

const POLL_NO_LEIDOS_MS = 15_000;

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

  // Misma guarda que el tablero: por debajo de gestor, al inicio del panel.
  useEffect(() => {
    if (!canSeeLeads) router.replace('/admin');
  }, [canSeeLeads, router]);

  useEffect(() => {
    if (!canSeeLeads) return;
    let vivo = true;
    const cargar = () => {
      fetch(withActiveProject('/api/admin/whatsapp-bot/conversaciones', activeProjectId))
        .then(r => (r.ok ? r.json() : null))
        .then((data: WaConversacion[] | null) => {
          if (vivo && Array.isArray(data)) setNoLeidos(totalNoLeidos(data));
        })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, POLL_NO_LEIDOS_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [activeProjectId, canSeeLeads]);

  const irA = (t: TabLeads) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    if (t !== 'conversaciones') next.delete('c');
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  if (!canSeeLeads) return null;

  // Conversaciones ocupa el alto de la pantalla (lista + chat con scroll
  // propio); Tablero y Bot fluyen como el resto del panel, con ese alto como
  // mínimo.
  const alto = tab === 'conversaciones' ? 'h-[calc(100vh-8rem)]' : 'min-h-[calc(100vh-8rem)]';

  return (
    <div className={`${alto} flex flex-col gap-6`}>
      {/* Un solo encabezado, fijo para las tres pestañas (el de main, que antes
          vivía dentro del tablero). */}
      <div className="shrink-0">
        <PageHeader eyebrow="Operación" title="Leads" />
      </div>

      {/* Mismo segmented que las pestañas de un capítulo de la Ficha (ChapterTabs). */}
      <div
        role="tablist"
        aria-label="Leads"
        className="self-start max-w-full inline-flex flex-wrap p-[3px] rounded-[10px] bg-[#EAE7E0] shrink-0"
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
              className={`min-h-[38px] px-3.5 flex items-center gap-2 rounded-lg text-[13px] transition-colors ${
                on ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {TAB_LABEL[id]}
              {id === 'conversaciones' && noLeidos > 0 && (
                <span
                  className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-700 text-white text-[11px] font-semibold flex items-center justify-center"
                  aria-label={`${noLeidos} sin leer`}
                >
                  {noLeidos}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'tablero' && <TableroLeads />}
        {tab === 'conversaciones' && <Conversaciones conversacionId={conversacionId} />}
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
