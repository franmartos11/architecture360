'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Reemplazo de window.confirm() con un modal propio de la UI (mismo look
// en todo el panel, no el diálogo feo del navegador) — se usa igual que
// confirm(): `if (!(await confirmDialog('¿Borrar esto?'))) return;`.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  // `pending` queda cargado mientras el diálogo se anima al cerrar: lo que
  // se apaga es `open`, así el contenido no desaparece antes que el panel.
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirmDialog = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...opts, resolve });
      setOpen(true);
    });
  }, []);

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      {children}
      <Dialog
        open={open}
        onClose={() => settle(false)}
        role="alertdialog"
        size="sm"
        elevated
        padded={false}
        title={pending?.title ?? pending?.message}
        description={pending?.title ? pending.message : undefined}
        // Destructivo: el foco empieza en Cancelar, nunca en el botón que borra.
        initialFocus={pending?.danger ? cancelRef : confirmRef}
        footer={
          <>
            <Button ref={cancelRef} type="button" variant="ghost" onClick={() => settle(false)} className="bg-transparent hover:bg-gray-100">
              {pending?.cancelLabel ?? 'Cancelar'}
            </Button>
            <button
              ref={confirmRef}
              type="button"
              onClick={() => settle(true)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2 transition-colors active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 text-white ${
                pending?.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'
              }`}
            >
              {pending?.confirmLabel ?? 'Confirmar'}
            </button>
          </>
        }
      >
        {/* Con título, el mensaje va de bajada en la cabecera; sin título, el
            mensaje es el nombre del diálogo. El cuerpo queda vacío. */}
        {null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
