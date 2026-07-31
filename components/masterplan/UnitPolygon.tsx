'use client';

import { useCallback } from 'react';
import type { Unit } from '@/types';

interface UnitPolygonProps {
  unit: Unit;
  isHovered: boolean;
  onHover: (unitId: string | null) => void;
  onSelect: (unit: Unit) => void;
}

export default function UnitPolygon({ unit, isHovered, onHover, onSelect }: UnitPolygonProps) {
  const points = unit.polygon.map((p) => `${p.x},${p.y}`).join(' ');

  const handleMouseEnter = useCallback(() => {
    onHover(unit.id);
  }, [onHover, unit.id]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback(() => {
    onSelect(unit);
  }, [onSelect, unit]);

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
      aria-label={`${unit.name} - ${unit.type} - ${unit.area}m²`}
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
