'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

export default function MessageButton({ handle, loggedIn }: { handle: string; loggedIn: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const handleClick = async () => {
    if (!loggedIn) {
      toast('Iniciá sesión para mandar mensajes.', 'error');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/mensajes/${data.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo iniciar la conversación.', 'error');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-stone-200 text-xs font-medium text-stone-600 hover:border-stone-300 hover:text-stone-900 transition-colors disabled:opacity-50"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      Mensaje
    </button>
  );
}
