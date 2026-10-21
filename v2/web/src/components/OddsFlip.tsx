import { useEffect, useRef, useState } from 'react';
import { oddsSpeech } from '../domain/odds';

/**
 * Tote-board digit flip (DESIGN 9.1). Each changed character flips; the cell
 * gets a lamp underline for 1.5s. Reduced motion: instant swap (CSS).
 * A cell flips at most once per 5s.
 */
export function OddsFlip({ text, className = '' }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  const [prev, setPrev] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const lastFlip = useRef(0);
  const pending = useRef<number | undefined>();

  useEffect(() => {
    if (text === shown) return;
    const apply = () => {
      lastFlip.current = Date.now();
      setPrev(shown);
      setShown(text);
      setChanged(true);
    };
    const since = Date.now() - lastFlip.current;
    window.clearTimeout(pending.current);
    if (since >= 5000) apply();
    else pending.current = window.setTimeout(apply, 5000 - since);
    return () => window.clearTimeout(pending.current);
  }, [text, shown]);

  useEffect(() => {
    if (!changed) return;
    const t = window.setTimeout(() => { setChanged(false); setPrev(null); }, 1500);
    return () => window.clearTimeout(t);
  }, [changed, shown]);

  const chars = shown.split('');
  const old = (prev ?? '').padStart(chars.length, ' ').slice(-chars.length).split('');
  return (
    <span className={`flip ${changed ? 'is-changed' : ''} ${className}`} aria-label={oddsSpeech(shown)} role="text">
      {chars.map((c, i) => {
        const did = prev !== null && old[i] !== c;
        return (
          <span key={`${i}-${c}-${did ? lastFlip.current : 0}`} className={`flip-ch${did ? ' is-flipping' : ''}`} style={did ? { animationDelay: `${i * 40}ms` } : undefined} aria-hidden="true">
            {did && <span className="flip-old">{old[i]}</span>}
            <span className="flip-new">{c}</span>
          </span>
        );
      })}
    </span>
  );
}
