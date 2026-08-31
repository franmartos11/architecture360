import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const NOW = new Date('2026-08-31T12:00:00.000Z');

function isoSecondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('menos de 5 segundos: "ahora"', () => {
    expect(formatRelativeTime(isoSecondsAgo(3))).toBe('ahora');
  });

  it('segundos: plural', () => {
    expect(formatRelativeTime(isoSecondsAgo(30))).toBe('hace 30 segundos');
  });

  it('minutos: singular a 1 minuto exacto', () => {
    expect(formatRelativeTime(isoSecondsAgo(90))).toBe('hace 1 minuto');
  });

  it('minutos: plural', () => {
    expect(formatRelativeTime(isoSecondsAgo(125))).toBe('hace 2 minutos');
  });

  it('horas: singular a 1 hora exacta', () => {
    expect(formatRelativeTime(isoSecondsAgo(3661))).toBe('hace 1 hora');
  });

  it('horas: plural', () => {
    expect(formatRelativeTime(isoSecondsAgo(3 * 3600))).toBe('hace 3 horas');
  });

  it('días: singular a 1 día exacto', () => {
    expect(formatRelativeTime(isoSecondsAgo(25 * 3600))).toBe('hace 1 día');
  });

  it('días: plural, por debajo de una semana', () => {
    expect(formatRelativeTime(isoSecondsAgo(3 * 24 * 3600))).toBe('hace 3 días');
  });

  it('una semana o más: cae a fecha corta sin año (mismo año)', () => {
    const result = formatRelativeTime(isoSecondsAgo(10 * 24 * 3600));
    expect(result).not.toMatch(/2026/);
    expect(result).not.toMatch(/hace/);
  });

  it('año distinto: la fecha corta incluye el año', () => {
    const result = formatRelativeTime(new Date('2024-01-15T12:00:00.000Z').toISOString());
    expect(result).toContain('2024');
  });
});
