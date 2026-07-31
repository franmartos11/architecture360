'use client';

import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { Unit } from '@/types';

const Masterplan = dynamic(
  () => import('@/components/masterplan/Masterplan'),
  {
    ssr: false,
    loading: () => <LoadingSpinner text="Cargando masterplan..." />,
  }
);

interface MasterplanWrapperProps {
  imageUrl: string;
  units: Unit[];
  projectSlug: string;
}

export default function MasterplanWrapper(props: MasterplanWrapperProps) {
  return <Masterplan {...props} />;
}
