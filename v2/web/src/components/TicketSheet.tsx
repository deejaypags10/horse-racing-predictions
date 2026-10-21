import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { RaceResponse, TicketKind } from '../api/types';
import { exactaProb, orderModel, trifectaProb } from '../domain/exotics';
import { fmtEdge, fmtMoney, fmtPct } from '../domain/format';
import { decimalToWire, fmtOdds, parseOddsInput } from '../domain/odds';
import { activeInterests } from '../domain/race';
import { useSettings } from '../state/settings';
import { useToast } from '../state/toast';
import { Cloth } from './Cloth';
import { useMtp } from './Mtp';
import { fmtMtp } from '../domain/mtp';

export interface TicketPreset {
  kind: TicketKind;
  selection: string[];
}

const KINDS: { k: TicketKind; label: string; n: number }[] = [
  { k: 'win', label: 'Win', n: 1 }, { k: 'place', label: 'Place', n: 1 }, { k: 'show', label: 'Show', n: 1 },
  { k: 'exacta', label: 'Exacta', n: 2 }, { k: 'trifecta', label: 'Tri', n: 3 },
];

export function TicketSheet({ open, onClose, data, preset, stale }: {
  open: boolean;
  onClose: () => void;
  data: RaceResponse;
  preset: TicketPreset | null;
  stale: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const { settings } = useSettings();
  const toast = useToast();
  const fmt = settings.oddsFormat;
  const interests = useMemo(() => activeInterests(data.runners), [data.runners]);
  const [kind, setKind] = useState<TicketKind>('win');
  const [sel, setSel] = useState<string[]>([]);
  const [stake, setStake] = useState('10.00');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mtp = useMtp(data.race.post_time, data.race.status);

  const need = KINDS.find((x) => x.k === kind)!.n;
  const lead = interests.find((i) => i.key === sel[0])?.lead;

  const prefillPrice = (k: TicketKind, first: string | undefined) => {
    const r = interests.find((i) => i.key === first)?.lead;
    if (k === 'win' && r && r.live_decimal && !stale) setPrice(fmtOdds(r.live_decimal, fmt, { raw: r.live_odds }));
    else setPrice('');
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      const k = preset?.kind ?? 'win';
      const n = KINDS.find((x) => x.k === k)!.n;
      const s = preset?.selection?.length ? preset.selection.slice(0, n) : [];
      setKind(k);
      setSel(s);
      setErr(null);
      setNote('');
      prefillPrice(k, s[0]);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose_ = () => {
      onClose();
      window.setTimeout(() => returnTo.current?.focus?.(), 0);
    };
    d.addEventListener('close', onClose_);
    return () => d.removeEventListener('close', onClose_);
  }, [onClose]);

  const changeKind = (k: TicketKind) => {
    setKind(k);
    const n = KINDS.find((x) => x.k === k)!.n;
    const s = sel.slice(0, n);
    setSel(s);
    prefillPrice(k, s[0]);
  };

  const setPick = (i: number, v: string) => {
    const s = [...sel];
    s[i] = v;
    const clean = s.slice(0, need);
    setSel(clean);
    if (i === 0) prefillPrice(kind, v);
  };

  const om = useMemo(() => orderModel(interests.map((i) => ({ key: i.key, p: i.p }))), [interests]);
  const complete = sel.filter(Boolean).length === need && new Set(sel).size === need;
  let chance: number | null = null;
  if (complete) {
    const m = lead?.model;
    if (kind === 'win') chance = m?.p_model ?? null;
    else if (kind === 'place') chance = m?.p_top2 ?? null;
    else if (kind === 'show') chance = m?.p_top3 ?? null;
    else if (kind === 'exacta') chance = exactaProb(om, sel[0], sel[1]);
    else chance = trifectaProb(om, sel[0], sel[1], sel[2]);
  }

  const priceRequired = kind === 'win' && (stale || !lead?.live_decimal);
  const parsedPrice = price.trim() ? parseOddsInput(price, fmt) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const st = parseFloat(stake.replace(/[$,\s]/g, ''));
    if (!complete) { setErr(need === 1 ? 'Pick a runner.' : `Pick ${need} different runners in finishing order.`); return; }
    if (!(st > 0) || st > 100_000) { setErr('Stake must be between $0.01 and $100,000.'); return; }
    if (price.trim() && !parsedPrice) { setErr('Price should look like 5-2, 9/5, 3.50 or +250.'); return; }
    if (priceRequired && !parsedPrice) { setErr('Type the price you took. Live odds are missing or out of date.'); return; }
    setSaving(true);
    try {
      const t = await api.createTicket({
        race_id: data.race.id, kind, selection: sel, stake: Math.round(st * 100) / 100,
        ...(parsedPrice && (kind === 'win' || kind === 'place' || kind === 'show') ? { odds_taken: decimalToWire(parsedPrice) } : {}),
        ...(note.trim() ? { note: note.trim().slice(0, 280) } : {}),
      });
      const label = KINDS.find((x) => x.k === kind)!.label;
      toast({
        text: `Ticket saved — ${data.race.track_code} R${data.race.number} ${label} ${t.selection.map((s) => `#${s}`).join('-')} ${fmtMoney(t.stake)}${t.odds_taken ? ` at ${fmtOdds(t.odds_taken, fmt)}` : ''}.`,
        link: { to: '/tickets', label: 'View tickets' },
      });
      onClose();
    } catch (ex) {
      setErr(ex instanceof ApiError ? sentence(ex.message) : 'Couldn’t save the ticket.');
    } finally {
      setSaving(false);
    }
  };

  const closed = data.race.status !== 'open';

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="ticket-title" onCancel={() => onClose()}>
      <form method="dialog" className="sheet-form" onSubmit={submit} noValidate>
        <header className="sheet-head">
          <div>
            <h2 id="ticket-title" className="sheet-title">Paper ticket</h2>
            <p className="sheet-sub num">{data.race.track_name} R{data.race.number} · {fmtMtp(mtp) === '—' ? 'post ' + new Date(data.race.post_time ?? '').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : `${fmtMtp(mtp)}${mtp.kind === 'mtp' || mtp.kind === 'soon' ? ' MTP' : ''}`}</p>
          </div>
          <button type="button" className="btn-icon sheet-x" aria-label="Close" onClick={onClose}>✕</button>
        </header>

        <div className="sheet-body">
          {closed && <p className="banner banner-warn">Betting on this race is closed. Tickets can only be saved before post.</p>}
          <fieldset className="field">
            <legend className="field-label">Bet</legend>
            <div className="seg" role="group" aria-label="Bet type">
              {KINDS.map((x) => (
                <button key={x.k} type="button" className="seg-btn" aria-pressed={kind === x.k} onClick={() => changeKind(x.k)}>{x.label}</button>
              ))}
            </div>
          </fieldset>

          {Array.from({ length: need }, (_, i) => (
            <label className="field field-row" key={i}>
              <span className="field-label">{need === 1 ? 'Pick' : ['1st', '2nd', '3rd'][i]}</span>
              <span className="pick-select">
                {sel[i] ? <Cloth program={sel[i]} breed={data.race.breed} size="sm" label={false} /> : <span className="cloth cloth-sm cloth-neutral" aria-hidden="true" />}
                <select value={sel[i] ?? ''} onChange={(e) => setPick(i, e.target.value)} required>
                  <option value="">Choose a runner</option>
                  {interests.map((it) => (
                    <option key={it.key} value={it.key} disabled={sel.includes(it.key) && sel[i] !== it.key}>#{it.key} {it.lead.name}</option>
                  ))}
                </select>
              </span>
            </label>
          ))}

          <label className="field field-row">
            <span className="field-label">Stake $</span>
            <input className="input num" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} aria-describedby="stake-hint" />
            <span id="stake-hint" className="visually-hidden">Paper stake in dollars</span>
          </label>

          {(kind === 'win' || kind === 'place' || kind === 'show') && (
            <label className="field field-row">
              <span className="field-label">{kind === 'win' ? 'Price taken' : 'Expected price'}</span>
              <input className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder={kind === 'win' ? (priceRequired ? 'Required' : '5-2') : 'Optional'} aria-required={priceRequired} />
              {kind === 'win' && lead && (
                <span className="field-hint num">
                  {lead.live_decimal ? `live ${fmtOdds(lead.live_decimal, fmt, { raw: lead.live_odds })}${stale ? ' · stale' : ''}` : lead.morning_line ? `ML ${fmtOdds(lead.morning_line_decimal, fmt, { raw: lead.morning_line })} · no tote yet` : ''}
                </span>
              )}
              {kind !== 'win' && <span className="field-hint">Pools settle after the race.</span>}
            </label>
          )}

          <label className="field field-row">
            <span className="field-label">Note</span>
            <input className="input" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <footer className="sheet-foot">
          <p className="sheet-model num">
            {chance != null ? (
              <>Model chance <span className="model-ink">{fmtPct(chance)}</span> · fair {fmtOdds(1 / chance, fmt, { round: 'tote' })}
                {kind === 'win' && lead?.model?.edge_pts != null && <> · {fmtEdge(lead.model.edge_pts)} pts{lead.model.price_source === 'morning_line' ? ' vs ML' : ''}</>}
              </>
            ) : 'Pick a selection to see the model chance.'}
          </p>
          <p className="fineprint">This records a paper ticket only. No money is wagered.</p>
          {err && <p className="form-error" role="alert" aria-live="assertive">{err}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || closed} title={closed ? 'Betting on this race is closed' : undefined}>{saving ? 'Saving…' : 'Save ticket'}</button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

function sentence(s: string): string {
  const t = s.trim();
  if (!t) return 'Couldn’t save the ticket.';
  return t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
}
