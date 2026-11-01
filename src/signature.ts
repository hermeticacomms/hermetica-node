import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a `Hermetica-Signature: t=<unix>,v1=<hex>` header against the RAW request body.
 * Rejects stale/future timestamps (default +-5 min) to stop replays. Several `v1=` values are accepted (secret rotation).
 */
export function verifyHermeticaSignature(secret: string, header: string, body: string, now: Date | number = Date.now(), toleranceSec = 300): boolean {
  const nowSec = Math.floor((typeof now === 'number' ? now : now.getTime()) / 1000);
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isInteger(t) || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  return parts.some(([k, v]) => {
    if (k !== 'v1' || !v) return false;
    const got = Buffer.from(v);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
