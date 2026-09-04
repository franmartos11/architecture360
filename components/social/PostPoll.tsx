'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

export interface PollOption {
  id: string;
  label: string;
  voteCount: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  myVoteOptionId: string | null;
}

interface PostPollProps {
  postId: string;
  poll: Poll;
  loggedIn: boolean;
  onChange: (poll: Poll) => void;
}

// Encuesta adjunta a un post — no existe en el mockup Feed.dc.html (esa
// acción del composer, "Encuesta", no tenía nada detrás), así que el look
// sigue la misma paleta/tipografía del resto del feed en vez de calcar
// algo que no estaba dibujado. Antes de votar se ven las opciones como
// botones simples; después (o si ya votaste antes) se ven como barras con
// el % de cada una — mismo criterio que LinkedIn/Twitter.
export default function PostPoll({ postId, poll, loggedIn, onChange }: PostPollProps) {
  const [voting, setVoting] = useState(false);
  const toast = useToast();
  const hasVoted = poll.myVoteOptionId !== null;

  const vote = async (optionId: string) => {
    if (!loggedIn) {
      toast('Iniciá sesión para votar.', 'error');
      return;
    }
    if (voting) return;
    setVoting(true);
    const res = await fetch(`/api/posts/${postId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    });
    setVoting(false);
    if (res.ok) {
      const tally: { counts: Record<string, number>; myVoteOptionId: string | null; totalVotes: number } = await res.json();
      onChange({
        ...poll,
        myVoteOptionId: tally.myVoteOptionId,
        totalVotes: tally.totalVotes,
        options: poll.options.map(o => ({ ...o, voteCount: tally.counts[o.id] ?? 0 })),
      });
    } else {
      toast('No se pudo registrar tu voto.', 'error');
    }
  };

  return (
    <div className="mt-3.5">
      <p className="font-semibold text-[13.5px] text-[#1c1a17]">{poll.question}</p>
      <div className="flex flex-col gap-1.5 mt-2.5">
        {poll.options.map(option => {
          const pct = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
          const isMine = poll.myVoteOptionId === option.id;
          if (!hasVoted) {
            return (
              <button
                key={option.id}
                onClick={() => vote(option.id)}
                disabled={voting}
                className="h-9 px-3.5 rounded-[9px] border text-left text-[12.5px] font-medium text-[#1c1a17] transition-colors hover:border-[rgba(92,122,88,0.5)] hover:bg-[rgba(92,122,88,0.06)] disabled:opacity-50"
                style={{ borderColor: 'rgba(28,25,23,0.14)' }}
              >
                {option.label}
              </button>
            );
          }
          return (
            <button
              key={option.id}
              onClick={() => vote(option.id)}
              disabled={voting}
              className="relative h-9 rounded-[9px] border overflow-hidden text-left disabled:opacity-70"
              style={{ borderColor: isMine ? 'rgba(92,122,88,0.5)' : 'rgba(28,25,23,0.12)' }}
            >
              <span
                className="absolute inset-y-0 left-0 transition-[width]"
                style={{ width: `${pct}%`, background: isMine ? 'rgba(92,122,88,0.22)' : 'rgba(28,25,23,0.06)' }}
              />
              <span className="relative flex items-center justify-between h-full px-3.5 text-[12.5px] font-medium" style={{ color: isMine ? '#4a6647' : '#1c1a17' }}>
                <span className="truncate">{option.label}</span>
                <span className="shrink-0 ml-2">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10.5px] text-[rgba(28,25,23,0.42)] mt-2">
        {poll.totalVotes} voto{poll.totalVotes === 1 ? '' : 's'}
      </p>
    </div>
  );
}
