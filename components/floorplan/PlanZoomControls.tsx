// Botones +/− que flotan sobre un visor de plano (fuera del contenido
// transformado). Recibe los utils del render-prop de <TransformWrapper>.
export default function PlanZoomControls({ zoomIn, zoomOut }: { zoomIn: () => void; zoomOut: () => void }) {
  return (
    <div className="flex flex-col bg-white/95 rounded-[10px] overflow-hidden shadow-lg">
      <button onClick={() => zoomIn()} aria-label="Acercar" className="w-8 h-8 flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <div className="h-px bg-gray-200" />
      <button onClick={() => zoomOut()} aria-label="Alejar" className="w-8 h-8 flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
    </div>
  );
}
