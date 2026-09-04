'use client';

import { useState } from 'react';
import { getAvailabilityInfo } from '@/lib/profile-availability';
import type { ProfileAvailability, ProfileSkill } from '@/types';

interface PreviewCardProps {
  avatarImage: string;
  name: string;
  headline: string;
  location: string;
  availability: ProfileAvailability;
  bio: string;
  skills: ProfileSkill[];
  stats: { value: string; label: string }[];
}

// "Cómo te ven" — vista previa en vivo del rail derecho. El mockup solo
// distingue "tarjeta" de "feed" en si se ve la bio o no (una card de feed
// es más compacta que la ficha completa) — se replica esa única
// diferencia en vez de inventar un layout de post que el diseño no define.
export default function PreviewCard({ avatarImage, name, headline, location, availability, bio, skills, stats }: PreviewCardProps) {
  const [mode, setMode] = useState<'card' | 'feed'>('card');
  const availabilityInfo = getAvailabilityInfo(availability);
  const initial = (name || '?').charAt(0).toUpperCase();
  const topSkills = skills.slice().sort((a, b) => b.level - a.level).slice(0, 4);

  return (
    <div className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] overflow-hidden">
      <div className="px-4 py-[13px] flex items-center gap-2 border-b border-[rgba(28,25,23,0.06)]">
        <span className="font-semibold text-[12.5px] text-[#1c1a17]">Vista previa</span>
        <span className="text-[10.5px] text-[rgba(28,25,23,0.42)]">como te ven</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMode(m => (m === 'card' ? 'feed' : 'card'))}
          className="text-[11px] font-medium text-[#4a6647] hover:underline"
        >
          {mode === 'card' ? 'Ver en el feed' : 'Ver tarjeta'}
        </button>
      </div>
      <div className="p-4 bg-[#f5f4f0]">
        <div className="rounded-[13px] bg-white border border-[rgba(28,25,23,0.08)] overflow-hidden">
          <div className="h-[52px]" style={{ background: 'repeating-linear-gradient(115deg,#2b2925 0 14px,#232120 14px 28px)' }} />
          <div className="px-3.5 pb-3.5 -mt-6">
            <div className="w-12 h-12 rounded-full border-[3px] border-white flex items-center justify-center font-semibold text-[17px] text-white/90" style={{ background: 'linear-gradient(135deg,#9aa896,#5c7a58)' }}>
              {avatarImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarImage} alt="" className="w-full h-full object-cover rounded-full" />
              ) : initial}
            </div>
            <p className="font-semibold text-[13.5px] text-[#1c1a17] mt-2">{name || 'Tu nombre'}</p>
            <p className="text-[11.5px] leading-[1.45] text-[rgba(28,25,23,0.55)] mt-0.5">{headline || 'Sumá un titular profesional'}</p>
            {location && <p className="text-[10.5px] text-[rgba(28,25,23,0.42)] mt-1">📍 {location}</p>}
            {availability !== 'busy' && (
              <span className="inline-flex h-[22px] px-[9px] items-center gap-1.5 mt-2 rounded-md text-[10.5px] font-medium" style={{ background: 'rgba(92,122,88,0.13)', color: '#3f5a3c' }}>
                {availabilityInfo.label}
              </span>
            )}
            {mode === 'card' && bio && (
              <p className="font-light text-[11px] leading-[1.6] text-[rgba(28,25,23,0.6)] mt-[9px]">{bio}</p>
            )}
            {topSkills.length > 0 && (
              <div className="flex gap-[5px] flex-wrap mt-2.5">
                {topSkills.map(sk => (
                  <span key={sk.label} className="h-[21px] px-2 rounded-md bg-[#f5f4f0] text-[10px] font-medium text-[rgba(28,25,23,0.6)] flex items-center">{sk.label}</span>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-3 pt-[11px] border-t border-[rgba(28,25,23,0.07)]">
              {stats.map(st => (
                <div key={st.label}>
                  <p className="font-semibold text-[13px] text-[#1c1a17]">{st.value}</p>
                  <p className="text-[9.5px] text-[rgba(28,25,23,0.42)]">{st.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
