'use client';

import BimEditor from '@/components/admin/section-editors/BimEditor';
import { X } from 'lucide-react';

export default function BimEditorModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6" onClick={onClose}>
      <div 
        className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Gestor de Modelos BIM</h3>
            <p className="text-xs text-gray-500 mt-0.5">Podés subir, editar y enlazar modelos 3D interactivos a pisos o unidades.</p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <BimEditor />
        </div>
      </div>
    </div>
  );
}
