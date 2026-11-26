// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider, useLocale, useT } from './client';

afterEach(() => cleanup());

function Barra() {
  const t = useT();
  const { locale, disponibles } = useLocale();
  return <p>{t('nav.unidades')} · {locale} · {disponibles.join(',')}</p>;
}

describe('LocaleProvider', () => {
  it('sin proveedor (vista previa del panel): castellano', () => {
    render(<Barra />);
    expect(screen.getByText('Unidades · es · es')).toBeTruthy();
  });

  it('con inglés', () => {
    render(<LocaleProvider locale="en" disponibles={['es', 'en']}><Barra /></LocaleProvider>);
    expect(screen.getByText('Units · en · es,en')).toBeTruthy();
  });
});
