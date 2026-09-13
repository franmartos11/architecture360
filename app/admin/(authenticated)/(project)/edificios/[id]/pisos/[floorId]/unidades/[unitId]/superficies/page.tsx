'use client';

import SuperficiesGroup from '@/components/admin/unit-groups/SuperficiesGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitSuperficiesPage() {
  const { values, patch } = useUnitShell();
  return <SuperficiesGroup values={values} onChange={patch} />;
}
