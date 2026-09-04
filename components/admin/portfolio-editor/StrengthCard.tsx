import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

export interface StrengthCheck {
  label: string;
  ok: boolean;
  weight: number;
  href: string;
}

// Anillo + checklist pesado del rail derecho — mismos 8 checks y pesos que
// el mockup Editor de perfil.dc.html (suman 100). A diferencia de
// ProfileCompleteness.tsx (el nudge más chico que vive en el perfil
// público), este cubre todo lo que edita esta página y no se auto-oculta
// al completarse — pasa a mostrar el estado "perfil completo".
export default function StrengthCard({ checks }: { checks: StrengthCheck[] }) {
  const pct = Math.round(checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0));
  const nextMissing = checks.find(c => !c.ok);
  const strengthLabel = pct >= 85 ? 'completo' : pct >= 55 ? 'en camino' : 'incompleto';
  const strengthHint = nextMissing
    ? `Lo que más suma ahora: ${nextMissing.label.toLowerCase()}.`
    : 'Aparecés en las búsquedas de estudios y en las sugerencias del feed.';

  return (
    <div className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] p-[17px]">
      <div className="flex items-center gap-3.5">
        <div
          className="w-[66px] h-[66px] rounded-full shrink-0 flex items-center justify-center"
          style={{ background: `conic-gradient(#5c7a58 ${pct}%, rgba(28,25,23,0.09) ${pct}%)` }}
        >
          <div className="w-[52px] h-[52px] rounded-full bg-white flex items-center justify-center font-semibold text-sm text-[#1c1a17]">
            {pct}%
          </div>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[13.5px] text-[#1c1a17]">Perfil {strengthLabel}</p>
          <p className="font-light text-[11px] leading-[1.45] text-[rgba(28,25,23,0.5)] mt-0.5">{strengthHint}</p>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 mt-[13px]">
        {checks.map(c => (
          <Link
            key={c.label}
            href={c.href}
            className="flex items-center gap-2.5 py-[7px] px-2 -mx-2 rounded-[9px] hover:bg-[#faf9f6] transition-colors"
          >
            <span
              className="w-[17px] h-[17px] rounded-full shrink-0 flex items-center justify-center text-[9.5px]"
              style={c.ok ? { background: '#5c7a58', color: '#fff' } : { border: '1.5px dashed rgba(28,25,23,0.24)' }}
            >
              {c.ok && '✓'}
            </span>
            <span className={`text-[11.5px] ${c.ok ? 'text-[rgba(28,25,23,0.42)] line-through' : 'text-[#1c1a17]'}`}>{c.label}</span>
            <span className="flex-1" />
            {!c.ok && <span className="text-[10.5px] font-medium text-[#4a6647]">+{c.weight}%</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
