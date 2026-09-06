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
      className="flex items-center gap-[8px] h-[38px] px-[15px] rounded-[10px] bg-white border border-trevo-dark/[0.16] text-[13px] font-medium text-trevo-dark hover:border-trevo-dark/40 transition-colors disabled:opacity-50"
    >
      <MessageCircle className="w-[14px] h-[14px]" />
      Mensaje
    </button>
  );
}
