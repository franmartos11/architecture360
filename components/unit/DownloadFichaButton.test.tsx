// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const track = vi.fn();
vi.mock('@/components/analytics/SiteTracker', () => ({ useTrack: () => track }));

import DownloadFichaButton from './DownloadFichaButton';

const U = '11111111-1111-4111-8111-111111111111';

describe('DownloadFichaButton', () => {
  afterEach(() => { cleanup(); localStorage.clear(); track.mockReset(); });

  it('link de descarga sin ref', () => {
    render(<DownloadFichaButton projectSlug="torre-sol" unitDbId={U} unitName="N01-07" variant="desktop" />);
    const a = screen.getByRole('link', { name: /Descargar ficha/ });
    expect(a.getAttribute('href')).toBe(`/api/ficha/torre-sol/${U}`);
    expect(a.hasAttribute('download')).toBe(true);
    expect(a.textContent).toContain('Descargar ficha');
  });

  it('suma el ref de la inmobiliaria del visitante', async () => {
    localStorage.setItem('atrium_ref', JSON.stringify({ ref: 'inmo-sur', at: Date.now() }));
    render(<DownloadFichaButton projectSlug="torre-sol" unitDbId={U} unitName="N01-07" variant="mobile" />);
    const a = screen.getByRole('link', { name: /Descargar ficha/ });
    await waitFor(() => expect(a.getAttribute('href')).toBe(`/api/ficha/torre-sol/${U}?ref=inmo-sur`));
  });

  it('ref guardado después de montar (primera visita): el link del click lo lleva', () => {
    render(<DownloadFichaButton projectSlug="torre-sol" unitDbId={U} unitName="N01-07" variant="desktop" />);
    localStorage.setItem('atrium_ref', JSON.stringify({ ref: 'inmo-sur', at: Date.now() }));
    const a = screen.getByRole('link', { name: /Descargar ficha/ });
    fireEvent.click(a);
    expect(a.getAttribute('href')).toBe(`/api/ficha/torre-sol/${U}?ref=inmo-sur`);
  });

  it('registra la descarga con la unidad', () => {
    render(<DownloadFichaButton projectSlug="torre-sol" unitDbId={U} unitName="N01-07" variant="desktop" />);
    fireEvent.click(screen.getByRole('link', { name: /Descargar ficha/ }));
    expect(track).toHaveBeenCalledWith('ficha', { unitId: U });
  });
});
