import { describe, it, expect } from 'vitest';
import { toWinAnsi, isWinAnsi } from './winansi';

describe('toWinAnsi', () => {
  it('deja intacto lo que Helvetica ya dibuja (castellano, m², °, ·, comillas, rayas)', () => {
    const ok = 'Área total 106 m² · 360° · Ñandú “Vista” ‘al’ río — 2–3 … € ™ • ¿Qué? ¡Sí! «ok» 1×2 ½ ³';
    expect(toWinAnsi(ok)).toBe(ok);
  });

  it('pasa a equivalentes seguros los símbolos comunes fuera de WinAnsi', () => {
    expect(toWinAnsi('≈ 120 m²')).toBe('~ 120 m²');
    expect(toWinAnsi('Cocina → living')).toBe('Cocina -> living');
    expect(toWinAnsi('← volver')).toBe('<- volver');
    expect(toWinAnsi('≤ 3 ≥ 1 ≠ 2')).toBe('<= 3 >= 1 != 2');
    expect(toWinAnsi('−10%')).toBe('-10%');
    expect(toWinAnsi('A‑01 ‐ B')).toBe('A-01 - B');
    expect(toWinAnsi('5′ 3″')).toBe('5\' 3"');
    expect(toWinAnsi('m⁴ CO₂')).toBe('m4 CO2');
    expect(toWinAnsi('№ 5')).toBe('N° 5');
  });

  it('espacios raros a espacio común o duro, y saca los invisibles', () => {
    expect(toWinAnsi('US$\u202F145.000')).toBe('US$\u00A0145.000');
    expect(toWinAnsi('a\u2009b\u3000c')).toBe('a b c');
    expect(toWinAnsi('To\u200Brre\uFEFF')).toBe('Torre');
  });

  it('letras con tildes de otros idiomas: la letra sin la marca', () => {
    expect(toWinAnsi('Łódź Ştefan Ő')).toBe('Lódz Stefan O'); // la ó ya es WinAnsi
    // tilde suelta (NFD) se recompone
    expect(toWinAnsi('Pe\u0301rez')).toBe('Pérez');
  });

  it('emoji y lo que no tiene equivalente se descarta sin dejar espacios dobles', () => {
    expect(toWinAnsi('Torre Sol 🌞')).toBe('Torre Sol');
    expect(toWinAnsi('🏢 Torre  ✨ Sol')).toBe('Torre Sol');
    expect(toWinAnsi('Vista al mar 🌊🏖️ y pileta')).toBe('Vista al mar y pileta');
    expect(toWinAnsi('👨\u200D👩\u200D👧 familia')).toBe('familia');
    expect(toWinAnsi('漢字')).toBe('');
  });

  it('respeta los saltos de línea', () => {
    expect(toWinAnsi('Línea 1 ✅\nLínea 2')).toBe('Línea 1\nLínea 2');
  });

  it('todo lo que sale es WinAnsi', () => {
    const messy = 'Torre ☀️ “Sol” ≈ 3 → 4 · Ω ψ 😀 m² 中 ⚡ ł';
    expect(isWinAnsi(toWinAnsi(messy))).toBe(true);
    expect(isWinAnsi(messy)).toBe(false);
  });
});
