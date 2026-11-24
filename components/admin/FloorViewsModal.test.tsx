// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ToastProvider from '@/components/ui/ToastProvider';
import MotionProvider from '@/components/ui/MotionProvider';

// El uploader real sube a Storage: acá se reemplaza por dos botones.
// Como el real, cada uploader se queda con el onChange del render en que se
// eligió el archivo (acá: el primero) y lo llama cuando termina de subir.
const handlers = new Map<string, (u: string) => void>();
vi.mock('@/components/admin/ImageUploader', () => ({
  default: ({ value, onChange, label, folder }: { value: string; onChange: (u: string) => void; label?: string; folder: string }) => {
    if (!handlers.has(label!)) handlers.set(label!, onChange);
    return (
      <div data-testid={`up-${label}`} data-value={value} data-folder={folder}>
        <button type="button" onClick={() => handlers.get(label!)!(`https://x.supabase.co/${label}.jpg`)}>subir {label}</button>
        <button type="button" onClick={() => handlers.get(label!)!('')}>quitar {label}</button>
      </div>
    );
  },
}));

import FloorViewsModal from './FloorViewsModal';

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); handlers.clear(); });

function setup(floor: { view_photos?: unknown; view_panorama?: string | null }, ok = true) {
  const bodies: Record<string, unknown>[] = [];
  global.fetch = vi.fn((_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve({ ok, json: () => Promise.resolve({}) });
  }) as never;
  const onChanged = vi.fn();
  render(
    <MotionProvider><ToastProvider>
      <FloorViewsModal floor={{ id: 'f1', label: 'Piso 5', ...floor }} onClose={() => {}} onChanged={onChanged} />
    </ToastProvider></MotionProvider>,
  );
  return { bodies, onChanged };
}

describe('FloorViewsModal', () => {
  it('dos fotos que terminan de subir casi juntas: se guardan las dos, en orden', async () => {
    const bodies: Record<string, unknown>[] = [];
    let release!: () => void;
    let n = 0;
    global.fetch = vi.fn((_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      n++;
      // El primer guardado tarda: el segundo no puede salir antes ni pisarlo.
      return n === 1
        ? new Promise(r => { release = () => r({ ok: true, json: () => Promise.resolve({}) }); })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as never;
    render(<MotionProvider><ToastProvider><FloorViewsModal floor={{ id: 'f1', label: 'Piso 5', view_photos: [] }} onClose={() => {}} onChanged={() => {}} /></ToastProvider></MotionProvider>);
    fireEvent.click(screen.getByText('subir Norte'));
    fireEvent.click(screen.getByText('subir Noreste'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    release();
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ viewPhotos: [
      { direction: 'N', url: 'https://x.supabase.co/Norte.jpg' },
      { direction: 'NE', url: 'https://x.supabase.co/Noreste.jpg' },
    ] });
    expect(screen.getByTestId('up-Norte').getAttribute('data-value')).toBe('https://x.supabase.co/Norte.jpg');
    expect(screen.getByTestId('up-Noreste').getAttribute('data-value')).toBe('https://x.supabase.co/Noreste.jpg');
  });

  it('si falla una foto, se revierte solo esa y no las que se guardaron', async () => {
    let n = 0;
    global.fetch = vi.fn(() => { n++; return Promise.resolve({ ok: n === 1, json: () => Promise.resolve({}) }); }) as never;
    render(<MotionProvider><ToastProvider><FloorViewsModal floor={{ id: 'f1', label: 'Piso 5', view_photos: [] }} onClose={() => {}} onChanged={() => {}} /></ToastProvider></MotionProvider>);
    fireEvent.click(screen.getByText('subir Norte'));
    fireEvent.click(screen.getByText('subir Sur'));
    await waitFor(() => expect(screen.getByText('No se pudo guardar la vista.')).toBeTruthy());
    expect(screen.getByTestId('up-Norte').getAttribute('data-value')).toBe('https://x.supabase.co/Norte.jpg');
    expect(screen.getByTestId('up-Sur').getAttribute('data-value')).toBe('');
  });

  it('la panorámica pasa por el mismo control que las del recorrido 360°', () => {
    setup({});
    expect(screen.getByTestId('up-Panorámica 360°').getAttribute('data-folder')).toBe('tours');
  });

  it('subir la foto Norte guarda la lista con esa orientación', async () => {
    const { bodies, onChanged } = setup({ view_photos: [{ direction: 'S', url: 'https://x.supabase.co/s.jpg' }] });
    fireEvent.click(screen.getByText('subir Norte'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ viewPhotos: [
      { direction: 'N', url: 'https://x.supabase.co/Norte.jpg' },
      { direction: 'S', url: 'https://x.supabase.co/s.jpg' },
    ] });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.getByTestId('up-Norte').getAttribute('data-value')).toBe('https://x.supabase.co/Norte.jpg');
  });

  it('quitar una foto la saca de la lista', async () => {
    const { bodies } = setup({ view_photos: [{ direction: 'S', url: 'https://x.supabase.co/s.jpg' }] });
    fireEvent.click(screen.getByText('quitar Sur'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ viewPhotos: [] });
  });

  it('panorámica: se guarda y se quita con null', async () => {
    const { bodies } = setup({});
    fireEvent.click(screen.getByText('subir Panorámica 360°'));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ viewPanorama: 'https://x.supabase.co/Panorámica 360°.jpg' });
    fireEvent.click(screen.getByText('quitar Panorámica 360°'));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ viewPanorama: null });
  });

  it('si falla el guardado avisa y vuelve atrás', async () => {
    setup({ view_photos: [] }, false);
    fireEvent.click(screen.getByText('subir Este'));
    await waitFor(() => expect(screen.getByText('No se pudo guardar la vista.')).toBeTruthy());
    expect(screen.getByTestId('up-Este').getAttribute('data-value')).toBe('');
  });
});
