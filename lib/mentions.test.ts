import { describe, it, expect } from 'vitest';
import { extractMentionedHandles } from './mentions';

describe('extractMentionedHandles', () => {
  it('extrae handles válidos de un texto', () => {
    expect(extractMentionedHandles('Gracias @juan-perez y @estudio123 por el aporte')).toEqual([
      'juan-perez',
      'estudio123',
    ]);
  });

  it('dedupea menciones repetidas', () => {
    expect(extractMentionedHandles('@ana vio esto y @ana confirmo')).toEqual(['ana']);
  });

  it('ignora "@" seguido de mayúsculas, y corta el match en el primer símbolo no válido', () => {
    // "@Ana" no matchea nada (empieza en mayúscula). "@juan_perez" matchea
    // solo "juan" — "_" no está en la clase [a-z0-9-], corta el handle ahí.
    // "@a@b" no matchea nada — ambos fragmentos tienen 1 char, por debajo del mínimo de 3.
    expect(extractMentionedHandles('@Ana y @juan_perez y @a@b')).toEqual(['juan']);
  });

  it('ignora handles de menos de 3 caracteres', () => {
    expect(extractMentionedHandles('hola @ab')).toEqual([]);
  });

  it('trunca (no rechaza) handles de más de 40 caracteres — toma los primeros 40', () => {
    const long = 'a'.repeat(45);
    const [handle] = extractMentionedHandles(`@${long}`);
    expect(handle).toHaveLength(40);
    expect(handle).toBe('a'.repeat(40));
  });

  it('devuelve [] si no hay menciones', () => {
    expect(extractMentionedHandles('texto sin arrobas')).toEqual([]);
  });
});
