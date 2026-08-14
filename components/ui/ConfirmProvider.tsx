'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';

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
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirmDialog = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...opts, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-[300] p-4"
            onClick={() => settle(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
              onClick={e => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
            >
              {pending.title && <h3 className="text-lg font-semibold text-gray-900 mb-1.5">{pending.title}</h3>}
              <p className="text-sm text-gray-600">{pending.message}</p>
              <div className="flex items-center gap-3 mt-5 justify-end">
                <Button type="button" variant="ghost" onClick={() => settle(false)} className="bg-transparent hover:bg-gray-100">
                  {pending.cancelLabel ?? 'Cancelar'}
                </Button>
                <button
                  type="button"
                  onClick={() => settle(true)}
                  autoFocus
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2 transition-colors active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 text-white ${
                    pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {pending.confirmLabel ?? 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
