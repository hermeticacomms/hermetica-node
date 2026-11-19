import { randomUUID } from 'node:crypto';
import { type ClientOptions, createTransport } from './http.ts';
import { verifyHermeticaSignature } from './signature.ts';

/**
 * HM-I2: the five calls a product's server makes, with no schema library and plain TS types (`@hermeticor/sdk-node/lite`).
 * Same transport as the full client: retries on 429/5xx, timeout, an Idempotency-Key on every write.
 * Reads HERMETICA_URL (or HERMETICA_API_URL) and HERMETICA_API_KEY (or HERMETICA_KEY) unless given.
 */
export { HermeticaError } from './http.ts';
export const verifySignature = verifyHermeticaSignature;

/** A person's ids: at least one. */
export interface Identifiers { externalId?: string; email?: string; phone?: string; anonymousId?: string }
export interface TrackEvent {
  name: string;
  /** Same key = same event (retries and replays are dropped). */
  dedupeKey?: string;
  /** Creates or updates the person (needs profiles:write); identifiers plus attributes such as firstName. */
  profile?: Identifiers & Record<string, unknown>;
  identifiers?: Identifiers;
  properties?: Record<string, unknown>;
  occurredAt?: string;
}
export interface SendRaw { rawMime: string; to: string[]; tags?: string[]; idempotencyKey?: string }
export type LiteOptions = Partial<ClientOptions>;

export function createLiteClient(o: LiteOptions = {}, env: Record<string, string | undefined> = process.env) {
  const apiKey = o.apiKey ?? env.HERMETICA_API_KEY ?? env.HERMETICA_KEY;
  if (!apiKey) throw new Error('Hermeticor: no API key (pass apiKey, or set HERMETICA_API_KEY)');
  const http = createTransport({ ...o, apiKey, baseUrl: o.baseUrl ?? env.HERMETICA_URL ?? env.HERMETICA_API_URL ?? 'https://hermeticor.com' });
  // Every write carries a key, so the transport may retry it after a 5xx without doubling it.
  const key = (k?: string) => ({ idempotencyKey: k ?? randomUUID() });
  return {
    /** One call signs a person up: the event with `profile` creates or updates them. */
    track: (e: TrackEvent) => http<{ accepted: number; duplicates: number; rejected: { index: number; reason: string }[] }>('POST', '/v1/events', { body: e, ...key(e.dedupeKey && `event:${e.dedupeKey}`) }),
    identify: (identifiers: Identifiers, attributes: Record<string, unknown> = {}) =>
      http<{ profile: { id: string }; created: boolean }>('POST', '/v1/profiles/upsert', { body: { identifiers, attributes }, ...key() }),
    sendRaw: ({ idempotencyKey, ...body }: SendRaw) =>
      http<{ results: { recipient: string; jobId: string | null; status: string; reason?: string }[] }>('POST', '/v1/transactional/send-raw', { body, ...key(idempotencyKey) }),
    /** The person left this app: its data about them goes, shared consent and suppressions stay. Idempotent. */
    forgetApp: (externalId: string, app?: string) =>
      http<{ found?: boolean; profileDeleted: boolean }>('POST', `/v1/profiles/by/external_id/${encodeURIComponent(externalId)}/forget-app`, { body: app ? { app } : {}, ...key() }),
  };
}

let shared: ReturnType<typeof createLiteClient> | undefined;
const client = () => (shared ??= createLiteClient());
export const track = (e: TrackEvent) => client().track(e);
export const identify = (identifiers: Identifiers, attributes?: Record<string, unknown>) => client().identify(identifiers, attributes);
export const sendRaw = (m: SendRaw) => client().sendRaw(m);
export const forgetApp = (externalId: string, app?: string) => client().forgetApp(externalId, app);
