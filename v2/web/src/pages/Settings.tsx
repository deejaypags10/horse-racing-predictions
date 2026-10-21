import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fmtOdds, ODDS_FORMATS, type OddsFormat } from '../domain/odds';
import { useSettings, type Theme } from '../state/settings';

const ODDS_NAME: Record<OddsFormat, string> = { fractional: 'Fractional (US tote)', decimal: 'Decimal', american: 'American (moneyline)' };

export function SettingsPage() {
  const { settings, update, togglePin } = useSettings();
  useEffect(() => { document.title = 'Settings · Equine Edge'; }, []);
  return (
    <div className="page settings prose-page">
      <h1 className="page-title">Settings</h1>
      <p className="lede">Stored on this device only.</p>

      <fieldset className="set-group">
        <legend>Odds format</legend>
        {ODDS_FORMATS.map((f) => (
          <label key={f} className="radio">
            <input type="radio" name="odds" checked={settings.oddsFormat === f} onChange={() => update({ oddsFormat: f })} />
            <span>{ODDS_NAME[f]}</span>
            <span className="radio-eg num">{[2.2, 3.5, 11].map((x) => fmtOdds(x, f)).join(' · ')}</span>
          </label>
        ))}
        <p className="set-hint">Press <kbd>o</kbd> anywhere to cycle formats.</p>
      </fieldset>

      <fieldset className="set-group">
        <legend>Theme</legend>
        {(['system', 'light', 'dark'] as Theme[]).map((t) => (
          <label key={t} className="radio">
            <input type="radio" name="theme" checked={settings.theme === t} onChange={() => update({ theme: t })} />
            <span>{t === 'system' ? 'Match system' : t === 'light' ? 'Newsprint (light)' : 'Tote board (dark)'}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="set-group">
        <legend>Pinned tracks</legend>
        {settings.pinned.length === 0 ? (
          <p className="set-hint">No pinned tracks. Use the star next to a track on <Link to="/">Today</Link>.</p>
        ) : (
          <ul className="pin-list">
            {settings.pinned.map((c) => (
              <li key={c}><span className="num">{c}</span> <button type="button" className="btn btn-secondary btn-sm" onClick={() => togglePin(c)} aria-label={`Remove pin for ${c}`}>Remove</button></li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="set-group">
        <legend>Behaviour</legend>
        <Toggle label="Single-key keyboard shortcuts" hint="Turn off if you use speech input or a screen reader that conflicts." checked={settings.shortcuts} onChange={(v) => update({ shortcuts: v })} />
        <Toggle label="Colour underlays" hint="When off, negative edges are shown in neutral ink." checked={settings.showUnderlays} onChange={(v) => update({ showUnderlays: v })} />
        <Toggle label="Call-to-post sound" hint="A short bugle when the open race reaches post. Never plays with reduced motion." checked={settings.sounds} onChange={(v) => update({ sounds: v })} />
      </fieldset>

      <p className="set-hint">Times are shown in your device's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-text"><span>{label}</span><span className="set-hint">{hint}</span></span>
    </label>
  );
}
