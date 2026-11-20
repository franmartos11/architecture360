import { describe, it, expect } from 'vitest';
import { panelDelBot, parseTab, resolverTab, tabsVisibles, totalNoLeidos, resolverEspera, remezclarFallidos } from './bot-whatsapp-estado';

const base = { estado: 'desconectado', host_permitido: 'notebook' } as const;

describe('parseTab', () => {
  it('acepta los tres valores', () => {
    expect(parseTab('tablero')).toBe('tablero');
    expect(parseTab('conversaciones')).toBe('conversaciones');
    expect(parseTab('bot')).toBe('bot');
  });
  it('default y desconocidos van a tablero', () => {
    expect(parseTab(null)).toBe('tablero');
    expect(parseTab(undefined)).toBe('tablero');
    expect(parseTab('otra')).toBe('tablero');
  });
});

describe('resolverTab', () => {
  it('?c sin ?tab abre Conversaciones', () => {
    expect(resolverTab(null, 'conv1', false)).toBe('conversaciones');
    expect(resolverTab('tablero', 'conv1', true)).toBe('tablero');
  });
  it('el bot es de administrador en adelante: por debajo cae al tablero', () => {
    expect(resolverTab('bot', null, true)).toBe('bot');
    expect(resolverTab('bot', null, false)).toBe('tablero');
    expect(resolverTab('conversaciones', null, false)).toBe('conversaciones');
  });
});

describe('tabsVisibles', () => {
  it('gestor: Tablero y Conversaciones; administrador o dueño: también el bot', () => {
    expect(tabsVisibles(false)).toEqual(['tablero', 'conversaciones']);
    expect(tabsVisibles(true)).toEqual(['tablero', 'conversaciones', 'bot']);
  });
});

describe('panelDelBot', () => {
  it('sin bot', () => {
    expect(panelDelBot(null, true)).toEqual({ panel: 'sin_bot', puenteCaido: false, faltaHost: false });
  });
  it('mapea el estado', () => {
    expect(panelDelBot({ ...base, estado: 'conectado' }, true).panel).toBe('conectado');
    expect(panelDelBot({ ...base, estado: 'esperando_qr' }, true).panel).toBe('esperando_qr');
    expect(panelDelBot({ ...base, estado: 'error' }, true).panel).toBe('error');
    expect(panelDelBot(base, true).panel).toBe('desconectado');
  });
  it('puente caído: solo si el bot existe y tiene host_permitido', () => {
    expect(panelDelBot(base, false).puenteCaido).toBe(true);
    expect(panelDelBot(base, true).puenteCaido).toBe(false);
    expect(panelDelBot(null, false).puenteCaido).toBe(false);
    expect(panelDelBot({ ...base, host_permitido: null }, false).puenteCaido).toBe(false);
  });
  it('falta host_permitido solo si el bot existe', () => {
    expect(panelDelBot({ ...base, host_permitido: null }, true).faltaHost).toBe(true);
    expect(panelDelBot({ ...base, host_permitido: '' }, true).faltaHost).toBe(true);
    expect(panelDelBot(null, true).faltaHost).toBe(false);
  });
});

describe('totalNoLeidos', () => {
  it('suma', () => {
    expect(totalNoLeidos([{ no_leidos: 2 }, { no_leidos: 1 }])).toBe(3);
    expect(totalNoLeidos([])).toBe(0);
  });
});

describe('resolverEspera', () => {
  const e = { estadoAlPedir: 'error', desde: 1000 };
  it('sigue mientras el estado no cambie y no venza', () => {
    expect(resolverEspera(e, 'error', 2000, 60000)).toBe('seguir');
  });
  it('se resuelve cuando el estado cambia', () => {
    expect(resolverEspera(e, 'esperando_qr', 2000)).toBe('resuelto');
    expect(resolverEspera({ estadoAlPedir: 'conectado', desde: 0 }, 'desconectado', 5)).toBe('resuelto');
  });
  it('timeout a los 60 s sin cambio', () => {
    expect(resolverEspera(e, 'error', 61000)).toBe('timeout');
  });
  it('mostrando el QR no es timeout', () => {
    expect(resolverEspera({ estadoAlPedir: 'esperando_qr', desde: 0 }, 'esperando_qr', 99999)).toBe('resuelto');
  });
});

describe('remezclarFallidos', () => {
  it('no pisa una edición más nueva de la misma clave', () => {
    expect(remezclarFallidos({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
});
