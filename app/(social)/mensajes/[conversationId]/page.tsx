import type { Metadata } from 'next';
import MessagesShell from '@/components/social/MessagesShell';

export const metadata: Metadata = { title: 'Mensajes — 360Proyects' };

interface PageProps { params: Promise<{ conversationId: string }> }

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  return <MessagesShell activeConversationId={conversationId} />;
}
