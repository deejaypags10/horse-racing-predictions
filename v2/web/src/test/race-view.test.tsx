import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { SettingsProvider } from '../state/settings';
import { resetClock } from '../domain/clock';
import raceJson from './fixtures/race.json';
import boardJson from './fixtures/board.json';
import whatifJson from './fixtures/race_whatif.json';
import type { RaceResponse } from '../api/types';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T; }

function mockFetch(race: unknown, calls: string[] = []) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes('/api/races/') ? (url.includes('whatif=') ? whatifJson : race)
      : url.includes('/api/board') ? boardJson
      : url.includes('/api/status') ? (boardJson as { status: unknown }).status
      : { error: 'not_found', detail: 'nope' };
    const status = url.includes('/api/races/') || url.includes('/api/board') || url.includes('/api/status') ? 200 : 404;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsProvider initial={{ oddsFormat: 'fractional', shortcuts: true }}>
        <App />
      </SettingsProvider>
    </MemoryRouter>,
  );
}

describe('race view', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });
  afterEach(() => { vi.unstubAllGlobals(); resetClock(); });

  it('renders the runner table from the API fixture', async () => {
    vi.stubGlobal('fetch', mockFetch(raceJson));
    renderAt('/r/IJN-20260606-1');
    expect(await screen.findByRole('heading', { level: 1, name: /Race 1/ })).toBeTruthy();
    const table = screen.getByRole('table', { name: /Race 1 runners, 7 betting interests/ });
    const rows = within(table).getAllByRole('row').filter((r) => r.classList.contains('runner'));
    expect(rows).toHaveLength(7);
    // Row header is the horse; model %, live odds, fair odds and edge are in the row.
    const first = rows[0];
    expect(within(first).getByRole('rowheader').textContent).toContain("Z's Fireball");
    expect(first.textContent).toContain('13%');      // p_model 0.12723
    expect(first.textContent).toContain('9-2');      // live odds as printed
    expect(first.textContent).toContain('6-1');      // morning line
    expect(first.textContent).toContain('7-1');      // fair odds
    expect(first.textContent).toContain('−1.3'); // edge with true minus
    // MTP computed from server now (14:20:08) to post 14:45 => 24.
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('24 minutes to post');
    // Replay: bet button disabled with the explanation.
    const bet = screen.getAllByRole('button', { name: /Bet on TwinSpires/ })[0];
    expect((bet as HTMLButtonElement).disabled).toBe(true);
    expect(bet.getAttribute('title')).toBe('Replay — betting links are off');
    // Replay ribbon.
    expect(screen.getByRole('note', { name: 'Replay mode' })).toBeTruthy();
  });

  it('shows the model block once per coupled interest', async () => {
    const r = clone(raceJson) as unknown as RaceResponse;
    r.runners[0].coupled = true;
    r.runners[2] = { ...clone(r.runners[0]), program: '1A', name: 'Entry Mate', interest: '1', coupled: true };
    vi.stubGlobal('fetch', mockFetch(r));
    renderAt('/r/IJN-20260606-1');
    await screen.findByRole('heading', { level: 1, name: /Race 1/ });
    expect(screen.getByText(/Coupled with #1: one betting interest/)).toBeTruthy();
    expect(screen.getAllByText('Entry 1').length).toBe(2);
  });

  it('requests a what-if recompute and shows the banner', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', mockFetch(raceJson, calls));
    renderAt('/r/IJN-20260606-1?whatif=1');
    expect(await screen.findByText(/What-if: without #1/)).toBeTruthy();
    expect(calls.some((c) => c.includes('/api/races/IJN-20260606-1?whatif=1'))).toBe(true);
    expect(screen.getByText('WHAT-IF')).toBeTruthy();
  });

  it('expands a runner drawer with recent starts and plain-language notes', async () => {
    vi.stubGlobal('fetch', mockFetch(raceJson));
    renderAt('/r/IJN-20260606-1');
    await screen.findByRole('heading', { level: 1, name: /Race 1/ });
    const row = screen.getAllByRole('row').find((x) => x.textContent?.includes('Powerful Justice'))!;
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('Recent starts in our data')).toBeTruthy());
    expect(screen.getByText(/Highest model chance in the field of 7/)).toBeTruthy();
  });
});
