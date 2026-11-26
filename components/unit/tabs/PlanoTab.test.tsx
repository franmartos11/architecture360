// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MotionProvider from '@/components/ui/MotionProvider';
import type { Unit } from '@/types';
import PlanoTab from './PlanoTab';

vi.mock('../RoomPlanViewer', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ planImage }: { planImage: string }) => <img alt="plano de planta" src={planImage} />,
}));

afterEach(cleanup);

// Dúplex cargado desde el paso "Plantas": plano por planta, sin ambientes.
const unit = {
  id: 'u1', name: 'D1-A', roomPlanImage: '/pb.png', rooms: [],
  levels: [{ id: 'piso-1', label: 'Planta alta', planImage: '/pa.png', plan3dImage: null, rooms: [] }],
} as unknown as Unit;

describe('PlanoTab — plano de cada planta sin ambientes', () => {
  it('muestra la vista de plantas con selector y el plano', () => {
    render(
      <MotionProvider>
        <PlanoTab unit={unit} hasRooms={false} hasPlantaPlans planView="ambientes" onPlanViewChange={() => {}} onSelectRoom={() => {}} />
      </MotionProvider>,
    );
    expect(screen.getByRole('button', { name: 'Plantas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Planta alta' })).toBeTruthy();
    expect(screen.getByAltText('plano de planta').getAttribute('src')).toBe('/pb.png');
    expect(screen.queryByRole('button', { name: 'Plano 3D' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Plano técnico' })).toBeNull();
  });

  it('muestra Plano 3D y Plano técnico solo cuando están cargados', () => {
    const conPlanos = { ...unit, plan3dUrl: '/p3d.png', technicalPlanUrl: '/tec.png' } as unknown as Unit;
    render(
      <MotionProvider>
        <PlanoTab unit={conPlanos} hasRooms={false} hasPlantaPlans planView="ambientes" onPlanViewChange={() => {}} onSelectRoom={() => {}} />
      </MotionProvider>,
    );
    expect(screen.getByRole('button', { name: 'Plano 3D' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plano técnico' })).toBeTruthy();
  });
});
