import { motion } from 'framer-motion';
import type { FloorFiltersState } from '@/hooks/useFloorFilters';
import type { UnitStatus, UnitType } from '@/types';

interface FloorFiltersProps {
  filters: FloorFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<FloorFiltersState>>;
  filteredCount: number;
  totalUnits: number;
}

export default function FloorFilters({
  filters,
  setFilters,
  filteredCount,
  totalUnits,
}: FloorFiltersProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 }}
      className="absolute top-5 left-1/2 z-30 flex items-center gap-4 bg-white/90 backdrop-blur shadow-lg rounded-2xl px-5 py-3 border border-gray-100"
    >
      {/* Type filter */}
      <div className="flex flex-col">
        <label className="text-[10px] uppercase font-semibold text-gray-400 mb-1">Tipología</label>
        <select
          value={filters.type}
          onChange={(e) => setFilters(f => ({ ...f, type: e.target.value as UnitType | 'all' }))}
          className="bg-transparent text-sm font-medium text-gray-800 outline-none cursor-pointer"
        >
          <option value="all">Todas</option>
          <option value="monoambiente">Monoambiente</option>
          <option value="1 dormitorio">1 Dormitorio</option>
          <option value="2 dormitorios">2 Dormitorios</option>
          <option value="3 dormitorios">3 Dormitorios</option>
          <option value="penthouse">Penthouse</option>
        </select>
      </div>

      <div className="w-px h-8 bg-gray-200" />

      {/* Status filter */}
      <div className="flex flex-col">
        <label className="text-[10px] uppercase font-semibold text-gray-400 mb-1">Disponibilidad</label>
        <select
          value={filters.status}
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value as UnitStatus | 'all' }))}
          className="bg-transparent text-sm font-medium text-gray-800 outline-none cursor-pointer"
        >
          <option value="all">Cualquiera</option>
          <option value="available">Disponibles</option>
          <option value="reserved">Reservados</option>
          <option value="sold">Vendidos</option>
        </select>
      </div>

      {/* Filtered count */}
      <div className="ml-4 pl-4 border-l border-gray-200 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900 leading-none">{filteredCount}</span>
        <span className="text-[10px] text-gray-400 uppercase font-semibold mt-0.5">de {totalUnits}</span>
      </div>
    </motion.div>
  );
}
