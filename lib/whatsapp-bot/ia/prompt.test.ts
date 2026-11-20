import { describe, expect, it } from 'vitest';
import { armarSystem } from './prompt';

describe('armarSystem', () => {
  it('un bloque cacheado con reglas y ficha, presentándose con el nombre del bot', () => {
    const s = armarSystem('# Proyecto: Torre Alba\nFICHA', { nombre_bot: 'Sofía', criterio_aviso: null }, 'Torre Alba');
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe('text');
    expect(s[0].cache_control).toEqual({ type: 'ephemeral' });
    const t = s[0].text;
    expect(t).toContain('Torre Alba');
    expect(t).toContain('Sofía');
    expect(t).toContain('asistente virtual');
    expect(t).toContain('avisar_vendedor');
    expect(t).toContain('lo consulto con el equipo');
    // La ficha va al final.
    expect(t.trimEnd().endsWith('# Proyecto: Torre Alba\nFICHA')).toBe(true);
  });

  it('las condiciones de financiación salen solo del conocimiento del vendedor, no del simulador', () => {
    const t = armarSystem('F', { nombre_bot: null, criterio_aviso: null }, 'Torre Alba')[0].text;
    expect(t).toContain('solo podés mencionar las condiciones que figuren en "Información adicional del vendedor"');
    expect(t).toContain('Simulador de cuotas de referencia');
    expect(t).toContain('nunca lo presentes como financiación disponible');
  });

  it('sin nombre se presenta como asistente virtual del proyecto', () => {
    const t = armarSystem('F', { nombre_bot: '  ', criterio_aviso: null }, 'Torre Alba')[0].text;
    expect(t).toContain('el asistente virtual de Torre Alba');
    expect(t).not.toContain('te presentás como');
  });

  it('incluye el criterio de aviso del proyecto cuando existe', () => {
    const con = armarSystem('F', { nombre_bot: null, criterio_aviso: 'Avisar si pregunta por cocheras' }, 'P')[0].text;
    const sin = armarSystem('F', { nombre_bot: null, criterio_aviso: null }, 'P')[0].text;
    expect(con).toContain('Avisar si pregunta por cocheras');
    expect(sin).not.toContain('Criterio del equipo');
  });

  it('es determinístico', () => {
    const a = armarSystem('F', { nombre_bot: 'Sofía', criterio_aviso: 'c' }, 'P');
    const b = armarSystem('F', { nombre_bot: 'Sofía', criterio_aviso: 'c' }, 'P');
    expect(a).toEqual(b);
  });
});
