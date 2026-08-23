'use client';

import { useState, useEffect, useRef } from 'react';

interface MentionResult {
  handle: string;
  display_name: string;
  avatar_image: string | null;
}

interface MentionState {
  start: number;
  query: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

// "@" tiene que arrancar al principio del texto o después de un espacio, y
// no puede haber un espacio entre el "@" y el cursor — si no, no es una
// mención en curso sino un @ que ya quedó atrás.
function computeMentionState(text: string, caret: number): MentionState | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const between = before.slice(at + 1, caret);
  if (/\s/.test(between)) return null;
  if (at > 0 && !/\s/.test(text[at - 1])) return null;
  return { start: at, query: between };
}

// Textarea con autocompletado de @menciones — reusa GET /api/profiles/search
// (mismo endpoint que NavSearch/SendPostModal). Al elegir a alguien
// reemplaza el "@query" en curso por "@handle " y sigue escribiendo.
export default function MentionTextarea({ value, onChange, rows = 3, maxLength, placeholder, className, autoFocus }: MentionTextareaProps) {
  const [mention, setMention] = useState<MentionState | null>(null);
  const [results, setResults] = useState<MentionResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const q = mention?.query.trim();
    if (!q) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          setResults(data.profiles ?? []);
          setActiveIndex(0);
        })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mention?.query]);

  const syncCaret = (el: HTMLTextAreaElement) => {
    setMention(computeMentionState(el.value, el.selectionStart));
  };

  const selectMention = (handle: string) => {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : mention.start + 1 + mention.query.length;
    const next = `${value.slice(0, mention.start)}@${handle} ${value.slice(caret)}`;
    onChange(next);
    setMention(null);
    setResults([]);
    const pos = mention.start + handle.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(results[activeIndex].handle); }
    else if (e.key === 'Escape') { setMention(null); setResults([]); }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => { onChange(e.target.value); syncCaret(e.target); }}
        onClick={e => syncCaret(e.currentTarget)}
        onKeyUp={e => syncCaret(e.currentTarget)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => { setMention(null); setResults([]); }, 150)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
      />
      {results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-lg border border-trevo-dark/10 shadow-lg max-h-56 overflow-y-auto">
          {results.map((r, i) => (
            <li key={r.handle}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectMention(r.handle)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === activeIndex ? 'bg-trevo-dark/5' : 'hover:bg-trevo-dark/5'}`}
              >
                <div className="relative w-7 h-7 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
                  {r.avatar_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-trevo-dark/40 font-medium">{r.display_name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-trevo-dark truncate">{r.display_name}</span>
                  <span className="block text-xs text-trevo-dark/40 truncate">@{r.handle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
