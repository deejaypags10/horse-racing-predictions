import { afterEach, describe, expect, it } from 'vitest';
import { resetClock, serverNow, syncClock } from '../domain/clock';
import { fmtMtp, fmtMtpHero, mtpState } from '../domain/mtp';

const POST = '2026-06-06T14:45:00+00:00';
const at = (iso: string) => Date.parse(iso);

describe('MTP countdown', () => {
  it('counts whole minutes and colours by threshold', () => {
    const s = mtpState(POST, 'open', at('2026-06-06T14:20:07Z'));
    expect(s.kind).toBe('mtp');
    expect(fmtMtp(s)).toBe('24');
    expect(s.tone).toBe('calm');
    expect(mtpState(POST, 'open', at('2026-06-06T14:37:00Z')).tone).toBe('near');
    expect(mtpState(POST, 'open', at('2026-06-06T14:41:00Z')).tone).toBe('live');
  });
  it('shows <1, AT POST, OFF and official states', () => {
    expect(fmtMtp(mtpState(POST, 'open', at('2026-06-06T14:44:30Z')))).toBe('<1');
    expect(fmtMtp(mtpState(POST, 'open', at('2026-06-06T14:45:30Z')))).toBe('AT POST');
    expect(fmtMtp(mtpState(POST, 'open', at('2026-06-06T14:50:00Z')))).toBe('OFF');
    expect(fmtMtp(mtpState(POST, 'closed', at('2026-06-06T14:00:00Z')))).toBe('OFF');
    expect(fmtMtp(mtpState(POST, 'official', at('2026-06-06T14:00:00Z')))).toBe('OFFICIAL');
  });
  it('shows "—" beyond an hour and seconds only under two minutes in the hero', () => {
    expect(fmtMtp(mtpState(POST, 'open', at('2026-06-06T12:00:00Z')))).toBe('—');
    expect(fmtMtpHero(mtpState(POST, 'open', at('2026-06-06T14:43:36Z')))).toBe('1:24');
    expect(fmtMtpHero(mtpState(POST, 'open', at('2026-06-06T14:40:00Z')))).toBe('5');
  });
});

describe('server clock', () => {
  afterEach(() => resetClock());
  it('derives now from the server clock plus client elapsed time', () => {
    const client0 = Date.parse('2026-10-21T18:00:00Z');
    syncClock('2026-06-06T14:20:07+00:00', client0);
    expect(serverNow(client0)).toBe(at('2026-06-06T14:20:07Z'));
    expect(serverNow(client0 + 90_000)).toBe(at('2026-06-06T14:21:37Z'));
    const s = mtpState(POST, 'open', serverNow(client0 + 60_000));
    expect(s.minutes).toBe(23);
  });
  it('ignores bad timestamps', () => {
    syncClock('nope', 0);
    expect(serverNow(1000)).toBe(1000);
  });
});
