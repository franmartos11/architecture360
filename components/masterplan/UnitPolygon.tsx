'use client';

import { useCallback, memo } from 'react';
import type { Unit } from '@/types';

interface UnitPolygonProps {
  unit: Unit;
  isHovered: boolean;
  onHover: (unitId: string | null) => void;
  onSelect: (unit: Unit) => void;
}

function UnitPolygon({ unit, isHovered, onHover, onSelect }: UnitPolygonProps) {
  // Los hooks van antes que cualquier return condicional (reglas de
  // hooks) — ninguno depende de `points`, así que no hay problema en
  // declararlos antes de calcularlo.
  const handleMouseEnter = useCallback(() => {
    onHover(unit.id);
  }, [onHover, unit.id]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback(() => {
    onSelect(unit);
  }, [onSelect, unit]);

  if (!unit.polygon || unit.polygon.length === 0) return null;
  const points = unit.polygon.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <polygon
      points={points}
      className={`unit-polygon status-${unit.status}`}
      strokeWidth={isHovered ? 2.5 : 1.5}
      fillOpacity={isHovered ? 0.55 : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      role="button"
      aria-label={`${unit.name} - ${unit.type} - ${unit.totalArea}m²`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    />
  );
}

export default memo(UnitPolygon);
