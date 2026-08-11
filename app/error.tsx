'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-[9999] px-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Algo salió mal</h1>
        <p className="text-sm text-gray-500">
          No pudimos cargar esta página. Puede ser un problema temporal — probá de nuevo.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
