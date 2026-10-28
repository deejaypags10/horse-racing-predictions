import { Link, NavLink, useLocation } from 'react-router-dom';
import { useNetState } from '../api/netState';
import { fmtDateline } from '../domain/format';
import { FreshnessLamp } from './FreshnessLamp';
import { IconDiagonal, IconGear, IconProgram, IconTicket } from './Icons';

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useDateline(): { text: string; short: string; replay: boolean } {
  const { status } = useNetState();
  const replay = status?.source === 'archive' && !!status.replay_date;
  const ymd = replay ? status!.replay_date! : todayYmd();
  return {
    text: replay ? `Replay of ${fmtDateline(ymd)}` : fmtDateline(ymd),
    short: replay ? `Replay · ${fmtDateline(ymd, { short: true })}` : fmtDateline(ymd, { short: true }),
    replay,
  };
}

export function Masthead() {
  const d = useDateline();
  return (
    <header className="masthead">
      <div className="mast-inner">
        <Link to="/" className="wordmark" aria-label="Equine Edge, today's racing">
          <span className="wordmark-full" aria-hidden="true">Equine Edge</span>
          <span className="wordmark-mono" aria-hidden="true">EE</span>
        </Link>
        <span className="dateline">
          <span className="dateline-long">{d.text}</span>
          <span className="dateline-short">{d.short}</span>
        </span>
        <nav className="mast-nav" aria-label="Main">
          <NavLink to="/" end>Today</NavLink>
          <NavLink to="/tickets">Tickets</NavLink>
          <NavLink to="/model">Model</NavLink>
        </nav>
        <FreshnessLamp />
        <NavLink to="/settings" className="mast-settings" aria-label="Settings" title="Settings">
          <IconGear />
        </NavLink>
      </div>
    </header>
  );
}

export function TabBar() {
  const loc = useLocation();
  const today = loc.pathname === '/' || loc.pathname.startsWith('/t/') || loc.pathname.startsWith('/r/');
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" className={() => (today ? 'active' : '')} aria-current={today ? 'page' : undefined}><IconProgram /><span>Today</span></NavLink>
      <NavLink to="/tickets"><IconTicket /><span>Tickets</span></NavLink>
      <NavLink to="/model"><IconDiagonal /><span>Model</span></NavLink>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Model estimates, not advice. Bet only what you can afford to lose. Problem gambling help: <a href="tel:18004267537">1-800-GAMBLER</a>.</p>
      <p className="site-footer-meta">Equine Edge doesn't place bets. Press <kbd>?</kbd> for keyboard shortcuts.</p>
    </footer>
  );
}
