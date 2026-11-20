import { describe, it, expect } from 'vitest';
import { buscarLeadPorTelefono, planearLead, telefonoDeContacto, textoAviso } from './aviso';
import type { Lead } from '@/types';

const ahora = new Date('2026-11-20T15:00:00Z');

function lead(p: Partial<Lead>): Lead {
  return {
    id: 'l1', project_id: 'p1', unit_id: null, unit_name: null, name: null, email: null,
    phone: null, method: null, message: null, source: null, status: 'nuevo',
    wa_conversacion_id: null, created_at: '2026-01-01T00:00:00Z', ...p,
  };
}

const datos = {
  telefono: '5491155551234@c.us', nombre: 'Juan Pérez', email: 'j@x.com',
  unidades: ['4B', '5A'], resumen: 'Quiere visitar', conversacionId: 'c1',
};

describe('planearLead', () => {
  it('inserta si no hay existente', () => {
    const r = planearLead(null, datos, ahora);
    expect(r).toEqual({
      tipo: 'insert',
      fila: {
        status: 'nuevo', source: 'whatsapp_bot', method: 'whatsapp',
        phone: '5491155551234', name: 'Juan Pérez', email: 'j@x.com',
        unit_name: '4B, 5A', message: 'Quiere visitar', wa_conversacion_id: 'c1',
      },
    });
  });
  it('insert sin unidades -> unit_name null', () => {
    const r = planearLead(null, { ...datos, unidades: [] }, ahora);
    expect(r.tipo === 'insert' && r.fila.unit_name).toBeNull();
  });
  it('update no destructivo', () => {
    const ex = lead({ phone: '+54 9 11 5555-1234', status: 'negociacion', name: 'Juan', message: 'Hola web' });
    expect(buscarLeadPorTelefono([ex], datos.telefono)).toBe(ex);
    const r = planearLead(ex, datos, ahora);
    expect(r).toEqual({
      tipo: 'update', id: 'l1',
      cambios: {
        email: 'j@x.com', unit_name: '4B, 5A',
        message: 'Hola web\n\n[WhatsApp 20/11/2026] Quiere visitar',
        wa_conversacion_id: 'c1',
      },
    });
    if (r.tipo === 'update') {
      for (const k of ['status', 'name', 'source', 'method', 'project_id', 'phone']) expect(r.cambios).not.toHaveProperty(k);
    }
  });
  it('message vacío -> sin saltos iniciales', () => {
    const r = planearLead(lead({ message: null, phone: '5491155551234', name: 'J', email: 'a@b.c', unit_name: '4B, 5A', wa_conversacion_id: 'c1' }), datos, ahora);
    expect(r).toEqual({ tipo: 'update', id: 'l1', cambios: { message: '[WhatsApp 20/11/2026] Quiere visitar' } });
  });
  it('completa name y phone vacíos', () => {
    const r = planearLead(lead({ message: 'x' }), datos, ahora);
    expect(r.tipo === 'update' && r.cambios).toMatchObject({ name: 'Juan Pérez', phone: '5491155551234' });
  });
});

describe('buscarLeadPorTelefono', () => {
  it('el más reciente, ignora no normalizables', () => {
    const a = lead({ id: 'a', phone: '011 15 5555-1234', created_at: '2026-02-01T00:00:00Z' });
    const b = lead({ id: 'b', phone: '+5491155551234', created_at: '2026-03-01T00:00:00Z' });
    const c = lead({ id: 'c', phone: 'basura', created_at: '2026-04-01T00:00:00Z' });
    expect(buscarLeadPorTelefono([a, b, c], '5491155551234')?.id).toBe('b');
    expect(buscarLeadPorTelefono([c], '5491155551234')).toBeNull();
  });
});

describe('textoAviso', () => {
  it('sin nombre', () => {
    const t = textoAviso({ proyecto: 'Torre X', telefono: '5491155551234', unidadesTexto: [], resumen: 'Resumen', urlChat: 'https://a.com/admin/leads?c=c1' });
    expect(t).toContain('Sin nombre');
    expect(t).toContain('wa.me/5491155551234');
    expect(t).toContain('https://a.com/admin/leads?c=c1');
    expect(t).not.toContain('Le interesa');
    expect(t).not.toContain('\n\n');
  });
  it('contacto @lid sin teléfono: "número oculto" y sin línea wa.me', () => {
    const t = textoAviso({ proyecto: 'Torre X', nombre: 'Ana', telefono: null, unidadesTexto: [], resumen: 'R', urlChat: 'U' });
    expect(t).toBe('🔥 Cliente interesado – Torre X\nAna · número oculto\nR\nVer chat: U');
    expect(t).not.toContain('wa.me');
  });
  it('formato completo', () => {
    const t = textoAviso({ proyecto: 'Torre X', nombre: 'Ana', telefono: '5491155551234', unidadesTexto: ['4B 2 amb', '5A 3 amb'], resumen: 'R', urlChat: 'U' });
    expect(t).toBe('🔥 Cliente interesado – Torre X\nAna · 5491155551234\nLe interesa: 4B 2 amb; 5A 3 amb\nR\nEscribile: wa.me/5491155551234\nVer chat: U');
  });
});

describe('telefonoDeContacto', () => {
  it('normaliza teléfonos y wids con número', () => {
    expect(telefonoDeContacto('5491155551234')).toBe('5491155551234');
    expect(telefonoDeContacto('5491155551234@c.us')).toBe('5491155551234');
  });
  it('un @lid (u otro wid sin número) no tiene teléfono', () => {
    expect(telefonoDeContacto('123456789012345@lid')).toBeNull();
  });
  it('un número que no se puede normalizar queda en dígitos', () => {
    expect(telefonoDeContacto('+1 (234) 567')).toBe('1234567');
  });
});
