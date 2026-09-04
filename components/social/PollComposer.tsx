'use client';

import { X } from 'lucide-react';

const MAX_OPTIONS = 4;
const MIN_OPTIONS = 2;

interface PollComposerProps {
  question: string;
  options: string[];
  onQuestionChange: (question: string) => void;
  onOptionChange: (index: number, value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
}

// Constructor de encuesta inline dentro del composer — acción "Encuesta"
// en PostFeed.tsx. No existe en el mockup Feed.dc.html (ese botón no tenía
// nada detrás), armado con la misma paleta del resto del composer.
export default function PollComposer({ question, options, onQuestionChange, onOptionChange, onAddOption, onRemoveOption }: PollComposerProps) {
  return (
    <div className="mt-3 p-3 rounded-xl border-[1.5px] border-dashed" style={{ borderColor: 'rgba(28,25,23,0.16)', background: '#faf9f6' }}>
      <input
        value={question}
        onChange={e => onQuestionChange(e.target.value)}
        maxLength={200}
        placeholder="Hacé una pregunta..."
        className="w-full h-9 px-3 rounded-lg border border-trevo-dark/15 bg-white text-[13px] text-trevo-dark placeholder:text-trevo-dark/30 outline-none focus:border-[rgba(92,122,88,0.55)] transition-colors"
      />
      <div className="flex flex-col gap-2 mt-2">
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={option}
              onChange={e => onOptionChange(i, e.target.value)}
              maxLength={80}
              placeholder={`Opción ${i + 1}`}
              className="flex-1 h-9 px-3 rounded-lg border border-trevo-dark/15 bg-white text-[13px] text-trevo-dark placeholder:text-trevo-dark/30 outline-none focus:border-[rgba(92,122,88,0.55)] transition-colors"
            />
            {options.length > MIN_OPTIONS && (
              <button type="button" onClick={() => onRemoveOption(i)} className="p-1.5 text-trevo-dark/30 hover:text-trevo-dark transition-colors" aria-label="Quitar opción">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < MAX_OPTIONS && (
        <button type="button" onClick={onAddOption} className="text-xs font-medium mt-2" style={{ color: '#4a6647' }}>
          + Agregar opción
        </button>
      )}
    </div>
  );
}
