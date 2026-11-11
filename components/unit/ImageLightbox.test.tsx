// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import ImageLightbox from './ImageLightbox';

afterEach(cleanup);

const IMAGES = ['/a.jpg', '/b.jpg', '/c.jpg'];

function renderLightbox(originRect?: DOMRect | null) {
  const onClose = vi.fn();
  render(
    <MotionProvider>
      <ImageLightbox
        isOpen
        images={IMAGES}
        index={1}
        onIndexChange={() => {}}
        onClose={onClose}
        originRect={originRect}
      />
    </MotionProvider>,
  );
  return { onClose };
}

describe('ImageLightbox', () => {
  it('sin originRect abre con la foto, el contador y cierra con Escape', () => {
    const { onClose } = renderLightbox();
    expect(screen.getByAltText('Imagen 2')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('con originRect muestra la foto (si no llega a medirla, con fundido) y cierra con Escape', async () => {
    // jsdom no carga imágenes: el FLIP nunca obtiene el tamaño real y cae
    // al fundido de siempre tras la espera máxima — igual tiene que verse.
    const rect = new DOMRect(40, 60, 200, 150);
    const { onClose } = renderLightbox(rect);
    await waitFor(() => expect(screen.getByAltText('Imagen 2')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('cerrado no renderiza nada', () => {
    render(
      <MotionProvider>
        <ImageLightbox isOpen={false} images={IMAGES} index={0} onIndexChange={() => {}} onClose={() => {}} />
      </MotionProvider>,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});
