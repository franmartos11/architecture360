// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('next/dynamic', () => ({ default: () => () => null }));

import LocationPicker from './LocationPicker';

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function type(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('LocationPicker', () => {
  it('muestra el error de la búsqueda de Google', async () => {
    mockFetch({ results: [], error: 'Google Places respondió un error (403).' }, 502);
    render(<LocationPicker latitude={null} longitude={null} onChange={vi.fn()} />);
    await type('Belgrano 269');
    expect(await screen.findByText('Google Places respondió un error (403).')).toBeTruthy();
  });

  it('la búsqueda se sesga hacia la ubicación ya marcada', async () => {
    const fetchMock = mockFetch({ results: [] });
    render(<LocationPicker latitude={-31.42} longitude={-64.19} onChange={vi.fn()} />);
    await type('Belgrano 269');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('lat=-31.42');
    expect(url).toContain('lng=-64.19');
  });

  it('elegir un resultado no dispara otra búsqueda ni reabre la lista', async () => {
    const fetchMock = mockFetch({
      results: [{ placeId: 'p', name: 'Belgrano 269', address: 'Belgrano 269, Córdoba', lat: -31.4, lng: -64.1, category: 'otro' }],
    });
    const onChange = vi.fn();
    render(<LocationPicker latitude={null} longitude={null} onChange={onChange} />);
    await type('Belgrano 269');
    fireEvent.click(await screen.findByText('Belgrano 269 — Belgrano 269, Córdoba'));
    expect(onChange).toHaveBeenCalledWith(-31.4, -64.1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
