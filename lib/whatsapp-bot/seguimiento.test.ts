import { describe, expect, it } from 'vitest';
import { botPrueba, convPrueba, mensajePrueba } from './puente/prueba-fixtures';
import { consignaSeguimiento, debeHacerSeguimiento, esSinSeguimiento, horaBuenosAires, MARCA_SIN_SEGUIMIENTO } from './seguimiento';

// 15:00 en Buenos Aires (UTC-3).
const AHORA = new Date('2026-11-20T18:00:00.000Z');
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();
const charla = (horasBot = 80) => [
  mensajePrueba({ id: 'a', autor: 'cliente', cuerpo: 'Hola, ¿tienen 2 ambientes?', enviado_at: hace(horasBot + 2) }),
  mensajePrueba({ id: 'b', autor: 'bot', cuerpo: 'Sí, desde USD 90.000', enviado_at: hace(horasBot + 1.9) }),
  mensajePrueba({ id: 'c', autor: 'cliente', cuerpo: '¿Y con cochera?', enviado_at: hace(horasBot + 1) }),
  mensajePrueba({ id: 'd', autor: 'bot', cuerpo: 'El 2B tiene cochera', enviado_at: hace(horasBot) }),
];
const base = {
  bot: botPrueba({ seguimiento_activo: true, seguimiento_horas: 72, vendedor_whatsapp: '5491144440000' }),
  conv: convPrueba({ avisado_at: null, seguimiento_at: null }),
  msgs: charla(),
  mensajesHoyNumero: 0,
  ahora: AHORA,
};

describe('debeHacerSeguimiento', () => {
  it('charla con interés, el bot habló último hace más de 72 h: sí', () => {
    expect(debeHacerSeguimiento(base)).toEqual({ si: true, diasSilencio: 3 });
  });

  it.each([
    ['apagado', { bot: botPrueba({ seguimiento_activo: false }) }],
    ['muy_pronto', { msgs: charla(10) }],
    ['muy_viejo', { msgs: charla(20 * 24) }],
    ['avisado', { conv: convPrueba({ avisado_at: hace(1) }) }],
    ['humano', { conv: convPrueba({ modo: 'humano', humano_hasta: hace(-5) }) }],
    ['fuera_de_horario', { ahora: new Date('2026-11-21T02:00:00.000Z') }],
    ['tope_diario', { mensajesHoyNumero: 300 }],
    ['ultimo_no_es_bot', { msgs: charla().slice(0, 3) }],
    ['poca_charla', { msgs: charla().slice(2) }],
    ['intervino_equipo', { msgs: [...charla().slice(0, 3), mensajePrueba({ autor: 'vendedor', enviado_at: hace(81) }), charla()[3]] }],
    ['ya_hecho', { conv: convPrueba({ seguimiento_at: hace(5) }) }],
  ] as const)('%s', (motivo, cambio) => {
    expect(debeHacerSeguimiento({ ...base, ...cambio } as typeof base)).toEqual({ si: false, motivo });
  });

  it('un seguimiento viejo (antes de que el cliente volviera a escribir) no frena uno nuevo', () => {
    expect(debeHacerSeguimiento({ ...base, conv: convPrueba({ seguimiento_at: hace(500) }) }).si).toBe(true);
  });
});

describe('textos', () => {
  it('hora de Buenos Aires', () => {
    expect(horaBuenosAires(AHORA)).toBe(15);
  });
  it('consigna y marca de "no corresponde"', () => {
    expect(consignaSeguimiento(1)).toContain('desde ayer');
    expect(consignaSeguimiento(4)).toContain('hace 4 días');
    expect(esSinSeguimiento(`${MARCA_SIN_SEGUIMIENTO}`)).toBe(true);
    expect(esSinSeguimiento('  ')).toBe(true);
    expect(esSinSeguimiento('¡Hola! ¿Pudiste ver las fotos del 2B?')).toBe(false);
  });
});
