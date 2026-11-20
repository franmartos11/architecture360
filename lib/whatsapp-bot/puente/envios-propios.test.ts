import { describe, expect, it } from 'vitest';
import { EnviosPropios } from './envios-propios';
import { entrantePrueba } from './prueba-fixtures';

function reloj(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
}

const propio = (p: Parameters<typeof entrantePrueba>[0] = {}) =>
  entrantePrueba({ deMi: true, nombre: null, waId: 'true_5491155551234@c.us_X1', ...p });

describe('EnviosPropios', () => {
  it('reconoce un waId que ya mandó la cola', () => {
    const e = new EnviosPropios();
    expect(e.esDeLaCola('true_a@c.us_1')).toBe(false);
    e.registrarWaId('true_a@c.us_1');
    expect(e.esDeLaCola('true_a@c.us_1')).toBe(true);
  });

  it('ignora el waId vacío (WhatsApp no devolvió id)', () => {
    const e = new EnviosPropios();
    e.registrarWaId('');
    expect(e.esDeLaCola('')).toBe(false);
  });

  it('el eco de un texto que se está mandando (antes de saber su waId) es propio', () => {
    const e = new EnviosPropios();
    e.empezar('5491155551234@c.us', { cuerpo: 'Hola, te cuento', adjunto: false });
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Hola, te cuento' }))).toBe(true);
  });

  it('un texto distinto al mismo chat no es propio (lo escribieron desde el teléfono)', () => {
    const e = new EnviosPropios();
    e.empezar('5491155551234@c.us', { cuerpo: 'Hola, te cuento', adjunto: false });
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Te llamo en un rato' }))).toBe(false);
  });

  it('el mismo texto a otro chat no es propio', () => {
    const e = new EnviosPropios();
    e.empezar('5491155551234@c.us', { cuerpo: 'Hola', adjunto: false });
    expect(e.esEnvioEnCurso(propio({ wid: '5491166667777@c.us', numero: '5491166667777', cuerpo: 'Hola' }))).toBe(false);
  });

  it('cada envío en curso reconoce un solo eco', () => {
    const e = new EnviosPropios();
    e.empezar('5491155551234@c.us', { cuerpo: 'Hola', adjunto: false });
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Hola' }))).toBe(true);
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Hola', waId: 'true_x_2' }))).toBe(false);
  });

  it('un medio mientras se manda una imagen a ese chat es propio; un texto no', () => {
    const e = new EnviosPropios();
    e.empezar('5491155551234@c.us', { cuerpo: null, adjunto: true });
    expect(e.esEnvioEnCurso(propio({ tipo: 'texto', cuerpo: 'otra cosa' }))).toBe(false);
    expect(e.esEnvioEnCurso(propio({ tipo: 'imagen', cuerpo: '' }))).toBe(true);
  });

  it('un plano en PDF sale como documento y también es propio', () => {
    const e = new EnviosPropios();
    e.empezar('5491155551234@c.us', { cuerpo: null, adjunto: true });
    expect(e.esEnvioEnCurso(propio({ tipo: 'documento', cuerpo: '' }))).toBe(true);
  });

  it('destino como número pelado (aviso al vendedor): el eco llega con el wid @c.us', () => {
    const e = new EnviosPropios();
    e.empezar('5491166667777', { cuerpo: '🔥 Cliente interesado', adjunto: false });
    expect(
      e.esEnvioEnCurso(propio({ wid: '5491166667777@c.us', numero: '5491166667777', cuerpo: '🔥 Cliente interesado' })),
    ).toBe(true);
  });

  it('el eco puede llegar un rato después de terminado el envío; pasado el margen ya no', () => {
    const r = reloj();
    const e = new EnviosPropios(r.ahora);
    const terminar = e.empezar('5491155551234@c.us', { cuerpo: 'Hola', adjunto: false });
    terminar();
    r.avanzar(30_000);
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Hola' }))).toBe(true);

    const terminar2 = e.empezar('5491155551234@c.us', { cuerpo: 'Chau', adjunto: false });
    terminar2();
    r.avanzar(10 * 60_000);
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Chau' }))).toBe(false);
  });

  it('un envío que sigue en curso no vence aunque tarde', () => {
    const r = reloj();
    const e = new EnviosPropios(r.ahora);
    e.empezar('5491155551234@c.us', { cuerpo: 'Hola', adjunto: false });
    r.avanzar(10 * 60_000);
    expect(e.esEnvioEnCurso(propio({ cuerpo: 'Hola' }))).toBe(true);
  });

  it('los waId viejos se olvidan', () => {
    const r = reloj();
    const e = new EnviosPropios(r.ahora);
    e.registrarWaId('w-viejo');
    r.avanzar(2 * 60 * 60_000);
    e.registrarWaId('w-nuevo');
    expect(e.esDeLaCola('w-viejo')).toBe(false);
    expect(e.esDeLaCola('w-nuevo')).toBe(true);
  });
});
