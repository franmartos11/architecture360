export function HeadCheck({ checked, onChange, stop }: { checked: boolean; onChange: () => void; stop?: boolean }) {
  return (
    <span
      className="w-8 shrink-0 flex items-center justify-center cursor-pointer"
      onClick={e => { if (stop) e.stopPropagation(); onChange(); }}
    >
      <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white ${checked ? 'bg-brand-600 border border-brand-600' : 'bg-white border border-gray-300'}`}>
        {checked ? '✓' : ''}
      </span>
    </span>
  );
}
