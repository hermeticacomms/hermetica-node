import { describe, expect, it } from 'vitest';
import { createLiteClient } from './lite.ts';

describe('lite client', () => {
  it('reads HERMETICA_KEY / HERMETICA_URL, posts the event with profile, and keys writes for retries', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ accepted: 1, duplicates: 0, rejected: [] }), { status: 202 }); }) as unknown as typeof globalThis.fetch;
    const hm = createLiteClient({ fetch }, { HERMETICA_KEY: 'hm_sk_x', HERMETICA_URL: 'https://h.test/' });
    expect((await hm.track({ name: 'signed_up', profile: { externalId: 'u1' } })).accepted).toBe(1);
    const h = new Headers(calls[0]!.init.headers);
    expect([calls[0]!.url, h.get('authorization'), JSON.parse(String(calls[0]!.init.body)).profile.externalId]).toEqual(['https://h.test/v1/events', 'Bearer hm_sk_x', 'u1']);
    expect(h.get('idempotency-key')).toBeTruthy();
    expect(() => createLiteClient({}, {})).toThrow(/no API key/);
  });
});
