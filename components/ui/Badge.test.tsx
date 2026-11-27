// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Badge from './Badge';

afterEach(() => cleanup());

describe('Badge', () => {
  it('en el idioma pedido', () => {
    render(<Badge status="reserved" locale="en" />);
    expect(screen.getByText('Reserved')).toBeTruthy();
  });
  it('sin idioma, castellano como siempre', () => {
    render(<Badge status="reserved" />);
    expect(screen.getByText('Reservado')).toBeTruthy();
  });
});
