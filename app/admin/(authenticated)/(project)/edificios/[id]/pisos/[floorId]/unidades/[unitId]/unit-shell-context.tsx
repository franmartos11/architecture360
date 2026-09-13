'use client';

import { createContext, useContext } from 'react';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitFormValues } from '@/lib/unit-fields';

export interface UnitShellContextValue {
  unit: DbUnitRow;
  values: UnitFormValues;
  patch: (updates: Partial<UnitFormValues>) => Promise<boolean>;
}

export const UnitShellContext = createContext<UnitShellContextValue | null>(null);

// Las páginas de grupo (datos/superficies/comercial/fotos/planos/tour)
// viven siempre bajo el layout que provee este contexto — si no, es un
// bug de árbol de componentes, no un estado "todavía no cargó".
export function useUnitShell(): UnitShellContextValue {
  const ctx = useContext(UnitShellContext);
  if (!ctx) throw new Error('useUnitShell debe usarse dentro de unidades/[unitId]/layout.tsx');
  return ctx;
}
