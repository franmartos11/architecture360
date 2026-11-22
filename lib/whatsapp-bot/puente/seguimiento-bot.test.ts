import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRow } from '@/types/database';
import type { DatosProyecto } from '../ficha';
import type { ResultadoTurno } from '../ia/turno';
import { botPrueba, convPrueba, mensajePrueba, salidaPrueba } from './prueba-fixtures';
import { correrSeguimiento, type DepsSeguimiento } from './seguimiento-bot';

const AHORA = new Date('2026-11-20T18:00:00.000Z');
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();
const charla = [
  mensajePrueba({ id: 'a', autor: 'cliente', cuerpo: 'Hola, ¿tienen 2 ambientes?', enviado_at: hace(82) }),
  mensajePrueba({ id: 'b', autor: 'bot', cuerpo: 'Sí', enviado_at: hace(81.9) }),
  mensajePrueba({ id: 'c', autor: 'cliente', cuerpo: '¿Con cochera?', enviado_at: hace(81) }),
  mensajePrueba({ id: 'd', autor: 'bot', cuerpo: 'El 2B', enviado_at: hace(80) }),
];
const datos = {
  proyecto: { id: 'proj1', name: 'Torre Sol', slug: 'torre-sol', published: false } as ProjectRow,
  edificios: [], pisos: [], unidades: [], amenities: [], pois: [], calculadora: null, slides: [], avance: null, faq: [],
} as DatosProyecto;

function deps(texto: string | null, historiales: (typeof charla)[] = [charla, charla]) {
  let h = 0;
  const repo = {
    leerBot: vi.fn(async () => botPrueba({ seguimiento_activo: true, seguimiento_horas: 72 })),
    leerConversacion: vi.fn(async () => convPrueba({ avisado_at: null })),
    historial: vi.fn(async () => historiales[Math.min(h++, historiales.length - 1)]),
    encolar: vi.fn(async () => salidaPrueba()),
    marcarSeguimiento: vi.fn(async () => {}),
  };
  const responderTurno = vi.fn<DepsSeguimiento['responderTurno']>(async (): Promise<ResultadoTurno> => ({ texto }));
  const d: DepsSeguimiento = {
    sb: {} as SupabaseClient,
    repo,
    cargarDatosProyecto: vi.fn(async () => datos),
    responderTurno,
    ahora: () => AHORA,
  };
  return { d, repo, responderTurno };
}

describe('correrSeguimiento', () => {
  it('manda el mensaje con la consigna al final y marca el seguimiento', async () => {
    const { d, repo, responderTurno } = deps('¡Hola Ana! ¿Pudiste pensar lo del 2B?');
    expect(await correrSeguimiento(d, 'bot1', 'conv1')).toBe('enviado');
    const mensajes = responderTurno.mock.calls[0]![0].mensajes;
    expect(mensajes.at(-1)).toMatchObject({ role: 'user' });
    expect(String(mensajes.at(-1)!.content)).toContain('no responde hace 3 días');
    expect(repo.encolar).toHaveBeenCalledWith(d.sb, expect.objectContaining({ cuerpo: '¡Hola Ana! ¿Pudiste pensar lo del 2B?', origen: 'bot' }));
    expect(repo.marcarSeguimiento).toHaveBeenCalledWith(d.sb, 'conv1', AHORA);
  });

  it('la IA dice que no hubo interés: no manda nada pero marca', async () => {
    const { d, repo } = deps('NO_SEGUIMIENTO');
    expect(await correrSeguimiento(d, 'bot1', 'conv1')).toBe('sin_interes');
    expect(repo.encolar).not.toHaveBeenCalled();
    expect(repo.marcarSeguimiento).toHaveBeenCalled();
  });

  it('el cliente escribió mientras la IA pensaba: no manda ni marca', async () => {
    const nuevo = mensajePrueba({ id: 'e', autor: 'cliente', cuerpo: 'Hola!', enviado_at: hace(0) });
    const { d, repo } = deps('¿Seguís interesada?', [charla, [...charla, nuevo]]);
    expect(await correrSeguimiento(d, 'bot1', 'conv1')).toBe('cliente_volvio');
    expect(repo.encolar).not.toHaveBeenCalled();
    expect(repo.marcarSeguimiento).not.toHaveBeenCalled();
  });

  it('si no corresponde por las reglas, ni llama a la IA', async () => {
    const { d, responderTurno } = deps('x', [charla.slice(0, 3)]);
    expect(await correrSeguimiento(d, 'bot1', 'conv1')).toBe('no_corresponde');
    expect(responderTurno).not.toHaveBeenCalled();
  });
});
