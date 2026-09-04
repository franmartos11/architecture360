'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { SKILLS_CATALOG } from '@/lib/skills-catalog';
import type { ProfileSkill } from '@/types';

interface SkillsSectionProps {
  skills: ProfileSkill[];
  onChange: (skills: ProfileSkill[]) => void;
}

function chipClass(active: boolean) {
  return `h-[26px] px-[11px] rounded-lg text-[11.5px] font-medium cursor-pointer transition-colors border ${
    active
      ? 'bg-[rgba(92,122,88,0.14)] text-[#3f5a3c] border-[rgba(92,122,88,0.3)]'
      : 'bg-[#f5f4f0] text-[rgba(28,25,23,0.6)] border-transparent hover:border-[rgba(92,122,88,0.3)]'
  }`;
}

// Aptitudes con nivel 1-3 — calcado de la sección "Aptitudes" del mockup
// Editor de perfil.dc.html: los chips elegidos arriba (con sus puntitos de
// nivel clickeables) y, debajo, el catálogo por categoría para sumar más.
export default function SkillsSection({ skills, onChange }: SkillsSectionProps) {
  const [showLevels, setShowLevels] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(Object.keys(SKILLS_CATALOG)[0]);

  const labels = skills.map(s => s.label);

  const toggle = (label: string) => {
    if (labels.includes(label)) onChange(skills.filter(s => s.label !== label));
    else onChange([...skills, { label, level: 2 }]);
  };

  const setLevel = (label: string, level: 1 | 2 | 3) => {
    onChange(skills.map(s => (s.label === label ? { ...s, level } : s)));
  };

  return (
    <div id="aptitudes" className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] p-5 scroll-mt-[130px]">
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-[14.5px] text-[#1c1a17]">Aptitudes</span>
        <span className="h-5 px-2 rounded-md bg-[#f5f4f0] text-[10.5px] font-medium text-[rgba(28,25,23,0.55)] flex items-center">
          {skills.length} de 12 recomendadas
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowLevels(v => !v)}
          className="h-7 px-[11px] rounded-lg text-[11px] font-medium transition-colors"
          style={showLevels ? { background: 'rgba(92,122,88,0.12)', color: '#4a6647' } : { background: '#f5f4f0', color: 'rgba(28,25,23,0.55)' }}
        >
          {showLevels ? 'Ocultar niveles' : 'Mostrar niveles'}
        </button>
      </div>
      <p className="font-light text-[11.5px] leading-[1.5] text-[rgba(28,25,23,0.48)] mt-1">
        Ordenadas por nivel: lo que ponés primero es lo que se ve en tu tarjeta del feed.
      </p>

      {skills.length > 0 ? (
        <div className="flex gap-[7px] flex-wrap mt-[13px]">
          {skills.map(sk => (
            <div key={sk.label} className="h-[30px] pl-[11px] pr-1 flex items-center gap-2 rounded-lg bg-[rgba(92,122,88,0.1)] border border-[rgba(92,122,88,0.24)]">
              <span className="font-medium text-[11.5px] text-[#3f5a3c]">{sk.label}</span>
              {showLevels && (
                <div className="flex gap-[3px]">
                  {([1, 2, 3] as const).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLevel(sk.label, n)}
                      aria-label={`Nivel ${n}`}
                      className="w-[7px] h-[7px] rounded-full"
                      style={{ background: n <= sk.level ? '#5c7a58' : 'rgba(28,25,23,0.16)' }}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => toggle(sk.label)}
                aria-label={`Quitar ${sk.label}`}
                className="w-5 h-5 flex items-center justify-center rounded-md text-[rgba(28,25,23,0.35)] hover:bg-[rgba(28,25,23,0.08)] hover:text-[#1c1a17] transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-[13px] p-3.5 rounded-[11px] border border-dashed border-[rgba(28,25,23,0.16)] bg-[#faf9f6] font-light text-xs text-[rgba(28,25,23,0.5)]">
          Elegí del catálogo de abajo — los estudios filtran por aptitud cuando buscan colaboradores.
        </div>
      )}

      <div className="mt-3.5 rounded-xl border border-[rgba(28,25,23,0.09)] overflow-hidden">
        {Object.entries(SKILLS_CATALOG).map(([cat, catSkills]) => {
          const open = openCat === cat;
          const selCount = catSkills.filter(s => labels.includes(s)).length;
          return (
            <div key={cat} className="border-b border-[rgba(28,25,23,0.06)] last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenCat(open ? null : cat)}
                className="w-full h-[42px] px-3.5 flex items-center gap-2.5 hover:bg-[#faf9f6] transition-colors"
                style={{ background: open ? '#faf9f6' : '#fff' }}
              >
                <span className="flex-1 text-left font-medium text-[12.5px] text-[#1c1a17]">{cat}</span>
                {selCount > 0 && (
                  <span className="h-[19px] px-[7px] rounded-md bg-[rgba(92,122,88,0.14)] text-[10px] font-semibold text-[#4a6647] flex items-center">{selCount}</span>
                )}
                <span className="text-[11px] text-[rgba(28,25,23,0.4)]">{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div className="px-3.5 pb-[13px] flex gap-1.5 flex-wrap">
                  {catSkills.map(s => (
                    <button key={s} type="button" onClick={() => toggle(s)} className={chipClass(labels.includes(s))}>
                      {labels.includes(s) ? `✓ ${s}` : s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
