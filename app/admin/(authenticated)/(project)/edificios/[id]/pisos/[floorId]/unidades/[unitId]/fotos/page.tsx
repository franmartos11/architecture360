'use client';

import ImagenesGroup from '@/components/admin/unit-groups/ImagenesGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitFotosPage() {
  const { values, patch } = useUnitShell();
  return <ImagenesGroup values={values} onChange={patch} />;
}
