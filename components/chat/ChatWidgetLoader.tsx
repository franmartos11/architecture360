'use client';

import dynamic from 'next/dynamic';

// La burbuja se baja después del primer render: no suma al JS inicial del sitio.
const ChatWidget = dynamic(() => import('./ChatWidget'), { ssr: false });

export default function ChatWidgetLoader(props: { projectSlug: string; nombreBot: string | null; formulario?: boolean }) {
  return <ChatWidget {...props} />;
}
