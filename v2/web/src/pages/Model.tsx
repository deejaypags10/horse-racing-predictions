import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { BreedMetrics, Evidence, ModelCard } from '../api/types';
import { useApi } from '../api/useApi';
import { useNetState } from '../api/netState';
import { CalibrationChart } from '../components/CalibrationChart';
import { EvidenceMeter } from '../components/EvidenceMeter';
import { InlineError, SkeletonRows } from '../components/States';
import { EVIDENCE_COPY, EVIDENCE_NAME } from '../domain/evidence';
import { fmtDateline, fmtSigned } from '../domain/format';

type BreedTab = 'all' | 'thoroughbred' | 'harness' | 'quarter_horse';
const TABS: { k: BreedTab; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'thoroughbred', label: 'Thoroughbred' }, { k: 'harness', label: 'Harness' }, { k: 'quarter_horse', label: 'Quarter Horse' },
];

const FEATURE_WORDS: Record<string, string> = {
  has_history: 'has any prior start in our data',
  log_starts: 'number of prior starts',
  win_rate: 'career win rate',
  top3_rate: 'top-three rate',
  form_last: 'last-out finish (relative to field)',
  form_avg3: 'average finish over the last three',
  won_last: 'won last time out',
  fav_last: 'was favourite last time out',
  log_days: 'days since last start',
  layoff: 'coming off a layoff',
  purse_delta: 'step up in class (purse vs recent races)',
  same_surface: 'ran on today’s surface last time',
  surface_win_rate: 'win rate on today’s surface',
  dist_delta: 'change in distance',
  track_seen: 'has run at this track before',
  post_rel: 'post position (relative)',
  post_rel_sq: 'post position (extremes)',
  recent_starts: 'starts in the last few months',
};

const pct = (x: number | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const n = (x: number | undefined) => (x == null ? '—' : x.toLocaleString('en-US'));

export function ModelPage() {
  const st = useApi<ModelCard>('model', (s) => api.model(s));
  const { status } = useNetState();
  const [tab, setTab] = useState<BreedTab>('all');
  useEffect(() => { document.title = 'How it works · Equine Edge'; }, []);

  const card = st.data;
  const metrics = card?.meta.evaluation?.metrics;
  const all = metrics?.all;
  const cur: BreedMetrics | undefined = metrics?.[tab];
  const bins = metrics?.calibration ?? [];
  const period = card?.meta.train_period;

  return (
    <article className="page model prose-page">
      <header className="article-head">
        <p className="kicker">How it works · Track record</p>
        <h1 className="page-title">How Equine Edge makes a number</h1>
        <p className="lede">Equine Edge estimates each runner's chance to win. It is often wrong, the market is usually very good, and we show you exactly how we compare.</p>
        <nav className="toc" aria-label="On this page">
          <a href="#backtest">Did it beat the market?</a>
          <a href="#calibration">Is 24% really 24%?</a>
          <a href="#evidence">Evidence levels</a>
          <a href="#limits">Where it is weak</a>
        </nav>
      </header>

      {st.loading && <SkeletonRows rows={6} label="Loading the model card" />}
      {st.error && !card && <InlineError title="Couldn't load the model card." onRetry={st.refresh} error={st.error}>The rest of the app still works.</InlineError>}

      {card && all && (
        <>
          <section className="prose">
            <p>
              <strong>What goes in.</strong> For every runner we look up its past starts in our own history
              ({n(status?.history_runs)} runs by {n(status?.history_horses)} horses{status?.history_through ? `, through ${fmtDateline(status.history_through, { year: true })}` : ''}):
              recent finishing positions, win and top-three rates, days since its last race, whether it is stepping up in class,
              changes of surface and distance, familiarity with the track, and post position. That gives a “form score” per runner.
              We do not have speed figures, workouts, beaten lengths, or jockey and trainer statistics.
            </p>
            <p>
              <strong>What comes out.</strong> A win chance for every betting interest that sums to 100%. We get it by blending the
              form score into the market's own opinion, in log space: the market price is the starting point and the form model
              nudges it. Against live tote odds the form score gets a weight of {card.blend.live?.b ?? '—'}; against the
              morning line, which is a weaker guess, {card.blend.morning_line?.b ?? '—'}. A runner we know little about keeps
              the market's number. Place, show, exacta and trifecta chances all come from that one win vector.
            </p>
            <p>
              <strong>What it is not.</strong> Not a tip, not a guarantee, and not inside information. An “overlay” only means our
              number is higher than the tote's. Overlays lose most of the time.
            </p>
          </section>

          <section className="prose" id="backtest" aria-labelledby="h-backtest">
            <h2 id="h-backtest" className="section-title">Did it beat the market?</h2>
            <p className="answer-first">
              <strong>No — and that is why the market is the backbone.</strong> On its own, the form model picked the winner
              in {pct(all.top1)} of {n(all.races)} held-out races. Simply backing the betting favourite won {pct(all.favorite_top1)}.
              Picking at random would win {pct(all.top1_uniform)}. So the form model knows something, but much less than the crowd.
              It is used only to nudge market prices, not to replace them.
            </p>
            <div className="seg breed-tabs" role="tablist" aria-label="Breed">
              {TABS.map((t) => (
                <button key={t.k} type="button" role="tab" className="seg-btn" aria-selected={tab === t.k} onClick={() => setTab(t.k)} disabled={!metrics?.[t.k]}>{t.label}</button>
              ))}
            </div>
            {cur ? (
              <div className="table-wrap" role="tabpanel">
                <table className="metric-table">
                  <caption className="visually-hidden">Form model versus favourite and random baseline, {TABS.find((t) => t.k === tab)?.label}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col" className="num">Form model</th>
                      <th scope="col" className="num">Favourite</th>
                      <th scope="col" className="num">Random</th>
                      <th scope="col" className="num">Model − Fav</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Top-pick win rate</th>
                      <td className="num model-ink">{pct(cur.top1)}</td>
                      <td className="num">{pct(cur.favorite_top1)}</td>
                      <td className="num">{pct(cur.top1_uniform)}</td>
                      <td className="num"><Diff v={(cur.top1 - cur.favorite_top1) * 100} unit=" pts" /></td>
                    </tr>
                    <tr>
                      <th scope="row">Log loss, winner (lower = better)</th>
                      <td className="num model-ink">{cur.log_loss.toFixed(3)}</td>
                      <td className="num muted">n/a</td>
                      <td className="num">{cur.log_loss_uniform.toFixed(3)}</td>
                      <td className="num muted">—</td>
                    </tr>
                    <tr>
                      <th scope="row">Log loss, runner-up</th>
                      <td className="num model-ink">{cur.second_log_loss.toFixed(3)}</td>
                      <td className="num muted">n/a</td>
                      <td className="num">{cur.second_log_loss_uniform.toFixed(3)}</td>
                      <td className="num muted">—</td>
                    </tr>
                    <tr>
                      <th scope="row">Runners with history</th>
                      <td className="num" colSpan={4}>{pct(cur.share_runners_with_history, 0)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={5} className="fineprint">{n(cur.races)} races · {n(cur.runners)} runners · {card.meta.evaluation?.protocol ?? ''}</td></tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="muted">Not enough results yet to report. The model runs, but treat it as experimental.</p>
            )}
            <p className="fineprint">
              These are the <em>form-only</em> model's numbers, before blending with the market. The favourite column is the tote favourite in the same races.
              A market log-loss baseline is not in the model card yet. International racing is not modelled.
            </p>

            <h3 className="sub-title">Live track record</h3>
            {card.track_record.races > 0 ? (
              <p>
                Over {n(card.track_record.races)} races frozen before post, the blended model's log loss was{' '}
                <strong className="num">{card.track_record.log_loss_model?.toFixed(3)}</strong> against the market's{' '}
                <strong className="num">{card.track_record.log_loss_market?.toFixed(3)}</strong>
                {card.track_record.log_loss_model != null && card.track_record.log_loss_market != null
                  ? (card.track_record.log_loss_model < card.track_record.log_loss_market ? ' — slightly better than the market.' : ' — the market was better.')
                  : '.'}
              </p>
            ) : (
              <p>No live races have been recorded and settled yet. Predictions are frozen before post and scored when results come in; this section fills in as that happens.</p>
            )}
          </section>

          <section className="prose" id="calibration" aria-labelledby="h-cal">
            <h2 id="h-cal" className="section-title">Is a “24%” really 24%?</h2>
            <p className="answer-first">
              Mostly, in the middle of the range. Runners we gave 10–30% won about as often as we said. At the top end the
              form model is <strong>overconfident</strong>: {bins.length ? <>runners it rated above {Math.round(bins[bins.length - 1].lo * 100)}% averaged a predicted {pct(bins[bins.length - 1].predicted, 0)} but won {pct(bins[bins.length - 1].observed, 0)}</> : 'short prices are too short'}.
              Blending with the market reins that in.
            </p>
          </section>
          {bins.length > 0 && <div className="breakout"><CalibrationChart bins={bins} /></div>}

          <section className="prose" id="evidence" aria-labelledby="h-ev">
            <h2 id="h-ev" className="section-title">Evidence levels</h2>
            <p>Every model number carries an evidence level: how much history stands behind it. It is not how good the bet is. Value flags need at least “Some”.</p>
            <dl className="evidence-list">
              {(['none', 'thin', 'some', 'strong'] as Evidence[]).map((e) => (
                <div key={e}>
                  <dt><EvidenceMeter evidence={e} /> <span>{EVIDENCE_NAME[e]}</span></dt>
                  <dd>{EVIDENCE_COPY[e]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="prose" id="factors" aria-labelledby="h-fac">
            <h2 id="h-fac" className="section-title">What moves the form score</h2>
            <p>The five largest weights per breed, from the fitted model (standardised features; positive helps, negative hurts).</p>
            <div className="factor-grid">
              {Object.entries(card.meta.coefficients ?? {}).map(([breed, co]) => (
                <div key={breed} className="factor-col">
                  <h3 className="sub-title">{breed === 'quarter_horse' ? 'Quarter Horse' : breed[0].toUpperCase() + breed.slice(1)}</h3>
                  <ol className="factors">
                    {Object.entries(co).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5).map(([f, v]) => (
                      <li key={f}><span>{FEATURE_WORDS[f] ?? f}</span> <span className={`num ${v >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(v, 2)}</span></li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <section className="prose" id="limits" aria-labelledby="h-lim">
            <h2 id="h-lim" className="section-title">Where it is weak</h2>
            <ul>
              <li>It is much weaker than the tote at picking winners: about {pct(all.top1, 0)} against the favourite's {pct(all.favorite_top1, 0)}.</li>
              <li>No speed figures, pace, workouts, beaten lengths, equipment changes, or jockey and trainer form.</li>
              <li>First-time starters and horses new to our data get the market's number and nothing more.</li>
              <li>Quarter Horse coverage is thin: only {pct(metrics?.quarter_horse?.share_runners_with_history, 0)} of runners had history in testing.</li>
              <li>Before the tote opens, everything is measured against the morning line, which is a track handicapper's guess, not a price.</li>
              <li>Exotic chances multiply any error in the win chances. Treat them as rough.</li>
            </ul>
            <p className="fineprint">
              Model {card.version} · trained {card.meta.trained_at ? fmtDateline(card.meta.trained_at.slice(0, 10), { year: true }) : '—'}
              {period ? ` on races from ${fmtDateline(period[0], { year: true })} to ${fmtDateline(period[1], { year: true })}` : ''}.
              {' '}<Link to="/settings">Settings</Link> · press <kbd>?</kbd> for shortcuts.
            </p>
          </section>
        </>
      )}
    </article>
  );
}

function Diff({ v, unit }: { v: number; unit: string }) {
  const better = v > 0;
  return (
    <span className={better ? 'edge edge-over' : 'edge edge-under'}>
      <span aria-hidden="true">{better ? '▲' : '▽'} {fmtSigned(v, 1)}{unit}</span>
      <span className="visually-hidden">{better ? 'model better by' : 'model worse by'} {Math.abs(v).toFixed(1)} points</span>
    </span>
  );
}
