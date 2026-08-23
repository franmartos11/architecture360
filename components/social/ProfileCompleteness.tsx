import { Check } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

interface ProfileCompletenessProps {
  hasAvatar: boolean;
  hasBio: boolean;
  hasLocation: boolean;
  hasProject: boolean;
}

// Empuje suave a completar el perfil — patrón central en LinkedIn. Solo se
// muestra al dueño del perfil y desaparece solo apenas está completo, no
// hace falta que nadie lo cierre a mano.
export default function ProfileCompleteness({ hasAvatar, hasBio, hasLocation, hasProject }: ProfileCompletenessProps) {
  const items = [
    { label: 'Foto de perfil', done: hasAvatar },
    { label: 'Una bio corta', done: hasBio },
    { label: 'Tu ubicación', done: hasLocation },
    { label: 'Al menos un proyecto publicado', done: hasProject },
  ];
  const doneCount = items.filter(i => i.done).length;
  if (doneCount === items.length) return null;
  const percent = Math.round((doneCount / items.length) * 100);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-stone-900">Completá tu perfil</p>
        <span className="text-xs font-medium text-stone-400">{percent}%</span>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-stone-900 rounded-full transition-all" style={{ width: `${percent}%` }} />
      </div>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.done ? 'bg-emerald-500 text-white' : 'border border-stone-300'}`}>
              {item.done && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
            </span>
            <span className={item.done ? 'text-stone-400 line-through' : 'text-stone-600'}>{item.label}</span>
          </li>
        ))}
      </ul>
      {!hasProject && (
        <Link href="/admin/proyectos" className="inline-block mt-3 text-xs font-medium text-stone-900 underline hover:no-underline">
          Cargar un proyecto →
        </Link>
      )}
    </div>
  );
}
