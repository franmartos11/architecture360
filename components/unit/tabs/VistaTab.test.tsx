// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('next/dynamic', () => ({ default: () => (props: { imageUrl?: string }) => <div data-testid="pano">{props.imageUrl}</div> }));

import VistaTab from './VistaTab';
import type { UnitView } from '@/lib/floor-views';

const view = (over: Partial<UnitView> = {}): UnitView => ({
  floorNumber: 5, floorLabel: 'Piso 5', approximate: false, initialIndex: 1,
  photos: [
    { direction: 'N', url: 'https://x.supabase.co/n.jpg', label: 'Norte' },
    { direction: 'E', url: 'https://x.supabase.co/e.jpg', label: 'Este' },
  ],
  ...over,
});

const mainImage = () => screen.getByRole('img', { name: /^Vista hacia el/ });

describe('VistaTab', () => {
  afterEach(cleanup);

  it('arranca por la orientación de la unidad y dice desde qué piso', () => {
    render(<VistaTab view={view()} />);
    expect(mainImage().getAttribute('src')).toBe('https://x.supabase.co/e.jpg');
    expect(mainImage().getAttribute('alt')).toBe('Vista hacia el Este desde Piso 5');
    expect(screen.getByText('Vista al Este desde Piso 5')).toBeTruthy();
    expect(screen.getByText(/La vista real puede variar/)).toBeTruthy();
  });

  it('cambia de orientación', () => {
    render(<VistaTab view={view()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Norte' }));
    expect(mainImage().getAttribute('src')).toBe('https://x.supabase.co/n.jpg');
    expect(screen.getByRole('button', { name: 'Norte' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('vista de otro piso: lo aclara', () => {
    render(<VistaTab view={view({ approximate: true, floorLabel: 'Piso 3' })} />);
    expect(screen.getByText('Vista aproximada al Este desde Piso 3')).toBeTruthy();
  });

  it('con panorámica: alterna Fotos y 360°', () => {
    render(<VistaTab view={view({ panorama: 'https://x.supabase.co/p.jpg' })} />);
    fireEvent.click(screen.getByRole('button', { name: '360°' }));
    expect(screen.getByTestId('pano').textContent).toBe('https://x.supabase.co/p.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Fotos' }));
    expect(mainImage()).toBeTruthy();
  });

  it('una sola foto: igual dice hacia dónde mira', () => {
    render(<VistaTab view={view({ photos: [{ direction: 'N', url: 'https://x.supabase.co/n.jpg', label: 'Norte' }], initialIndex: 0 })} />);
    expect(screen.getByText('Vista al Norte desde Piso 5')).toBeTruthy();
  });

  it('en 360° el cartel no nombra una orientación', () => {
    render(<VistaTab view={view({ panorama: 'https://x.supabase.co/p.jpg' })} />);
    fireEvent.click(screen.getByRole('button', { name: '360°' }));
    expect(screen.getByText('Vista 360° desde Piso 5')).toBeTruthy();
  });

  it('solo panorámica: va directo al 360°, sin selector', () => {
    render(<VistaTab view={view({ photos: [], initialIndex: 0, panorama: 'https://x.supabase.co/p.jpg' })} />);
    expect(screen.getByTestId('pano')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fotos' })).toBeNull();
  });
});
