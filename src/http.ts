export class HermeticaError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
    this.name = 'HermeticaError';
  }
}

export interface ClientOptions {
  baseUrl: string;
  /** Secret API key (`hm_sk_...`). */
  apiKey: string;
  fetch?: typeof fetch;
  /** Retries after the first attempt, for 429/5xx. Default 3. */
  maxRetries?: number;
  /** Per-attempt timeout. Default 30 s. */
  timeoutMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  /** Sent as `Idempotency-Key`. Also makes a POST safe to retry on 5xx. */
  idempotencyKey?: string;
}

export type Query = Record<string, string | number | boolean | undefined>;

/** Retry-After as delta-seconds or HTTP date; null when absent/unparseable. */
export function retryAfterMs(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

const backoff = (attempt: number) => Math.floor(Math.random() * Math.min(8_000, 250 * 2 ** attempt));

export type Transport = <T>(method: string, path: string, init?: { body?: unknown; query?: Query } & RequestOptions) => Promise<T>;

export function createTransport(o: ClientOptions): Transport {
  const f = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = o.maxRetries ?? 3;
  const base = o.baseUrl.replace(/\/+$/, '');

  return async <T>(method: string, path: string, init: { body?: unknown; query?: Query } & RequestOptions = {}): Promise<T> => {
    const qs = new URLSearchParams(Object.entries(init.query ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
    const headers: Record<string, string> = { authorization: `Bearer ${o.apiKey}`, accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
    // 5xx may mean "processed, then crashed": only replay requests that are safe to repeat. 429 was never processed.
    const replayable = method !== 'POST' || !!init.idempotencyKey;

    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await f(`${base}${path}${qs ? `?${qs}` : ''}`, {
          method, headers, signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
          ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
        });
      } catch (e) {
        if (!replayable || attempt >= maxRetries) throw e;
      }
      if (res?.ok) return (res.status === 204 ? undefined : await res.json()) as T;
      const retryable = res === null || res.status === 429 || (res.status >= 500 && replayable);
      if (res && (!retryable || attempt >= maxRetries)) throw await toError(res);
      if (res) await res.body?.cancel();
      await sleep(retryAfterMs(res?.headers.get('retry-after') ?? null) ?? backoff(attempt));
    }
  };
}

async function toError(res: Response): Promise<HermeticaError> {
  const j = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  return new HermeticaError(res.status, j?.error?.code ?? 'unknown', j?.error?.message ?? `HTTP ${res.status}`, j?.error?.details);
}
