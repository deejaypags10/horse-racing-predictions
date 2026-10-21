import { useMemo, useState } from 'react';
import type { Breed, RaceResponse } from '../api/types';
import { boxProbability, exactaProb, orderModel, trifectaProb } from '../domain/exotics';
import { fmtMoney, fmtPct } from '../domain/format';
import { activeInterests } from '../domain/race';
import { Cloth } from './Cloth';

type Kind = 'exacta' | 'trifecta';

function Combo({ combo, breed }: { combo: string[]; breed: Breed }) {
  return (
    <span className="combo" role="img" aria-label={combo.map((c) => `number ${c}`).join(' then ')}>
      {combo.map((c, i) => (
        <span key={c} className="combo-part">
          {i > 0 && <span className="combo-dash" aria-hidden="true" />}
          <Cloth program={c} breed={breed} size="xs" label={false} />
        </span>
      ))}
    </span>
  );
}

export function ExoticsPanel({ data, onTicket }: { data: RaceResponse; onTicket: (kind: Kind, selection: string[]) => void }) {
  const [kind, setKind] = useState<Kind>('exacta');
  const [base, setBase] = useState<Record<Kind, 1 | 2>>({ exacta: 2, trifecta: 1 });
  const [showAll, setShowAll] = useState(false);
  const [box, setBox] = useState<string[]>([]);
  const breed = data.race.breed;
  const interests = useMemo(() => activeInterests(data.runners), [data.runners]);
  const om = useMemo(() => orderModel(interests.map((i) => ({ key: i.key, p: i.p }))), [interests]);
  const b = base[kind];
  const combos = kind === 'exacta'
    ? data.exotics.exacta.map((c) => ({ combo: c.combo, p: c.p }))
    : data.exotics.trifecta.map((c) => ({ combo: c.combo, p: c.p }));
  const shown = showAll ? combos : combos.slice(0, 10);
  const official = data.result?.exotics?.[kind];
  const finishOrder = data.result ? [...data.result.finish].sort((a, c) => a.position - c.position).map((f) => f.program) : [];
  const winningCombo = finishOrder.slice(0, kind === 'exacta' ? 2 : 3);
  const winP = winningCombo.length === (kind === 'exacta' ? 2 : 3)
    ? (kind === 'exacta' ? exactaProb(om, winningCombo[0], winningCombo[1]) : trifectaProb(om, winningCombo[0], winningCombo[1], winningCombo[2]))
    : 0;
  const boxRes = boxProbability(om, box, kind);
  const need = kind === 'exacta' ? 2 : 3;
  const toggleBox = (k: string) => setBox((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));

  if (!interests.length) {
    return <p className="muted">Exotic chances need a model opinion for this race.</p>;
  }

  return (
    <div className="exotics">
      <div className="exotics-controls">
        <div className="seg" role="tablist" aria-label="Bet type">
          {(['exacta', 'trifecta'] as Kind[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className="seg-btn" onClick={() => { setKind(k); setShowAll(false); }}>
              {k === 'exacta' ? 'Exacta' : 'Trifecta'}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Base amount">
          {([1, 2] as const).map((v) => (
            <button key={v} type="button" className="seg-btn" aria-pressed={b === v} onClick={() => setBase((s) => ({ ...s, [kind]: v }))}>${v}</button>
          ))}
        </div>
      </div>

      {official != null && winningCombo.length === need && (
        <p className="exotics-official">
          Official {kind} <Combo combo={winningCombo} breed={breed} /> paid <strong className="num">{fmtMoney(official)}</strong> for ${kind === 'exacta' ? 2 : 1}.
          {' '}We had it at <span className="model-ink num">{fmtPct(winP)}</span>, fair <span className="num">{winP ? fmtMoney((kind === 'exacta' ? 2 : 1) / winP) : '—'}</span>.
        </p>
      )}

      <div role="tabpanel" aria-label={kind}>
        <table className="exotics-table">
          <caption className="visually-hidden">Top {kind} combinations by model chance, fair payout for a ${b} base</caption>
          <thead>
            <tr>
              <th scope="col">Combo</th>
              <th scope="col" className="num">Chance</th>
              <th scope="col" className="num">Fair ${b}</th>
              <th scope="col" className="c-add"><span className="visually-hidden">Ticket</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.combo.join('-')}>
                <th scope="row"><Combo combo={c.combo} breed={breed} /></th>
                <td className="num model-ink">{fmtPct(c.p)}</td>
                <td className="num">{fmtMoney(b / c.p)}</td>
                <td className="c-add">
                  <button type="button" className="btn-icon" aria-label={`Paper ticket: ${kind} ${c.combo.join('-')}`} title="Add paper ticket" onClick={() => onTicket(kind, c.combo)} disabled={data.race.status !== 'open'}>+</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {combos.length > 10 && (
          <button type="button" className="btn-link" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show top 10' : `Show ${combos.length}`}</button>
        )}
      </div>

      <div className="box-builder">
        <p className="box-title">Box builder</p>
        <div className="box-picks" role="group" aria-label={`Runners to box in a ${kind}`}>
          {interests.map((i) => (
            <button key={i.key} type="button" className="box-pick" aria-pressed={box.includes(i.key)} onClick={() => toggleBox(i.key)} aria-label={`Number ${i.key} ${i.lead.name}`}>
              <Cloth program={i.key} breed={breed} size="sm" label={false} />
            </button>
          ))}
        </div>
        {box.length >= need ? (
          <p className="box-result num">
            {kind === 'exacta' ? 'Exacta' : 'Trifecta'} box {box.join('-')}: {boxRes.combos} combos · costs {fmtMoney(boxRes.combos * b)} · hits <span className="model-ink">{fmtPct(boxRes.p)}</span> · break-even average payout {boxRes.p ? fmtMoney((boxRes.combos * b) / boxRes.p) : '—'}
          </p>
        ) : (
          <p className="box-result muted">Pick {need} or more runners to see the box chance.</p>
        )}
      </div>

      <p className="fineprint">Fair payout = base ÷ chance, before takeout. Exotic chances compound model error. Treat them as rough. Will-pays aren't available from this source.</p>
    </div>
  );
}
