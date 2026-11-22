import { describe, expect, it } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { cargarFaq, esTablaFaltante, registrarPregunta, temaClave, MAX_PENDIENTES } from './preguntas';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = (results: NonNullable<Parameters<typeof mockSupabase>[0]>['results']) => mockSupabase({ results });
const como = (m: ReturnType<typeof mockSupabase>) => m as unknown as SupabaseClient;
const base = { projectId: 'p1', conversacionId: 'c1', tema: 'Escrituración', pregunta: '¿Cuándo escrituran?' };

describe('temaClave', () => {
  it('agrupa variantes del mismo tema', () => {
    expect(temaClave('  Escrituración! ')).toBe('escrituracion');
    expect(temaClave('Mascotas   permitidas?')).toBe(temaClave('mascotas permitidas'));
    expect(temaClave('¿?')).toBe('');
  });
});

describe('esTablaFaltante', () => {
  it('reconoce la tabla sin crear y nada más', () => {
    expect(esTablaFaltante({ code: '42P01' })).toBe(true);
    expect(esTablaFaltante({ code: 'PGRST205' })).toBe(true);
    expect(esTablaFaltante({ message: "Could not find the table 'public.wa_preguntas' in the schema cache" })).toBe(true);
    expect(esTablaFaltante({ code: '23505', message: 'duplicate' })).toBe(false);
    expect(esTablaFaltante(null)).toBe(false);
  });
});

describe('cargarFaq', () => {
  it('devuelve solo las que tienen respuesta', async () => {
    const m = sb([{ data: [{ pregunta: 'A', respuesta: ' Sí ' }, { pregunta: 'B', respuesta: '' }] }]);
    expect(await cargarFaq(como(m), 'p1')).toEqual([{ pregunta: 'A', respuesta: 'Sí' }]);
    const q = m.from.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('estado', 'respondida');
  });
  it('sin la tabla: lista vacía en vez de tirar; otro error tira', async () => {
    expect(await cargarFaq(como(sb([{ error: { code: '42P01', message: 'x' } }])), 'p1')).toEqual([]);
    await expect(cargarFaq(como(sb([{ error: { code: '500', message: 'boom' } }])), 'p1')).rejects.toThrow(/boom/);
  });
});

describe('registrarPregunta', () => {
  it('tema nuevo: inserta con la clave normalizada', async () => {
    const m = sb([{ data: null }, { count: 0 }, { error: null }]);
    expect(await registrarPregunta(como(m), base)).toBe('nueva');
    const ins = m.from.mock.results[2].value;
    expect(ins.insert).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'p1', tema: 'Escrituración', tema_clave: 'escrituracion', conversacion_id: 'c1' }),
    );
  });
  it('tema repetido: suma una vez y guarda la última pregunta', async () => {
    const m = sb([{ data: { id: 'q1', veces: 2 } }, { error: null }]);
    const ahora = () => new Date('2026-11-20T10:00:00.000Z');
    expect(await registrarPregunta(como(m), base, ahora)).toBe('repetida');
    const up = m.from.mock.results[1].value;
    expect(up.update).toHaveBeenCalledWith({ veces: 3, pregunta: '¿Cuándo escrituran?', ultima_at: '2026-11-20T10:00:00.000Z', conversacion_id: 'c1' });
  });
  it('carrera: si el insert choca con el índice único, suma a la existente', async () => {
    const m = sb([{ data: null }, { count: 0 }, { error: { code: '23505', message: 'dup' } }, { data: { id: 'q1', veces: 1 } }, { error: null }]);
    expect(await registrarPregunta(como(m), base)).toBe('repetida');
  });
  it('tope de pendientes, tema vacío o tabla sin crear: omitida sin tirar', async () => {
    expect(await registrarPregunta(como(sb([{ data: null }, { count: MAX_PENDIENTES }])), base)).toBe('omitida');
    expect(await registrarPregunta(como(sb([])), { ...base, tema: '¿?' })).toBe('omitida');
    expect(await registrarPregunta(como(sb([{ error: { code: '42P01', message: 'x' } }])), base)).toBe('omitida');
  });
});
