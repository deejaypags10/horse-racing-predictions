import { useEffect, useRef } from 'react';

const ROWS: [string, string][] = [
  ['?', 'Show this help'],
  ['/', 'Filter tracks (Today)'],
  ['g then t / k / m', 'Go to Today / Tickets / Model'],
  ['n', 'Open the next race to post'],
  ['j / k', 'Next / previous race (race view) or row (lists)'],
  ['[ / ]', 'Previous / next track by next post'],
  ['↑ / ↓', 'Move between runners'],
  ['Enter', 'Expand runner / open race'],
  ['x', 'What-if scratch the focused runner'],
  ['Shift + X', 'Clear all what-if scratches'],
  ['e', 'Jump to exotics'],
  ['s', 'Cycle sort: Program → Model → Edge → Odds'],
  ['t', 'Paper ticket for the focused runner'],
  ['b', 'Open race on TwinSpires'],
  ['o', 'Cycle odds format'],
  ['Esc', 'Close dialog'],
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ret = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { ret.current = document.activeElement as HTMLElement; d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const h = () => { onClose(); ret.current?.focus?.(); };
    d.addEventListener('close', h);
    return () => d.removeEventListener('close', h);
  }, [onClose]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="kb-title">
      <div className="modal-head">
        <h2 id="kb-title" className="sheet-title">Keyboard shortcuts</h2>
        <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <table className="kb-table">
        <caption className="visually-hidden">Keyboard shortcuts</caption>
        <tbody>
          {ROWS.map(([k, v]) => (
            <tr key={k}><th scope="row"><kbd>{k}</kbd></th><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="fineprint">Single-key shortcuts can be turned off in Settings.</p>
    </dialog>
  );
}
