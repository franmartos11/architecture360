'use client';

import DatosGroup from '@/components/admin/unit-groups/DatosGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitDatosPage() {
  const { values, patch } = useUnitShell();
  return <DatosGroup values={values} onChange={patch} />;
}
