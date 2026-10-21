import { syncClock } from '../domain/clock';
import { netState } from './netState';
import type {
  ApiErrorBody, BoardResponse, ModelCard, NewTicket, RaceResponse, SourceStatus, Ticket,
  TicketsResponse, TrackResponse,
} from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  get isNotFound() { return this.status === 404; }
  /** Network failure or a server/source fault (not a client mistake). */
  get isOutage() { return this.status === 0 || this.status >= 500; }
}

interface Opts {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

function detailText(body: ApiErrorBody | null, fallback: string): string {
  if (!body) return fallback;
  const d = body.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return 'The request was not valid.';
  return fallback;
}

export async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      signal: opts.signal,
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    netState.fail();
    throw new ApiError(0, 'network', 'The Equine Edge server is not responding.');
  }
  if (res.status === 204) {
    netState.ok();
    return undefined as T;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as ApiErrorBody | null;
    if (res.status >= 500) netState.fail(); else netState.ok();
    throw new ApiError(res.status, (b && typeof b.error === 'string' && b.error) || `http_${res.status}`,
      detailText(b, res.status >= 500 ? 'The server had a problem.' : 'Request failed.'));
  }
  const obj = body as { now?: string; status?: SourceStatus } | null;
  if (obj && typeof obj === 'object') {
    if (typeof obj.now === 'string') syncClock(obj.now);
    const st = obj.status && typeof obj.status === 'object' && 'source' in obj.status ? obj.status : null;
    netState.ok(st);
  } else {
    netState.ok();
  }
  return body as T;
}

export const api = {
  status: (signal?: AbortSignal) => request<SourceStatus>('/status', { signal }).then((st) => { netState.ok(st); return st; }),
  board: (signal?: AbortSignal) => request<BoardResponse>('/board', { signal }),
  track: (id: string, signal?: AbortSignal) => request<TrackResponse>(`/tracks/${encodeURIComponent(id)}`, { signal }),
  race: (id: string, whatif: string[] = [], signal?: AbortSignal) =>
    request<RaceResponse>(`/races/${encodeURIComponent(id)}${whatif.length ? `?whatif=${whatif.map(encodeURIComponent).join(',')}` : ''}`, { signal }),
  tickets: (signal?: AbortSignal) => request<TicketsResponse>('/tickets', { signal }),
  createTicket: (t: NewTicket) => request<Ticket>('/tickets', { method: 'POST', body: t }),
  deleteTicket: (id: string) => request<void>(`/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  model: (signal?: AbortSignal) => request<ModelCard>('/model', { signal }),
};
