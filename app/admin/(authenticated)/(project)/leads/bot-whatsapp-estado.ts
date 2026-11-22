import type { WaBot } from '@/types/whatsapp-bot';

export type TabLeads = 'tablero' | 'conversaciones' | 'visitas' | 'bot';

export function parseTab(valor: string | null | undefined): TabLeads {
  return valor === 'conversaciones' || valor === 'visitas' || valor === 'bot' ? valor : 'tablero';
}

/**
 * Pestaña a mostrar según la URL y el rol: `?c=<id>` sin `?tab=` abre
 * Conversaciones en ese chat, y "Bot de WhatsApp" (configuración y QR) es de
 * administrador en adelante; por debajo cae al tablero.
 */
export function resolverTab(
  tab: string | null | undefined,
  conversacionId: string | null | undefined,
  puedeConfigurarBot: boolean,
): TabLeads {
  const t = conversacionId && !tab ? 'conversaciones' : parseTab(tab);
  return t === 'bot' && !puedeConfigurarBot ? 'tablero' : t;
}

/** Pestañas visibles: un gestor ve Tablero, Conversaciones y Visitas; el bot es de administrador en adelante. */
export function tabsVisibles(puedeConfigurarBot: boolean): TabLeads[] {
  return puedeConfigurarBot ? ['tablero', 'conversaciones', 'visitas', 'bot'] : ['tablero', 'conversaciones', 'visitas'];
}

export type PanelBot = 'sin_bot' | 'desconectado' | 'esperando_qr' | 'conectado' | 'error';

export function panelDelBot(
  bot: Pick<WaBot, 'estado' | 'host_permitido'> | null,
  puenteVivo: boolean,
): { panel: PanelBot; puenteCaido: boolean; faltaHost: boolean } {
  return {
    panel: bot ? bot.estado : 'sin_bot',
    // Solo importa si hay un bot que un servidor pueda tomar: sin bot o sin
    // host_permitido ningún puente lo atiende y el aviso confunde.
    puenteCaido: !puenteVivo && !!bot && !!bot.host_permitido,
    faltaHost: !!bot && !bot.host_permitido,
  };
}

export function totalNoLeidos(convs: { no_leidos: number }[]): number {
  return convs.reduce((s, c) => s + (c.no_leidos || 0), 0);
}

export const ESPERA_PEDIDO_MS = 60_000;

/**
 * Tras un pedido (conectar/desconectar/reiniciar) se sigue consultando hasta que el
 * estado cambie respecto del que había al pedir. Si pasa el tiempo sin cambio, se
 * da por no respondido (salvo que esté mostrando el QR: eso no es un timeout).
 */
export function resolverEspera(
  espera: { estadoAlPedir: string; desde: number },
  estado: string,
  ahora: number,
  timeoutMs: number = ESPERA_PEDIDO_MS,
): 'seguir' | 'resuelto' | 'timeout' {
  if (estado !== espera.estadoAlPedir) return 'resuelto';
  if (ahora - espera.desde < timeoutMs) return 'seguir';
  return estado === 'esperando_qr' ? 'resuelto' : 'timeout';
}

/** Vuelve a poner en pendiente los cambios que no se pudieron guardar, sin pisar ediciones más nuevas. */
export function remezclarFallidos<T extends object>(fallidos: T, pendiente: T): T {
  return { ...fallidos, ...pendiente };
}
