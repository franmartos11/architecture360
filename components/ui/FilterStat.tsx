export function FilterStat({ value, label, color, active, onClick }: { value: number; label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-1 min-w-[110px] text-left bg-white rounded-xl px-3.5 py-3 border transition-colors ${active ? 'border-brand-500 shadow-[0_0_0_2px_rgba(92,122,88,.12)]' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <p className="text-[19px] font-semibold leading-none" style={{ color: color ?? '#101828' }}>{value}</p>
      <p className="text-[10.5px] text-gray-500 mt-1 leading-tight">{label}</p>
    </button>
  );
}
