import { useEffect, useRef } from 'react';
import { useSettings } from './settings';

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function dialogOpen(): boolean {
  return !!document.querySelector('dialog[open]');
}

/**
 * Single-key shortcuts (DESIGN 3.3). Ignored while typing, with Ctrl/Meta/Alt,
 * while a dialog is open, or when the user turned shortcuts off (WCAG 2.1.4).
 * Return true from the handler to mark the key as handled.
 */
export function useShortcuts(handler: (e: KeyboardEvent) => boolean | void, enabled = true): void {
  const { settings } = useSettings();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled || !settings.shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || dialogOpen()) return;
      if (ref.current(e) === true) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, settings.shortcuts]);
}

/** j/k (and ↑/↓ when `arrows`) move focus between items matching `selector` inside `root`. */
export function moveFocus(root: HTMLElement | null, selector: string, dir: 1 | -1): boolean {
  if (!root) return false;
  const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((x) => x.offsetParent !== null || x.getClientRects().length);
  if (!items.length) return false;
  const cur = items.findIndex((x) => x === document.activeElement || x.contains(document.activeElement));
  const next = cur < 0 ? (dir === 1 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, cur + dir));
  items[next].focus();
  items[next].scrollIntoView({ block: 'nearest' });
  return true;
}
