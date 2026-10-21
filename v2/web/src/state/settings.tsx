import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OddsFormat } from '../domain/odds';
import { ODDS_FORMATS } from '../domain/odds';
import { readJSON, writeJSON } from './storage';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  oddsFormat: OddsFormat;
  theme: Theme;
  pinned: string[];       // track codes ("CD"), so pins survive across dates
  shortcuts: boolean;
  showUnderlays: boolean;
  sounds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  oddsFormat: 'fractional',
  theme: 'system',
  pinned: [],
  shortcuts: true,
  showUnderlays: true,
  sounds: false,
};

const KEY = 'ee.settings';

function load(): Settings {
  const raw = readJSON<Partial<Settings>>(KEY, {});
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!ODDS_FORMATS.includes(s.oddsFormat)) s.oddsFormat = 'fractional';
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  if (!Array.isArray(s.pinned)) s.pinned = [];
  s.pinned = s.pinned.filter((x) => typeof x === 'string').slice(0, 50);
  return s;
}

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  togglePin: (code: string) => void;
  isPinned: (code: string) => boolean;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children, initial }: { children: ReactNode; initial?: Partial<Settings> }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...load(), ...initial }));

  useEffect(() => {
    writeJSON(KEY, settings);
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const togglePin = useCallback((code: string) => setSettings((s) => ({
    ...s,
    pinned: s.pinned.includes(code) ? s.pinned.filter((c) => c !== code) : [...s.pinned, code],
  })), []);
  const value = useMemo<Ctx>(() => ({
    settings, update, togglePin, isPinned: (c: string) => settings.pinned.includes(c),
  }), [settings, update, togglePin]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsContext);
  if (!c) throw new Error('useSettings outside provider');
  return c;
}
