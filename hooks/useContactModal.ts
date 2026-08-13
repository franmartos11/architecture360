'use client';

import { useState, useCallback } from 'react';

export type ContactMethod = 'email' | 'whatsapp' | 'phone';

// Estado del modal de "Solicitar información" (email/teléfono/WhatsApp) —
// usado tanto en el visor de unidad como en el plano de piso.
export function useContactModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [method, setMethod] = useState<ContactMethod>('email');

  const open = useCallback((m: ContactMethod = 'email') => {
    setMethod(m);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, method, open, close };
}
