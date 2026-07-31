import { useState, useMemo } from 'react';
import type { Unit, UnitStatus, UnitType } from '@/types';

export interface FloorFiltersState {
  status: UnitStatus | 'all';
  type: UnitType | 'all';
}

export function useFloorFilters(units: Unit[]) {
  const [filters, setFilters] = useState<FloorFiltersState>({
    status: 'all',
    type: 'all',
  });

  const filteredUnits = useMemo(() => {
    return units.filter(unit => {
      const matchStatus = filters.status === 'all' || unit.status === filters.status;
      const matchType = filters.type === 'all' || unit.type === filters.type;
      return matchStatus && matchType;
    });
  }, [units, filters]);

  return {
    filters,
    setFilters,
    filteredUnits,
    totalUnits: units.length,
    filteredCount: filteredUnits.length,
  };
}
