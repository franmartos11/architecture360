import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import FloorTransitionLab, { type LabFloor } from '@/components/prototypes/FloorTransitionLab';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { floorName } from '@/lib/floor-explorer';

// Laboratorio de la animación de cambio de piso: tres variantes sobre los
// planos reales de un proyecto, para compararlas y medirlas antes de llevar
// una al visor de plantas. Solo existe en desarrollo.
export const metadata: Metadata = { title: 'Cambio de piso · laboratorio', robots: { index: false } };

interface PageProps {
  searchParams: Promise<{ p?: string; v?: string }>;
}

export default async function FloorTransitionLabPage({ searchParams }: PageProps) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { p = 'torre-i', v } = await searchParams;
  const project = await getPublicProjectBySlug(p);
  const building = project?.buildings.find(b => b.floors.filter(f => f.planImage).length > 1);
  if (!project || !building) notFound();

  const floors: LabFloor[] = building.floors
    .filter(f => f.planImage)
    .sort((a, b) => b.number - a.number)
    .map(f => {
      const units = project.units.filter(u => u.buildingId === building.id && u.floor === f.number);
      return {
        number: f.number,
        name: floorName(f),
        planImage: f.planImage,
        units: units.length,
        available: units.filter(u => u.status === 'available').length,
      };
    });

  return <FloorTransitionLab floors={floors} projectName={`${project.name} · ${building.name}`} initialVariant={v} />;
}
