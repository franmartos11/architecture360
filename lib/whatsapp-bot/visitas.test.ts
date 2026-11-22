import { describe, expect, it } from 'vitest';
import {
  CONFIG_VISITAS_DEFAULT,
  fechaAR,
  instanteAR,
  normalizarConfigVisitas,
  textoHorarios,
  textoTurno,
  textoTurnosLibres,
  turnosLibres,
  type ConfigVisitas,
} from './visitas';

// Viernes 20/11/2026, 09:00 en Argentina.
const AHORA = new Date('2026-11-20T12:00:00.000Z');
const config: ConfigVisitas = {
  ...CONFIG_VISITAS_DEFAULT,
  activo: true,
  duracion_min: 60,
  anticipacion_horas: 2,
  dias_adelante: 3,
  franjas: { '5': [['10:00', '13:00']], '6': [['15:00', '17:00']] },
};

describe('fechas en Argentina', () => {
  it('instante, fecha y texto', () => {
    const d = instanteAR('2026-11-20', '10:00')!;
    expect(d.toISOString()).toBe('2026-11-20T13:00:00.000Z');
    expect(fechaAR(new Date('2026-11-21T02:30:00.000Z'))).toBe('2026-11-20');
    expect(textoTurno(d)).toBe('vie 20/11 10:00');
    expect(instanteAR('2026-11-20', '25:00')).toBeNull();
    expect(instanteAR('20/11/2026', '10:00')).toBeNull();
  });
});

describe('turnosLibres', () => {
  it('parte las franjas, respeta la anticipación y los días configurados', () => {
    const t = turnosLibres(config, [], AHORA).map(textoTurno);
    // Hoy viernes desde las 11 (anticipación 2 h), sábado a la tarde; domingo y lunes cerrado.
    expect(t).toEqual(['vie 20/11 11:00', 'vie 20/11 12:00', 'sáb 21/11 15:00', 'sáb 21/11 16:00']);
  });
  it('saltea los turnos que se superponen con una visita agendada', () => {
    const ocupado = { inicio: instanteAR('2026-11-21', '15:30')!, fin: instanteAR('2026-11-21', '16:30')! };
    expect(turnosLibres(config, [ocupado], AHORA).map(textoTurno)).toEqual(['vie 20/11 11:00', 'vie 20/11 12:00']);
  });
  it('un día puntual', () => {
    expect(turnosLibres(config, [], AHORA, '2026-11-21').map(textoTurno)).toEqual(['sáb 21/11 15:00', 'sáb 21/11 16:00']);
  });
  it('texto para la IA con la fecha entre corchetes', () => {
    expect(textoTurnosLibres(turnosLibres(config, [], AHORA))).toBe('- vie 20/11 [2026-11-20]: 11:00, 12:00\n- sáb 21/11 [2026-11-21]: 15:00, 16:00');
  });
});

describe('normalizarConfigVisitas', () => {
  it('descarta franjas inválidas y valores fuera de las opciones', () => {
    const c = normalizarConfigVisitas({ activo: true, duracion_min: 17, franjas: { '1': [['13:00', '10:00'], ['09:00', '12:00']], '9': [['10:00', '11:00']] } });
    expect(c).toMatchObject({ activo: true, duracion_min: 45, franjas: { '1': [['09:00', '12:00']] } });
    expect(normalizarConfigVisitas(null)).toBeNull();
  });
});

describe('textoHorarios', () => {
  it('agrupa días seguidos con las mismas franjas', () => {
    expect(textoHorarios({ ...CONFIG_VISITAS_DEFAULT, activo: true })).toBe('lunes a viernes 10:00–13:00 y 15:00–18:00; sábado 10:00–13:00');
  });
});
