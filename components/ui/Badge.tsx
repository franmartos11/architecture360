import type { UnitStatus } from '@/types';
import { getStatusLabel } from '@/lib/units';
import type { Locale } from '@/lib/i18n/locales';

interface BadgeProps {
  status: UnitStatus;
  size?: 'sm' | 'md';
  /** Idioma del sitio público; sin él, castellano (panel). */
  locale?: Locale;
}

export default function Badge({ status, size = 'md', locale = 'es' }: BadgeProps) {
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
      {getStatusLabel(status, locale)}
    </span>
  );
}
