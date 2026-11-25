import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { DepsHerramientas } from './herramientas';
import { responderTurno } from './turno';

type Bloque = Record<string, unknown>;

function respuesta(stop_reason: string, content: Bloque[]) {
  return {
    id: 'msg_x',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    stop_details: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

let nTool = 0;
function usoBuscar() {
  nTool += 1;
  return respuesta('tool_use', [
    { type: 'thinking', thinking: '', signature: 'sig' },
    {
      type: 'tool_use',
      id: `toolu_${nTool}`,
      name: 'buscar_unidades',
      input: { ambientes: null, dormitorios: null, precio_max: null, moneda: null, edificio: null, estado: null },
    },
  ]);
}

function fin(texto: string) {
  return respuesta('end_turn', [{ type: 'text', text: texto }]);
}

function clienteFalso(...respuestas: unknown[]) {
  const create = vi.fn();
  for (const r of respuestas) {
    if (r instanceof Error) create.mockRejectedValueOnce(r);
    else create.mockResolvedValueOnce(r);
  }
  const cliente = { beta: { messages: { create } } } as unknown as Pick<Anthropic, 'beta'>;
  return { cliente, create };
}

function deps(): DepsHerramientas {
  return {
    unidades: [],
    material: { renders: [], masterplan: null, brief: null, edificios: [], amenities: [], avance: [] },
    linkUnidad: () => null,
    anotarPregunta: vi.fn(async () => {}),
    encolarImagenes: vi.fn(async () => {}), avisar: vi.fn(async () => 'avisado' as const) };
}

const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [
  { type: 'text', text: 'reglas', cache_control: { type: 'ephemeral' } },
];
const MENSAJES: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: '¿Qué tienen?' }];

describe('responderTurno', () => {
  it('ejecuta la herramienta, devuelve el tool_result y el texto final', async () => {
    const primera = usoBuscar();
    const { cliente, create } = clienteFalso(primera, fin('Por ahora no hay unidades.'));
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });

    expect(r).toMatchObject({ texto: 'Por ahora no hay unidades.' });
    expect(r.motivoSinRespuesta).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    const segunda = create.mock.calls[1][0];
    expect(segunda.messages).toHaveLength(3);
    // El turno del asistente se reenvía completo (con el bloque thinking).
    expect(segunda.messages[1]).toEqual({ role: 'assistant', content: primera.content });
    expect(segunda.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: (primera.content[1] as { id: string }).id,
          content: 'No hay unidades que coincidan con esos filtros.',
          is_error: false,
        },
      ],
    });
    // No muta el historial recibido.
    expect(MENSAJES).toHaveLength(1);
  });

  it('usa las herramientas que se le pasan (canal web)', async () => {
    const { cliente, create } = clienteFalso(fin('Hola'));
    const herramientas = [{ name: 'solo_esta', input_schema: { type: 'object' as const, properties: {} } }];
    await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps(), herramientas });
    expect(create.mock.calls[0][0].tools).toBe(herramientas);
  });

  it('usa el modelo y los parámetros acordados', async () => {
    const { cliente, create } = clienteFalso(fin('Hola'));
    await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    const p = create.mock.calls[0][0];
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.fallbacks).toBe('default');
    expect(p.max_tokens).toBe(16000);
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('tool_choice');
    expect(p.system).toBe(SYSTEM);
    expect(p.tools.map((t: { name: string }) => t.name)).toEqual([
      'buscar_unidades',
      'ver_unidad',
      'enviar_imagenes',
      'enviar_material',
      'anotar_pregunta',
      'ver_horarios_visita',
      'agendar_visita',
      'cancelar_visita',
      'avisar_vendedor',
    ]);
  });

  it('todos los tool_use de una respuesta vuelven en un único mensaje user', async () => {
    const doble = respuesta('tool_use', [
      { type: 'tool_use', id: 'toolu_a', name: 'ver_unidad', input: { codigo: 'X' } },
      { type: 'tool_use', id: 'toolu_b', name: 'ver_unidad', input: { codigo: 'Y' } },
    ]);
    const { cliente, create } = clienteFalso(doble, fin('No encontré esas unidades.'));
    await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    const ultimo = create.mock.calls[1][0].messages[2];
    expect(ultimo.role).toBe('user');
    expect(ultimo.content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_a', content: 'No existe la unidad X', is_error: true },
      { type: 'tool_result', tool_use_id: 'toolu_b', content: 'No existe la unidad Y', is_error: true },
    ]);
  });

  it('concatena los bloques de texto e ignora el thinking', async () => {
    const r0 = respuesta('end_turn', [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Hola. ' },
      { type: 'text', text: 'Te cuento.' },
    ]);
    const { cliente } = clienteFalso(r0);
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: 'Hola. Te cuento.' });
  });

  it('refusal → sin respuesta', async () => {
    const { cliente } = clienteFalso(respuesta('refusal', []));
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: null, motivoSinRespuesta: 'refusal' });
  });

  it('suma el uso de tokens de todas las llamadas del turno', async () => {
    const conUso = <T extends object>(r: T, u: object) => ({ ...r, usage: u });
    const { cliente } = clienteFalso(
      conUso(usoBuscar(), { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 }),
      conUso(fin('Listo'), { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 3200, cache_creation_input_tokens: 400 }),
    );
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r.uso).toEqual({
      modelo: 'claude-opus-5-5',
      llamadas: 2,
      inputTokens: 150,
      outputTokens: 30,
      cacheReadTokens: 6200,
      cacheWriteTokens: 400,
    });
  });

  it('si la API falla, el uso de las llamadas que sí respondieron igual vuelve', async () => {
    const err = new Anthropic.APIError(500, undefined, 'caído', new Headers());
    const { cliente } = clienteFalso({ ...usoBuscar(), usage: { input_tokens: 10, output_tokens: 5 } }, err, err);
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: null, motivoSinRespuesta: 'error' });
    expect(r.uso).toMatchObject({ llamadas: 1, inputTokens: 10, outputTokens: 5 });
  });

  it('con el límite del turno vencido no llama a la API ni reintenta: sin respuesta', async () => {
    const { cliente, create } = clienteFalso(fin('Hola'));
    const controller = new AbortController();
    controller.abort();
    const r = await responderTurno({ cliente, system: [], mensajes: [{ role: 'user', content: 'hola' }], deps: {} as never, signal: controller.signal });
    expect(r).toMatchObject({ texto: null, motivoSinRespuesta: 'error' });
    expect(create).not.toHaveBeenCalled();
  });

  it('le pasa el límite del turno al SDK en cada pedido', async () => {
    const { cliente, create } = clienteFalso(fin('Hola'));
    const controller = new AbortController();
    await responderTurno({ cliente, system: [], mensajes: [{ role: 'user', content: 'hola' }], deps: {} as never, signal: controller.signal });
    expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('8 tool_use seguidos → corta en 6 iteraciones con max_iteraciones', async () => {
    const { cliente, create } = clienteFalso(...Array.from({ length: 8 }, usoBuscar));
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: null, motivoSinRespuesta: 'max_iteraciones' });
    expect(create).toHaveBeenCalledTimes(6);
  });

  it('un error del SDK se reintenta una vez', async () => {
    const err = new Anthropic.RateLimitError(429, undefined, 'rate limited', new Headers());
    const { cliente, create } = clienteFalso(err, fin('Hola'));
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: 'Hola' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('dos errores del SDK seguidos → error', async () => {
    const e1 = new Anthropic.InternalServerError(500, undefined, 'boom', new Headers());
    const e2 = new Anthropic.APIConnectionError({ message: 'sin red' });
    const { cliente, create } = clienteFalso(e1, e2, fin('no debería llegar'));
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: null, motivoSinRespuesta: 'error' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('un error que no es del SDK se propaga', async () => {
    const { cliente } = clienteFalso(new TypeError('bug'));
    await expect(
      responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() }),
    ).rejects.toThrow('bug');
  });

  it('historial que no termina en user → error sin llamar a la API', async () => {
    const { cliente, create } = clienteFalso(fin('x'));
    const r = await responderTurno({
      cliente,
      system: SYSTEM,
      mensajes: [...MENSAJES, { role: 'assistant', content: 'hola' }],
      deps: deps(),
    });
    expect(r).toMatchObject({ texto: null, motivoSinRespuesta: 'error' });
    expect(create).not.toHaveBeenCalled();
  });

  it('respuesta final sin texto → texto null', async () => {
    const { cliente } = clienteFalso(respuesta('end_turn', [{ type: 'thinking', thinking: '', signature: 's' }]));
    const r = await responderTurno({ cliente, system: SYSTEM, mensajes: MENSAJES, deps: deps() });
    expect(r).toMatchObject({ texto: null });
  });
});
