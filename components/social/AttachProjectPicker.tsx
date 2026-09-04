'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export interface AttachableProject {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  masterplanImage: string | null;
  published: boolean;
  hasTour: boolean;
}

interface AttachProjectPickerProps {
  kind: 'project' | 'tour';
  onSelect: (project: AttachableProject) => void;
  onClose: () => void;
}

// Dropdown para elegir uno de tus propios proyectos y adjuntarlo al post —
// usado tanto por la acción "Proyecto" (kind="project") como "Recorrido
// 360" del composer (kind="tour", filtrado a proyectos que ya tienen un
// recorrido cargado). Mismo patrón de cierre-al-click-afuera que KebabMenu.
export default function AttachProjectPicker({ kind, onSelect, onClose }: AttachProjectPickerProps) {
  const [projects, setProjects] = useState<AttachableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/posts/attachable-projects')
      .then(res => res.json())
      .then(data => {
        setProjects(data.projects ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = kind === 'tour' ? projects.filter(p => p.hasTour) : projects;

  return (
    <div ref={ref} className="absolute z-20 bottom-full left-0 mb-1.5 w-72 bg-white rounded-xl shadow-lg border border-trevo-dark/10 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-trevo-dark/5">
        <p className="text-xs font-semibold text-trevo-dark">{kind === 'tour' ? 'Adjuntar un recorrido 360' : 'Adjuntar un proyecto'}</p>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {loading ? (
          <p className="px-3.5 py-3 text-xs text-trevo-dark/40">Cargando...</p>
        ) : filtered.length === 0 ? (
          <p className="px-3.5 py-3 text-xs text-trevo-dark/40 leading-relaxed">
            {kind === 'tour'
              ? 'Ninguno de tus proyectos tiene un recorrido 360 cargado todavía.'
              : 'Todavía no creaste ningún proyecto.'}
          </p>
        ) : (
          filtered.map(project => (
            <button
              key={project.id}
              onClick={() => onSelect(project)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-trevo-dark/5 transition-colors"
            >
              <div className="relative w-8 h-8 rounded-md overflow-hidden shrink-0 bg-trevo-dark/5">
                {project.masterplanImage && (
                  <Image src={project.masterplanImage} alt="" fill sizes="32px" className="object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-trevo-dark truncate">{project.name}</p>
                {project.location && <p className="text-[11px] text-trevo-dark/45 truncate">{project.location}</p>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
