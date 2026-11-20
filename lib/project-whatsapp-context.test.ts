// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectWhatsappProvider, useProjectWhatsapp } from './project-whatsapp-context';

function Probe() {
  return createElement('span', null, String(useProjectWhatsapp()));
}

// El provider no usa hooks: se lo llama directo para no pasar children como prop.
function conNumero(numero: string | null) {
  return ProjectWhatsappProvider({ numero, children: createElement(Probe) });
}

describe('useProjectWhatsapp', () => {
  it('devuelve null sin provider', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>null</span>');
  });

  it('devuelve el número del provider', () => {
    const html = renderToStaticMarkup(
      conNumero('5491144440000'),
    );
    expect(html).toBe('<span>5491144440000</span>');
  });

  it('un numero null o vacío cuenta como sin número', () => {
    const html = renderToStaticMarkup(
      conNumero(null),
    );
    expect(html).toBe('<span>null</span>');
  });
});
