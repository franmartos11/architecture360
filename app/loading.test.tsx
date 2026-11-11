// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Loading from './loading';

afterEach(cleanup);

describe('app/loading', () => {
  it('es un estado discreto: "Cargando" en sentence case, sin mayúsculas espaciadas', () => {
    const { container } = render(<Loading />);
    const label = screen.getByText('Cargando');
    expect(label.textContent).toBe('Cargando');
    expect(screen.getByRole('status')).toBeTruthy();
    // Nada de UPPERCASE / tracking / pulso: el tell genérico de antes.
    expect(container.innerHTML).not.toMatch(/uppercase|tracking-|animate-pulse|animate-spin/);
    expect(container.textContent).not.toMatch(/[A-ZÁÉÍÓÚ]{3,}/);
  });
});
