import { ReactNode } from 'react';

export default function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-10 text-center">
      {icon && <div className="flex justify-center mb-3 text-brand-300">{icon}</div>}
      <p className="text-gray-500 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
