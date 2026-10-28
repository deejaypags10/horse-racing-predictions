// Types mirror the real backend responses in v2/docs/api-examples/*.json.

export type Breed = 'thoroughbred' | 'harness' | 'quarter_horse' | 'other';
export type RaceStatus = 'open' | 'closed' | 'official' | 'cancelled';
export type Evidence = 'none' | 'thin' | 'some' | 'strong';
export type MarketKind = 'live' | 'morning_line' | 'none';
export type PriceSource = 'live' | 'morning_line' | null;

export interface SourceStatus {
  now?: string;
  source: 'archive' | 'twinspires' | string;
  live: boolean;
  ok: boolean;
  replay_date: string | null;
  detail: string | null;
  last_success: string | null;
  recent_errors: unknown[];
  model_version: string;
  model_loaded: boolean;
  history_runs: number;
  history_horses: number;
  history_through: string | null;
}

export interface Pick {
  program: string;
  name: string;
  p_model: number;
  edge_pts: number | null;
  evidence: Evidence;
}

export interface NextRace {
  race_id: string;
  number: number;
  post_time: string | null;
  mtp: number | null;
}

export interface BoardTrack {
  id: string;
  code: string;
  name: string;
  breed: Breed;
  country: string;
  date: string;
  race_count: number;
  next_race?: NextRace | null;
  official?: number;
  overlays_next_hour?: number;
  surfaces?: string[];
  first_post?: string | null;
  last_post?: string | null;
  error?: string;
  deep_link?: string | null;
}

export interface NextUp {
  race_id: string;
  track_id: string;
  track_code: string;
  track_name: string;
  breed: Breed;
  number: number;
  post_time: string | null;
  mtp: number | null;
  market: MarketKind;
  top_pick: Pick | null;
  best_value: Pick | null;
}

export interface BoardResponse {
  date: string;
  now: string;
  tracks: BoardTrack[];
  next_up: NextUp[];
  status: SourceStatus;
}

export interface RaceHeader {
  id: string;
  number: number;
  post_time: string | null;
  mtp: number | null;
  status: RaceStatus;
  distance: string | null;
  distance_furlongs: number | null;
  surface: string | null;
  race_class: string | null;
  race_name: string | null;
  purse: number | null;
  breed: Breed;
  field: number;
  date: string;
}

export interface TrackRace extends RaceHeader {
  is_next: boolean;
  market: MarketKind;
  evidence: Evidence;
  top_pick: Pick | null;
  best_value: Pick | null;
  finish: string[];
}

export interface TrackInfo {
  deep_link?: string | null;
  id: string;
  code: string;
  name: string;
  breed: Breed;
  country: string;
  date: string;
  race_count: number;
}

export interface TrackResponse {
  track: TrackInfo;
  now: string;
  races: TrackRace[];
  status: SourceStatus;
}

export interface RaceDetail extends RaceHeader {
  track_id: string;
  track_name: string;
  track_code: string;
  country: string;
  prev: string | null;
  next: string | null;
  race_numbers: { id: string; number: number; status: RaceStatus }[];
  deep_link: string | null;
  fetched_at: string | null;
  odds_updated_at: string | null;
}

export interface RunnerModel {
  key: string;
  p_model: number;
  p_market: number | null;
  p_form: number;
  p_top2: number;
  p_top3: number;
  fair_decimal: number | null;
  fair_us: string | null;
  min_price_decimal: number | null;
  min_price_us: string | null;
  price_decimal: number | null;
  price_source: PriceSource;
  edge_pts: number | null;
  exp_return: number | null;
  value: boolean;
  evidence: Evidence;
  starts: number;
  rank: number;
}

export interface PastRun {
  date: string;
  track: string;
  surface: string | null;
  dist_f: number | null;
  position: number | null;
  field: number | null;
  favorite: boolean;
}

export interface Runner {
  program: string;
  interest: string;
  post: number | null;
  name: string;
  jockey: string | null;
  trainer: string | null;
  sire: string | null;
  dam: string | null;
  age: number | null;
  sex: string | null;
  weight: number | null;
  morning_line: string | null;
  morning_line_decimal: number | null;
  live_odds: string | null;
  live_decimal: number | null;
  scratched: boolean;
  whatif_scratched: boolean;
  saddle_color: string | null;
  saddle_text_color: string | null;
  coupled: boolean;
  model: RunnerModel | null;
  recent: PastRun[];
}

export interface Prediction {
  market: MarketKind;
  model_version: string;
  weights: { a: number; b: number };
  evidence: Evidence;
  coverage: number;
  overround: number | null;
  whatif: string[];
  active_interests: number;
  sum_p: number;
  /** False until the blend weights are fitted from recorded races. */
  blend_calibrated?: boolean;
}

export interface ExactaCombo { combo: string[]; p: number; fair_2: number }
export interface TrifectaCombo { combo: string[]; p: number; fair_1: number }

export interface FinishLine {
  program: string;
  position: number;
  win_pay: number | null;
  place_pay: number | null;
  show_pay: number | null;
}

export interface RaceResult {
  finish: FinishLine[];
  exotics: Record<string, number>;
}

export interface RaceResponse {
  race: RaceDetail;
  now: string;
  prediction: Prediction;
  runners: Runner[];
  exotics: { exacta: ExactaCombo[]; trifecta: TrifectaCombo[] };
  result: RaceResult | null;
  status: SourceStatus;
}

export type TicketKind = 'win' | 'place' | 'show' | 'exacta' | 'trifecta';
export type TicketStatus = 'open' | 'won' | 'lost' | 'void';

export interface Ticket {
  id: string;
  created_at: string;
  race_id: string;
  track_name: string;
  race_number: number;
  post_time: string | null;
  kind: TicketKind;
  selection: string[];
  stake: number;
  odds_taken: number | null;
  model_prob: number | null;
  fair_decimal: number | null;
  model: string;
  note: string | null;
  status: TicketStatus;
  payout: number | null;
  closing_odds: number | null;
  settled_at: string | null;
  clv?: number | null;
  breed?: Breed;
}

export interface TicketSummary {
  count: number;
  settled: number;
  open: number;
  staked: number;
  returned: number;
  net: number;
  roi: number | null;
  roi_ci: [number, number] | null;
  avg_clv: number | null;
  beat_close: number;
  clv_n: number;
}

export interface TicketsResponse {
  now?: string;
  tickets: Ticket[];
  summary: TicketSummary;
}

export interface NewTicket {
  race_id: string;
  kind: TicketKind;
  selection: string[];
  stake: number;
  odds_taken?: string;
  note?: string;
}

export interface BreedMetrics {
  races: number;
  runners: number;
  log_loss: number;
  log_loss_uniform: number;
  log_loss_gain_vs_uniform: number;
  top1: number;
  top1_uniform: number;
  favorite_top1: number;
  model_top1_same_races: number;
  second_log_loss: number;
  second_log_loss_uniform: number;
  share_runners_with_history: number;
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  predicted: number;
  observed: number;
}

export interface ModelCard {
  version: string;
  features: string[];
  meta: {
    trained_at?: string;
    archive?: string;
    train_period?: [string, string];
    evaluation?: {
      protocol?: string;
      metrics?: Partial<Record<'thoroughbred' | 'harness' | 'quarter_horse' | 'all', BreedMetrics>> & {
        calibration?: CalibrationBin[];
      };
    };
    coefficients?: Record<string, Record<string, number>>;
    l2?: number;
  };
  track_record: { races: number; log_loss_model: number | null; log_loss_market: number | null };
  blend: Record<string, { a: number; b: number }>;
  blend_calibrated?: boolean;
}

export interface ApiErrorBody {
  error?: string;
  detail?: string | unknown;
}
