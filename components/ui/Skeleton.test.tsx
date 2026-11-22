// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Skeleton, SkeletonText, SkeletonTable, SkeletonForm, SkeletonStatStrip, SkeletonCard, PageSkeleton } from './Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
  it('la pieza base usa el barrido y es decorativa', () => {
    const { container } = render(<Skeleton className="h-3" />);
    const el = container.firstElementChild!;
    expect(el.className).toContain('skeleton-shimmer');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('PageSkeleton se anuncia como "Cargando" y esconde sus piezas', () => {
    render(
      <PageSkeleton actions={2}>
        <SkeletonStatStrip count={3} />
        <SkeletonTable rows={2} cols={3} />
      </PageSkeleton>,
    );
    const status = screen.getByRole('status', { name: 'Cargando' });
    expect(status).toBeTruthy();
    for (const child of Array.from(status.children)) {
      expect(child.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('SkeletonText respeta la cantidad de líneas y los anchos', () => {
    const { container } = render(<SkeletonText lines={2} widths={['80%', '40%']} />);
    const lines = container.querySelectorAll('.skeleton-shimmer');
    expect(lines).toHaveLength(2);
    expect((lines[1] as HTMLElement).style.width).toBe('40%');
  });

  it('SkeletonTable dibuja cabecera más filas por columnas', () => {
    const { container } = render(<SkeletonTable rows={3} cols={4} />);
    expect(container.querySelectorAll('.skeleton-shimmer')).toHaveLength(4 + 3 * 4);
  });

  it('SkeletonForm: etiqueta y campo por fila', () => {
    const { container } = render(<SkeletonForm rows={3} />);
    expect(container.querySelectorAll('.skeleton-shimmer')).toHaveLength(6);
  });

  it('SkeletonCard tiene la forma de Card', () => {
    const { container } = render(<SkeletonCard lines={2} />);
    expect(container.firstElementChild!.className).toContain('rounded-2xl');
    expect(container.firstElementChild!.className).toContain('border-gray-200');
  });
});
