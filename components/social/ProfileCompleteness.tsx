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
    { label: 'Al menos un proyecto publicado', done: hasProject, href: '/admin/proyectos', cta: 'Cargar un proyecto' },
  ];
  const doneCount = items.filter(i => i.done).length;
  if (doneCount === items.length) return null;
  const percent = Math.round((doneCount / items.length) * 100);

  // Anillo de progreso — circunferencia de un círculo r=26 (2πr ≈ 163.36).
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - percent / 100);

  return (
    <div className="bg-white rounded-xl border border-trevo-dark/10 p-5">
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 60 60" className="w-16 h-16 -rotate-90">
            <circle cx="30" cy="30" r={r} fill="none" stroke="#e7e5e1" strokeWidth="5" />
            <circle
              cx="30" cy="30" r={r} fill="none"
              stroke="#5c7a58" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-trevo-dark">
            {percent}%
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-trevo-dark">Completá tu perfil</p>
          <p className="text-xs text-trevo-dark/50 font-light mt-0.5">Un perfil completo consigue más seguidores y colaboraciones.</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {items.map(item => (
          <li key={item.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.done ? 'bg-[#5c7a58] text-white' : 'border border-trevo-dark/20'}`}>
                {item.done && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
              </span>
              <span className={item.done ? 'text-trevo-dark/40 line-through truncate' : 'text-trevo-dark/70 truncate'}>{item.label}</span>
            </span>
            {!item.done && item.href && (
              <Link href={item.href} className="shrink-0 text-xs font-medium text-[#4a6647] hover:underline">
                {item.cta} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
