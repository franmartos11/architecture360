'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface SearchResult {
  handle: string;
  display_name: string;
  avatar_image: string | null;
  account_type: 'person' | 'company';
}

export default function NavSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => setResults(data.profiles ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const goToDirectory = () => {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/directorio?q=${encodeURIComponent(query.trim())}`);
  };

  const goToProfile = (handle: string) => {
    setOpen(false);
    setQuery('');
    router.push(`/portfolio/${handle}`);
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-sm">
      <form onSubmit={e => { e.preventDefault(); goToDirectory(); }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar personas y estudios..."
          className="w-full px-3.5 py-1.5 rounded-lg bg-white/10 text-sm text-white placeholder:text-white/40 border border-white/10 focus:bg-white/15 focus:border-white/25 outline-none transition-colors"
        />
      </form>

      {open && query.trim() && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[16rem] bg-white rounded-xl shadow-lg border border-trevo-dark/10 overflow-hidden z-50">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-trevo-dark/40">Sin resultados</p>
          ) : (
            <div className="divide-y divide-trevo-dark/5">
              {results.map(r => (
                <button
                  key={r.handle}
                  onClick={() => goToProfile(r.handle)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-trevo-dark/5 transition-colors text-left"
                >
                  <div className={`relative w-8 h-8 overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center ${r.account_type === 'company' ? 'rounded-lg' : 'rounded-full'}`}>
                    {r.avatar_image ? (
                      <Image src={r.avatar_image} alt={r.display_name} fill sizes="32px" className="object-cover" />
                    ) : (
                      <span className="text-xs text-trevo-dark/40 font-medium">{r.display_name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-trevo-dark truncate">{r.display_name}</p>
                    <p className="text-xs text-trevo-dark/40 truncate">@{r.handle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={goToDirectory}
            className="w-full px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-trevo-dark/5 transition-colors border-t border-trevo-dark/5"
          >
            Ver todos los resultados →
          </button>
        </div>
      )}
    </div>
  );
}
