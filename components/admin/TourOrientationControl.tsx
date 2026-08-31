'use client';

import { useRef, useState } from 'react';

interface TourOrientationControlProps {
  hint: string;
  value: number | undefined;
  onChange: (degrees: number | undefined) => void;
  disabled?: boolean;
}

function angleFromCenter(svg: SVGSVGElement, clientX: number, clientY: number): number {
  const rect = svg.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  // atan2(dx, -dy): 0° arriba (norte), crece en sentido horario — mismo
  // sistema que usa orientationDegrees (norte real hacia donde apunta yaw=0).
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

// Calibra hacia dónde apunta el norte real en el recorrido: se arrastra la
// aguja sobre el círculo (o se tipea el grado directo) hasta que "arriba"
// en el dial coincida con el norte de un plano/GPS de referencia. Sin
// calibrar, no hay forma de saber hacia dónde mirar para el sol — por eso
// el indicador de salida/puesta en el visor no aparece hasta que esto
// tenga un valor.
export default function TourOrientationControl({ hint, value, onChange, disabled }: TourOrientationControlProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localDeg, setLocalDeg] = useState(value);

  // Si cambia `value` (o se suelta el arrastre) y no se está arrastrando
  // ahora, el dial vuelve a reflejar el valor externo — durante el render,
  // no en un efecto, para no pisar la posición mientras el usuario arrastra.
  const [prevValue, setPrevValue] = useState(value);
  const [prevDragging, setPrevDragging] = useState(dragging);
  if (value !== prevValue || dragging !== prevDragging) {
    setPrevValue(value);
    setPrevDragging(dragging);
    if (!dragging) setLocalDeg(value);
  }

  const commit = (deg: number | undefined) => onChange(deg === undefined ? undefined : ((deg % 360) + 360) % 360);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || !svgRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setLocalDeg(angleFromCenter(svgRef.current, e.clientX, e.clientY));
  };
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !svgRef.current) return;
    setLocalDeg(angleFromCenter(svgRef.current, e.clientX, e.clientY));
  };
  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    commit(localDeg);
  };

  const deg = localDeg ?? 0;
  const rad = (deg * Math.PI) / 180;
  const needleX = 50 + 34 * Math.sin(rad);
  const needleY = 50 - 34 * Math.cos(rad);

  return (
    <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        width={96}
        height={96}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`shrink-0 touch-none ${disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <circle cx={50} cy={50} r={46} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={2} />
        <text x={50} y={13} textAnchor="middle" className="fill-gray-400" fontSize={9} fontWeight={700}>N</text>
        <text x={87} y={53} textAnchor="middle" className="fill-gray-300" fontSize={8}>E</text>
        <text x={50} y={92} textAnchor="middle" className="fill-gray-300" fontSize={8}>S</text>
        <text x={13} y={53} textAnchor="middle" className="fill-gray-300" fontSize={8}>O</text>
        {localDeg !== undefined && (
          <>
            <line x1={50} y1={50} x2={needleX} y2={needleY} stroke="#4c5f54" strokeWidth={3} strokeLinecap="round" />
            <circle cx={needleX} cy={needleY} r={4.5} fill="#4c5f54" />
          </>
        )}
        <circle cx={50} cy={50} r={2} fill="#9ca3af" />
      </svg>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={359}
            disabled={disabled}
            value={localDeg ?? ''}
            onChange={e => setLocalDeg(e.target.value === '' ? undefined : Number(e.target.value))}
            onBlur={() => commit(localDeg)}
            placeholder="Sin calibrar"
            className="w-28 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50"
          />
          <span className="text-sm text-gray-400">grados desde el norte</span>
          {value !== undefined && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => { setLocalDeg(undefined); commit(undefined); }}
              className="text-sm text-gray-400 hover:text-red-500"
            >
              Borrar
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
    </div>
  );
}
