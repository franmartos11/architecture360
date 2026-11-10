// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { renderHook, cleanup } from '@testing-library/react';
import { useCurrentUrl } from './useCurrentUrl';

afterEach(cleanup);

describe('useCurrentUrl', () => {
  it('en el cliente devuelve la URL actual', () => {
    window.history.pushState({}, '', '/proyecto/torre/edificio/b1?piso=3');
    const { result } = renderHook(() => useCurrentUrl());
    expect(result.current).toBe(`${window.location.origin}/proyecto/torre/edificio/b1?piso=3`);
  });

  it('en el servidor (renderToString) devuelve vacío, sin tocar window', () => {
    function Probe() {
      return createElement('span', null, `[${useCurrentUrl()}]`);
    }
    expect(renderToString(createElement(Probe))).toContain('[]');
  });
});
