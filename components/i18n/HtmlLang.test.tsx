// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import HtmlLang from './HtmlLang';

afterEach(() => cleanup());

describe('HtmlLang', () => {
  it('pone el idioma de la página en <html lang> y lo devuelve al salir', () => {
    document.documentElement.lang = 'es';
    const { unmount } = render(<HtmlLang locale="en" />);
    expect(document.documentElement.lang).toBe('en');
    unmount();
    expect(document.documentElement.lang).toBe('es');
  });
});
