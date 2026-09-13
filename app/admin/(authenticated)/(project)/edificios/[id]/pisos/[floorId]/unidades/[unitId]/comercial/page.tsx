'use client';

import ComercialGroup from '@/components/admin/unit-groups/ComercialGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitComercialPage() {
  const { values, patch } = useUnitShell();
  return <ComercialGroup values={values} onChange={patch} />;
}
