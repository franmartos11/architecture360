import type { Metadata } from 'next';
import MessagesShell from '@/components/social/MessagesShell';

export const metadata: Metadata = { title: 'Mensajes — Atrium' };

export default function MessagesPage() {
  return <MessagesShell />;
}
