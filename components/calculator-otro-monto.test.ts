// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/LeadCaptureModal', () => ({ default: () => null }));
vi.stubGlobal('fetch', () => Promise.resolve({ json: () => Promise.resolve(null) }));

import Calculator from '@/components/Calculator';

// Con modelos cargados, "Otro monto" deja tipear un valor propio y la cuota
// se calcula sobre ese valor (antes el campo solo aparecía sin modelos).
afterEach(cleanup);

const models = [{ label: 'Casa A', price: 100000, currency: 'USD' }];

function texto() {
  return screen.getByText('Monto a financiar').parentElement!.textContent!.replace(/[.,]/g, '');
}

describe('Cotizador · otro monto', () => {
  it('con modelos ofrece "Otro monto" y calcula sobre lo tipeado', () => {
    render(createElement(Calculator, { projectSlug: 'x', models }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(texto()).toContain('85000'); // 100.000 - 15%

    fireEvent.click(screen.getByRole('button', { name: 'Otro monto' }));
    const input = screen.getByRole('textbox');
    expect(texto()).toContain('—');

    fireEvent.change(input, { target: { value: '200000' } });
    expect((input as HTMLInputElement).value).toMatch(/^200[.,]000$/);
    expect(texto()).toContain('170000'); // 200.000 - 15%
    expect(screen.getByText('Anticipo (15%)').parentElement!.textContent!.replace(/[.,]/g, '')).toContain('30000');

    fireEvent.click(screen.getByRole('button', { name: /Casa A/ }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(texto()).toContain('85000');
  });

  it('sin modelos sigue mostrando el campo directo', () => {
    render(createElement(Calculator, { projectSlug: 'x', models: [] }));
    expect(screen.queryByRole('button', { name: 'Otro monto' })).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
