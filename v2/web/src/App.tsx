import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from './api/client';
import { useNetState } from './api/netState';
import { Masthead, SiteFooter, TabBar } from './components/Chrome';
import { ReplayRibbon } from './components/ReplayRibbon';
import { ShortcutHelp } from './components/ShortcutHelp';
import { nextOddsFormat } from './domain/odds';
import { isClockSynced } from './domain/clock';
import { BoardPage } from './pages/Board';
import { ModelPage } from './pages/Model';
import { NotFoundPage } from './pages/NotFound';
import { RacePage } from './pages/Race';
import { SettingsPage } from './pages/Settings';
import { TicketsPage } from './pages/Tickets';
import { TrackPage } from './pages/Track';
import { BoardProvider, useBoard } from './state/board';
import { NowProvider } from './state/clock';
import { useShortcuts } from './state/keys';
import { useSettings } from './state/settings';
import { ToastProvider, useToast } from './state/toast';

function GlobalKeys({ onHelp }: { onHelp: () => void }) {
  const nav = useNavigate();
  const { settings, update } = useSettings();
  const board = useBoard();
  const toast = useToast();
  const g = useRef(0);
  useShortcuts((e) => {
    if (e.key === '?') { onHelp(); return true; }
    if (e.key === 'g') { g.current = Date.now(); return true; }
    if (Date.now() - g.current < 1200) {
      g.current = 0;
      if (e.key === 't') { nav('/'); return true; }
      if (e.key === 'k') { nav('/tickets'); return true; }
      if (e.key === 'm') { nav('/model'); return true; }
    }
    if (e.key === 'o') {
      const f = nextOddsFormat(settings.oddsFormat);
      update({ oddsFormat: f });
      toast({ text: `Odds shown as ${f}.` });
      return true;
    }
    if (e.key === 'n') {
      const go = (id?: string) => (id ? nav(`/r/${id}`) : toast({ text: 'Nothing is open to bet right now.' }));
      if (board.data) go(board.data.next_up[0]?.race_id);
      else api.board().then((b) => go(b.next_up[0]?.race_id)).catch(() => toast({ text: 'Couldn’t find the next race.' }));
      return true;
    }
    return false;
  });
  return null;
}

/** /t/CD (no date) redirects to today's CD card. */
function TrackOrBare() {
  const { trackId = '' } = useParams();
  return /-\d{8}$/.test(trackId) ? <TrackPage /> : <BareTrackFrom code={trackId} />;
}
function BareTrackFrom({ code }: { code: string }) {
  const board = useBoard();
  if (!board.data) return board.error ? <NotFoundPage what={`a card for ${code.toUpperCase()}`} /> : null;
  const t = board.data.tracks.find((x) => x.code.toUpperCase() === code.toUpperCase());
  return t ? <Navigate to={`/t/${t.id}`} replace /> : <NotFoundPage what={`a card for ${code.toUpperCase()} today`} />;
}

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="page crash">
          <h1 className="page-title">Something broke on this page.</h1>
          <p className="lede">Nothing you saved is lost.</p>
          <p className="crash-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn btn-secondary" href="/">Go to Today</a>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const loc = useLocation();
  const net = useNetState();
  const [help, setHelp] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);
  const boardScreens = loc.pathname === '/' || loc.pathname.startsWith('/t/') || loc.pathname.startsWith('/r/');

  useEffect(() => {
    // Keep the ribbon/lamp right even on pages that don't otherwise hit /api/status.
    if (!net.status) api.status().catch(() => {});
    // /api/status and /api/tickets carry no `now`; align the source clock once
    // so replay countdowns are right on every page.
    if (!isClockSynced() && !boardScreens) api.board().catch(() => {});
  }, [net.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <ToastProvider>
      <NowProvider>
        <BoardProvider enabled={boardScreens}>
          <a className="skip-link" href="#main">Skip to races</a>
          {net.status && <ReplayRibbon status={net.status} />}
          <Masthead />
          <main id="main" tabIndex={-1} className={loc.pathname.startsWith('/r/') ? 'is-race' : ''}>
            <ErrorBoundary resetKey={loc.pathname}>
              <Routes>
                <Route path="/" element={<BoardPage />} />
                <Route path="/t/:trackId" element={<TrackOrBare />} />
                <Route path="/r/:raceId" element={<RacePage />} />
                <Route path="/tickets" element={<TicketsPage />} />
                <Route path="/model" element={<ModelPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ErrorBoundary>
          </main>
          <SiteFooter />
          <TabBar />
          <GlobalKeys onHelp={() => setHelp(true)} />
          <ShortcutHelp open={help} onClose={closeHelp} />
          <div id="announcer" className="visually-hidden" aria-live="polite" />
        </BoardProvider>
      </NowProvider>
    </ToastProvider>
  );
}

