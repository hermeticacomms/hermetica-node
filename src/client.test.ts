import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HermeticaError, createClient, verifyHermeticaSignature } from './index.ts';
import { retryAfterMs } from './http.ts';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function setup(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = queue.shift() ?? json(200, {});
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof globalThis.fetch;
  const sleeps: number[] = [];
  const client = createClient({ baseUrl: 'https://api.test/', apiKey: 'hm_sk_x', fetch, sleep: async (ms) => { sleeps.push(ms); } });
  return { client, calls, sleeps };
}
const header = (c: { init: RequestInit }, k: string) => (c.init.headers as Record<string, string>)[k];

describe('requests', () => {
  it('sends bearer auth, JSON body and query string', async () => {
    const { client, calls } = setup(json(200, { items: [], nextCursor: null }), json(200, { profile: {}, created: true, conflicts: [] }));
    await client.profiles.list({ limit: 5 } as never);
    await client.profiles.upsert({ identifiers: { email: 'a@x.com' } } as never);
    expect(calls[0]!.url).toBe('https://api.test/v1/profiles?limit=5');
    expect(header(calls[0]!, 'authorization')).toBe('Bearer hm_sk_x');
    expect(calls[1]!.init.method).toBe('POST');
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ identifiers: { email: 'a@x.com' } });
    expect(header(calls[1]!, 'content-type')).toBe('application/json');
  });

  it('wraps batch events and url-encodes ids', async () => {
    const { client, calls } = setup(json(200, { accepted: 1, duplicates: 0, rejected: [] }), json(200, {}));
    await client.events.ingestBatch([{ name: 'order_placed' }] as never);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ events: [{ name: 'order_placed' }] });
    await client.profiles.get('a/b');
    expect(calls[1]!.url).toBe('https://api.test/v1/profiles/a%2Fb');
  });

  it('messages.send sends the idempotency key as a header too', async () => {
    const { client, calls } = setup(json(202, { jobId: 'j', status: 'queued' }));
    await client.messages.send({ idempotencyKey: 'order-1' } as never);
    expect(header(calls[0]!, 'idempotency-key')).toBe('order-1');
  });

  it('throws HermeticaError with the API error body', async () => {
    const { client } = setup(json(404, { error: { code: 'not_found', message: 'Profile x not found' } }));
    const err = await client.profiles.get('x').catch((e) => e);
    expect(err).toBeInstanceOf(HermeticaError);
    expect(err).toMatchObject({ status: 404, code: 'not_found', message: 'Profile x not found' });
  });
});

describe('retries', () => {
  it('retries 429 honouring Retry-After, for any method', async () => {
    const { client, calls, sleeps } = setup(json(429, { error: { code: 'rate_limited', message: 'slow' } }, { 'retry-after': '2' }), json(200, { profile: {}, created: false, conflicts: [] }));
    await client.profiles.upsert({} as never);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it('retries 5xx on GET and on POST with an idempotency key, but not on a bare POST', async () => {
    const down = () => json(503, { error: { code: 'internal', message: 'down' } });
    const g = setup(down(), json(200, { items: [], nextCursor: null }));
    await g.client.segments.list();
    expect(g.calls).toHaveLength(2);

    const p = setup(down(), json(202, { jobId: 'j', status: 'queued' }));
    await p.client.messages.send({ idempotencyKey: 'k' } as never);
    expect(p.calls).toHaveLength(2);

    const bare = setup(down(), json(200, {}));
    await expect(bare.client.profiles.upsert({} as never)).rejects.toMatchObject({ status: 503 });
    expect(bare.calls).toHaveLength(1);
  });

  it('gives up after maxRetries and surfaces the last error', async () => {
    const { client, calls } = setup(...Array.from({ length: 6 }, () => json(500, { error: { code: 'internal', message: 'x' } })));
    await expect(client.profiles.get('x')).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(4); // 1 + 3 retries
  });

  it('does not retry 4xx; retries network errors on GET', async () => {
    const a = setup(json(400, { error: { code: 'invalid', message: 'bad' } }));
    await expect(a.client.profiles.get('x')).rejects.toMatchObject({ status: 400 });
    expect(a.calls).toHaveLength(1);
    const b = setup(new Error('ECONNRESET'), json(200, { id: 'x' }));
    await b.client.profiles.get('x');
    expect(b.calls).toHaveLength(2);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('soon')).toBeNull();
  });
});

describe('verifyHermeticaSignature', () => {
  const sig = (secret: string, t: number, body: string) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
  it('accepts valid, rejects tampered/stale/malformed', () => {
    const t = 1_780_000_000;
    expect(verifyHermeticaSignature('s', sig('s', t, 'b'), 'b', t * 1000)).toBe(true);
    expect(verifyHermeticaSignature('s', sig('s', t, 'b'), 'c', t * 1000)).toBe(false);
    expect(verifyHermeticaSignature('x', sig('s', t, 'b'), 'b', t * 1000)).toBe(false);
    expect(verifyHermeticaSignature('s', sig('s', t, 'b'), 'b', (t + 301) * 1000)).toBe(false);
    expect(verifyHermeticaSignature('s', sig('s', t, 'b'), 'b', (t + 301) * 1000, 600)).toBe(true);
    expect(verifyHermeticaSignature('s', 'nonsense', 'b', t * 1000)).toBe(false);
  });
});

describe('paginate and request', () => {
  it('walks every page via nextCursor', async () => {
    const { client, calls } = setup(json(200, { items: [1, 2], nextCursor: 'c1' }), json(200, { items: [3], nextCursor: null }));
    const out: number[] = [];
    for await (const n of client.paginate<number>('/v1/campaigns', { limit: 2 })) out.push(n);
    expect(out).toEqual([1, 2, 3]);
    expect(calls[1]!.url).toBe('https://api.test/v1/campaigns?limit=2&cursor=c1');
  });

  it('request() reaches any route with the idempotency header', async () => {
    const { client, calls } = setup(json(200, { ok: true }));
    expect(await client.request('POST', '/v1/anything', { body: { a: 1 }, idempotencyKey: 'k1' })).toEqual({ ok: true });
    expect(header(calls[0]!, 'idempotency-key')).toBe('k1');
  });
});
