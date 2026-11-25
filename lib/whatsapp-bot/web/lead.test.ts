import { describe, it, expect } from 'vitest';
import { buscarLeadWeb, planearLeadWeb, type DatosAvisoWeb } from './lead';
import type { CalificacionLead, Lead } from '@/types';

const ahora = new Date('2026-11-20T15:00:00Z');

function lead(p: Partial<Lead>): Lead {
  return {
    id: 'l1', project_id: 'p1', unit_id: null, unit_name: null, name: null, email: null,
    phone: null, method: null, message: null, source: null, status: 'nuevo',
    wa_conversacion_id: null, created_at: '2026-01-01T00:00:00Z', ...p,
  };
}

const calif = (p: Partial<CalificacionLead>): CalificacionLead => ({
  temperatura: 'tibio', presupuesto: null, ambientes: null, plazo: null, proposito: null, financiacion: null,
  actualizada_at: '2026-11-20T15:00:00.000Z', ...p,
});

const datos: DatosAvisoWeb = {
  telefono: '+54 9 11 2233-4455', email: 'Ana@Mail.com', nombre: 'Ana', unidades: ['4B', '5A'],
  resumen: 'Quiere visitar el sábado', conversacionId: 'c-web', visitorId: 'v1', ref: 'perez-prop',
};

describe('buscarLeadWeb', () => {
  it('coincide por teléfono normalizado', () => {
    const l = lead({ id: 'a', phone: '5491122334455' });
    expect(buscarLeadWeb([l], '+54 9 11 2233-4455', null)?.id).toBe('a');
  });

  it('sin teléfono, coincide por email sin mayúsculas ni espacios', () => {
    const l = lead({ id: 'a', email: 'ana@mail.com' });
    expect(buscarLeadWeb([l], null, '  Ana@Mail.COM ')?.id).toBe('a');
  });

  it('con los dos, manda el teléfono', () => {
    const porMail = lead({ id: 'mail', email: 'ana@mail.com', created_at: '2026-06-01T00:00:00Z' });
    const porTel = lead({ id: 'tel', phone: '5491122334455', created_at: '2026-01-01T00:00:00Z' });
    expect(buscarLeadWeb([porMail, porTel], '1122334455', 'ana@mail.com')?.id).toBe('tel');
  });

  it('si el teléfono no aparece, prueba con el email', () => {
    const l = lead({ id: 'a', email: 'ana@mail.com', phone: '5491199998888' });
    expect(buscarLeadWeb([l], '1122334455', 'ana@mail.com')?.id).toBe('a');
  });

  it('entre varios, el más reciente', () => {
    const viejo = lead({ id: 'viejo', email: 'ana@mail.com', created_at: '2026-01-01T00:00:00Z' });
    const nuevo = lead({ id: 'nuevo', email: 'ana@mail.com', created_at: '2026-05-01T00:00:00Z' });
    expect(buscarLeadWeb([viejo, nuevo], null, 'ana@mail.com')?.id).toBe('nuevo');
  });

  it('sin coincidencia, null', () => {
    expect(buscarLeadWeb([lead({ phone: '5491199998888' })], '1122334455', 'x@y.com')).toBeNull();
    expect(buscarLeadWeb([lead({})], null, null)).toBeNull();
  });
});

describe('planearLeadWeb', () => {
  it('sin lead previo: inserta con origen chat web y la atribución del sitio', () => {
    const c = calif({ temperatura: 'caliente' });
    const r = planearLeadWeb(null, { ...datos, calificacion: c }, ahora);
    expect(r).toEqual({
      tipo: 'insert',
      fila: {
        status: 'nuevo', source: 'chat_web', method: 'chat', phone: '5491122334455', name: 'Ana',
        email: 'Ana@Mail.com', unit_name: '4B, 5A', message: 'Quiere visitar el sábado',
        wa_conversacion_id: 'c-web', visitor_id: 'v1', ref: 'perez-prop', calificacion: c,
      },
    });
  });

  it('con un lead previo completa solo lo vacío', () => {
    const ex = lead({ id: 'x', name: 'Ana María', phone: null, email: null, unit_name: '7C' });
    const r = planearLeadWeb(ex, datos, ahora);
    if (r.tipo !== 'update') throw new Error('update esperado');
    expect(r.id).toBe('x');
    expect(r.cambios.name).toBeUndefined();
    expect(r.cambios.unit_name).toBeUndefined();
    expect(r.cambios.phone).toBe('5491122334455');
    expect(r.cambios.email).toBe('Ana@Mail.com');
    expect(r.cambios.visitor_id).toBe('v1');
  });

  it('un lead que ya existía no queda a nombre de la inmobiliaria del chat: solo se anota', () => {
    const r = planearLeadWeb(lead({ ref: null, message: null }), datos, ahora);
    if (r.tipo !== 'update') throw new Error('update esperado');
    expect('ref' in r.cambios).toBe(false);
    expect(r.cambios.message).toBe('[Chat web 20/11/2026] Quiere visitar el sábado (llegó por el link de perez-prop)');
  });

  it('nunca pisa el origen, la inmobiliaria ni la charla de WhatsApp de un lead existente', () => {
    const ex = lead({ source: 'whatsapp_bot', ref: 'perez', wa_conversacion_id: 'c-wa', visitor_id: 'v0' });
    const r = planearLeadWeb(ex, datos, ahora);
    if (r.tipo !== 'update') throw new Error('update esperado');
    expect('source' in r.cambios).toBe(false);
    expect('ref' in r.cambios).toBe(false);
    expect('wa_conversacion_id' in r.cambios).toBe(false);
    expect('visitor_id' in r.cambios).toBe(false);
  });

  it('completa la charla si el lead no tenía', () => {
    const r = planearLeadWeb(lead({ wa_conversacion_id: null }), datos, ahora);
    if (r.tipo !== 'update') throw new Error('update esperado');
    expect(r.cambios.wa_conversacion_id).toBe('c-web');
  });

  it('suma una nota fechada al mensaje', () => {
    const sinRef = { ...datos, ref: null };
    const r1 = planearLeadWeb(lead({ message: 'Hola' }), sinRef, ahora);
    const r2 = planearLeadWeb(lead({ message: null }), sinRef, ahora);
    if (r1.tipo !== 'update' || r2.tipo !== 'update') throw new Error('update esperado');
    expect(r1.cambios.message).toBe('Hola\n\n[Chat web 20/11/2026] Quiere visitar el sábado');
    expect(r2.cambios.message).toBe('[Chat web 20/11/2026] Quiere visitar el sábado');
  });

  it('mezcla la calificación con la que había', () => {
    const previa = calif({ temperatura: 'frio', presupuesto: 'USD 100.000' });
    const nueva = calif({ temperatura: 'caliente', plazo: '3 meses' });
    const r = planearLeadWeb(lead({ calificacion: previa }), { ...datos, calificacion: nueva }, ahora);
    if (r.tipo !== 'update') throw new Error('update esperado');
    expect(r.cambios.calificacion).toMatchObject({ temperatura: 'caliente', presupuesto: 'USD 100.000', plazo: '3 meses' });
  });

  it('un email sin teléfono alcanza', () => {
    const r = planearLeadWeb(null, { ...datos, telefono: null }, ahora);
    if (r.tipo !== 'insert') throw new Error('insert esperado');
    expect(r.fila.phone).toBeNull();
    expect(r.fila.email).toBe('Ana@Mail.com');
  });
});
