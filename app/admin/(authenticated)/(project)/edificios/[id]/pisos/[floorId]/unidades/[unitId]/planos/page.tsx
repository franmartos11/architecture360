'use client';

import PlanosGroup from '@/components/admin/unit-groups/PlanosGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitPlanosPage() {
  const { values, patch } = useUnitShell();
  return <PlanosGroup values={values} onChange={patch} />;
}
