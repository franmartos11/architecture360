import { describe, expect, it, vi } from 'vitest';
import type { ProjectRow } from '@/types/database';
import type { DatosProyecto, UnidadBot } from './ficha';
import { aMensajesClaudeSimulados, simularTurno } from './simulador';

const unidad = { id: 'u1', edificioId: 'e1', codigo: '2B', edificio: 'Torre A', piso: '2', tipo: 'Depto', categoria: 'vivienda', ambientes: 2, dormitorios: 1, banos: 1, m2Total: 50, m2Cubiertos: 45, precio: 100000, moneda: 'USD', estado: 'available', orientacion: null, expensas: null, cocheras: 0, condicion: null, features: [], fotos: ['https://x/f.jpg'], plano: null, plano3d: null } as UnidadBot;
const datos: DatosProyecto = {
  proyecto: { id: 'p1', name: 'Torre Sol', slug: 'torre-sol' } as ProjectRow,
  edificios: [], pisos: [], unidades: [unidad], amenities: [], pois: [], calculadora: null, slides: [], avance: null, faq: [],
};
const bot = { nombre_bot: null, criterio_aviso: null, conocimiento: null };

describe('aMensajesClaudeSimulados', () => {
  it('junta mensajes seguidos del mismo lado y descarta lo del bot antes del cliente', () => {
    expect(
      aMensajesClaudeSimulados([
        { rol: 'bot', texto: 'Hola' },
        { rol: 'cliente', texto: 'Buenas' },
        { rol: 'cliente', texto: '¿Precio?' },
        { rol: 'bot', texto: 'USD 100.000' },
        { rol: 'cliente', texto: '  ' },
        { rol: 'cliente', texto: 'Gracias' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Buenas\n\n¿Precio?' },
      { role: 'assistant', content: 'USD 100.000' },
      { role: 'user', content: 'Gracias' },
    ]);
  });
});

describe('simularTurno', () => {
  it('devuelve lo que haría el bot (imágenes, aviso, preguntas) sin efectos', async () => {
    const r = await simularTurno({
      datos, bot, sitio: null, yaAvisado: false,
      mensajes: [{ rol: 'cliente', texto: 'Quiero ver el 2B y visitar' }],
      responder: async ({ deps, system }) => {
        expect(JSON.stringify(system)).toContain('Torre Sol');
        await deps.encolarImagenes(['https://x/f.jpg']);
        await deps.anotarPregunta({ tema: 'mascotas', pregunta: '¿Aceptan perros?' });
        expect(await deps.avisar({ unidades: ['2B'], resumen: 'Quiere visitar' })).toBe('avisado');
        expect(await deps.avisar({ unidades: [], resumen: 'otra vez' })).toBe('ya_avisado');
        return { texto: 'Te mando fotos.\n\nAlguien te contacta.' };
      },
    });
    expect(r.partes).toEqual(['Te mando fotos.', 'Alguien te contacta.']);
    expect(r.imagenes).toEqual(['https://x/f.jpg']);
    expect(r.preguntas).toEqual([{ tema: 'mascotas', pregunta: '¿Aceptan perros?' }]);
    expect(r.aviso?.resumen).toBe('Quiere visitar');
    expect(r.aviso?.unidades[0]).toContain('2B');
  });

  it('ya avisado en la simulación: no vuelve a avisar', async () => {
    const r = await simularTurno({
      datos, bot, sitio: null, yaAvisado: true,
      mensajes: [{ rol: 'cliente', texto: 'hola' }],
      responder: async ({ deps }) => {
        expect(await deps.avisar({ unidades: [], resumen: 'x' })).toBe('ya_avisado');
        return { texto: 'ok' };
      },
    });
    expect(r.aviso).toBeNull();
  });

  it('sin respuesta de la IA: motivo y nada más', async () => {
    const responder = vi.fn(async () => ({ texto: null, motivoSinRespuesta: 'refusal' as const }));
    const r = await simularTurno({ datos, bot, sitio: null, yaAvisado: false, mensajes: [{ rol: 'cliente', texto: 'x' }], responder });
    expect(r).toEqual({ partes: [], imagenes: [], aviso: null, preguntas: [], visita: null, motivoSinRespuesta: 'refusal' });
  });
});
