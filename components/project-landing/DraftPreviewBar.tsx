'use client';

import { useState } from 'react';

// Aviso fijo que ve quien tiene acceso al proyecto (dueño o miembro
// aceptado) cuando lo abre todavía en borrador (ver getSiteProject). Para
// cualquier otra persona ese link da "no disponible" — por eso tiene que
// quedar claro que esto es una vista previa y no el sitio en línea.
//
// "Publicar" solo aparece si quien mira puede publicar (administrador o
// más, `canPublish` lo calcula getSiteProject en el server con la misma
// sesión). Al resto se le muestra un texto neutro: el botón lo llevaría a
// una pantalla donde no tiene permiso para publicar.
//
// "Publicar" primero marca este proyecto como el activo del panel: el
// admin trabaja sobre la cookie de proyecto activo, y si venía de otro
// proyecto terminaría mirando (o publicando) el equivocado.
export default function DraftPreviewBar({ projectId, canPublish }: { projectId: string; canPublish: boolean }) {
  const [going, setGoing] = useState(false);

  const goPublish = async () => {
    setGoing(true);
    await fetch('/api/admin/active-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    }).catch(() => {});
    window.location.href = '/admin/proyecto#publicar';
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-32px)] max-w-xl flex items-center gap-3 rounded-xl bg-gray-900/95 text-white shadow-lg px-4 py-3 backdrop-blur"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <span className="h-5 px-2 shrink-0 flex items-center rounded-md bg-amber-400 text-gray-900 text-[11px] font-semibold">
        Borrador
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug">
        {canPublish
          ? 'Vista previa: solo vos y las personas con acceso al proyecto ven este sitio. Publicalo para que el link funcione para todos.'
          : 'Vista previa: solo las personas con acceso al proyecto ven este sitio. Un administrador o el dueño puede publicarlo para que el link funcione para todos.'}
      </p>
      {canPublish && (
        <button
          onClick={goPublish}
          disabled={going}
          className="shrink-0 h-8 px-3 rounded-lg bg-white text-gray-900 text-sm font-medium hover:bg-gray-100 disabled:opacity-60"
        >
          {going ? 'Abriendo…' : 'Publicar'}
        </button>
      )}
    </div>
  );
}
