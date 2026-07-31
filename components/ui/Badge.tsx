import type { UnitStatus } from '@/types';
import { getStatusLabel } from '@/data/mockData';

interface BadgeProps {
  status: UnitStatus;
  size?: 'sm' | 'md';
}

export default function Badge({ status, size = 'md' }: BadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`badge-${status} rounded-full font-medium inline-flex items-center gap-1.5 ${sizeClasses}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'available'
            ? 'bg-status-available'
            : status === 'reserved'
            ? 'bg-status-reserved'
            : 'bg-status-sold'
        }`}
      />
      {getStatusLabel(status)}
    </span>
  );
}
