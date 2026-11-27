// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const editor = vi.hoisted(() => ({ themeConfig: null as unknown }));
vi.mock('./theme-section-helper', () => ({
  useThemeSectionEditor: () => ({ themeConfig: editor.themeConfig, loading: false, saving: false, savePatch: vi.fn() }),
}));

import FaqEditor from './FaqEditor';

afterEach(() => cleanup());

describe('FaqEditor', () => {
  it('con la configuración ya cargada al montar, muestra las preguntas', () => {
    editor.themeConfig = { faqItems: [{ question: '¿Aceptan mascotas?', answer: 'Sí' }] };
    render(<FaqEditor onSaved={() => {}} />);
    expect(screen.getByDisplayValue('¿Aceptan mascotas?')).toBeTruthy();
  });

  it('si la configuración llega después, también', () => {
    editor.themeConfig = null;
    const { rerender } = render(<FaqEditor onSaved={() => {}} />);
    editor.themeConfig = { faqItems: [{ question: '¿Hay cocheras?', answer: 'Sí' }] };
    rerender(<FaqEditor onSaved={() => {}} />);
    expect(screen.getByDisplayValue('¿Hay cocheras?')).toBeTruthy();
  });
});
