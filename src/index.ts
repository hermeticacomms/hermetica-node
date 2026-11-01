import type { z } from 'zod';
import type {
  CreateSegmentBody, CreateWebhookEndpoint, IdentifyBody, IdentifyResult, IngestBatchBody, IngestEvent, IngestResult, ListProfilesQuery, PageQuery,
  ProfileDto, ProfilePage, SegmentDto, SegmentPage, SegmentPreviewBody, SegmentPreviewResult, SendApiBody, SendOutcome, UpdateProfileBody,
  UpdateWebhookEndpoint, UpsertProfileBody, UpsertProfileResult, WebhookDeliveriesQuery, WebhookDeliveryDto, WebhookDeliveryPage,
  WebhookEndpointCreated, WebhookEndpointDto, WebhookEndpointPage,
} from './contracts/index.ts';
import { resources } from './resources.ts';
import { platformResources } from './platform.ts';
import { x10Resources } from './x10.ts';
import { z10Resources } from './z10.ts';
import { type ClientOptions, type Query, type RequestOptions, createTransport } from './http.ts';

export { HermeticaError, type ClientOptions, type RequestOptions } from './http.ts';
export { verifyHermeticaSignature } from './signature.ts';
export type { Query } from './http.ts';

// Request types are z.input (what callers write, defaults optional); responses are z.infer (what the API returns).
type In<S extends z.ZodType> = z.input<S>;
type Out<S extends z.ZodType> = z.infer<S>;

export function createClient(options: ClientOptions) {
  const http = createTransport(options);
  const enc = encodeURIComponent;

  /** Follows `nextCursor` until exhausted. Works for every list route that returns `{ items, nextCursor }`. */
  async function* paginate<T>(path: string, query: Query = {}): AsyncGenerator<T> {
    let cursor: string | undefined;
    do {
      const page: { items: T[]; nextCursor?: string | null } = await http('GET', path, { query: { ...query, ...(cursor ? { cursor } : {}) } });
      yield* page.items;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  return {
    /** Typed escape hatch for any `/v1` route without a dedicated method. Retries and idempotency behave as for the typed ones. */
    request: <T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, o: { body?: unknown; query?: Query } & RequestOptions = {}) => http<T>(method, path, o),
    paginate,
    ...resources(http),
    ...platformResources(http),
    ...x10Resources(http),
    ...z10Resources(http),
    profiles: {
      list: (q: In<typeof ListProfilesQuery> = {}) => http<Out<typeof ProfilePage>>('GET', '/v1/profiles', { query: q as never }),
      get: (id: string) => http<Out<typeof ProfileDto>>('GET', `/v1/profiles/${enc(id)}`),
      upsert: (body: In<typeof UpsertProfileBody>, o?: RequestOptions) => http<Out<typeof UpsertProfileResult>>('POST', '/v1/profiles/upsert', { body, ...o }),
      update: (id: string, body: In<typeof UpdateProfileBody>) => http<Out<typeof ProfileDto>>('PATCH', `/v1/profiles/${enc(id)}`, { body }),
      delete: (id: string) => http<{ removed: { type: string; value: string }[] }>('DELETE', `/v1/profiles/${enc(id)}`),
    },
    events: {
      ingest: (body: In<typeof IngestEvent>, o?: RequestOptions) => http<Out<typeof IngestResult>>('POST', '/v1/events', { body, ...o }),
      ingestBatch: (events: In<typeof IngestEvent>[], o?: RequestOptions) =>
        http<Out<typeof IngestResult>>('POST', '/v1/events/batch', { body: { events } satisfies In<typeof IngestBatchBody>, ...o }),
      identify: (body: In<typeof IdentifyBody>) => http<Out<typeof IdentifyResult>>('POST', '/v1/identify', { body }),
    },
    messages: {
      /** `idempotencyKey` is required by the API and doubles as the `Idempotency-Key` header, so retries never double-send. */
      send: (body: In<typeof SendApiBody>) => http<Out<typeof SendOutcome>>('POST', '/v1/messages/send', { body, idempotencyKey: body.idempotencyKey }),
    },
    segments: {
      list: (q: In<typeof PageQuery> = {}) => http<Out<typeof SegmentPage>>('GET', '/v1/segments', { query: q as never }),
      get: (id: string) => http<Out<typeof SegmentDto>>('GET', `/v1/segments/${enc(id)}`),
      create: (body: In<typeof CreateSegmentBody>) => http<Out<typeof SegmentDto>>('POST', '/v1/segments', { body }),
      preview: (body: In<typeof SegmentPreviewBody>) => http<Out<typeof SegmentPreviewResult>>('POST', '/v1/segments/preview', { body }),
      members: (id: string, q: In<typeof PageQuery> = {}) => http<Out<typeof ProfilePage>>('GET', `/v1/segments/${enc(id)}/members`, { query: q as never }),
    },
    webhooks: {
      list: (q: In<typeof PageQuery> = {}) => http<Out<typeof WebhookEndpointPage>>('GET', '/v1/webhooks/endpoints', { query: q as never }),
      create: (body: In<typeof CreateWebhookEndpoint>) => http<Out<typeof WebhookEndpointCreated>>('POST', '/v1/webhooks/endpoints', { body }),
      get: (id: string) => http<Out<typeof WebhookEndpointDto>>('GET', `/v1/webhooks/endpoints/${enc(id)}`),
      update: (id: string, body: In<typeof UpdateWebhookEndpoint>) => http<Out<typeof WebhookEndpointDto>>('PATCH', `/v1/webhooks/endpoints/${enc(id)}`, { body }),
      delete: (id: string) => http<{ ok: true }>('DELETE', `/v1/webhooks/endpoints/${enc(id)}`),
      rotateSecret: (id: string) => http<{ secret: string }>('POST', `/v1/webhooks/endpoints/${enc(id)}/rotate-secret`),
      test: (id: string) => http<Out<typeof WebhookDeliveryDto>>('POST', `/v1/webhooks/endpoints/${enc(id)}/test`),
      deliveries: (id: string, q: In<typeof WebhookDeliveriesQuery> = {}) =>
        http<Out<typeof WebhookDeliveryPage>>('GET', `/v1/webhooks/endpoints/${enc(id)}/deliveries`, { query: q as never }),
      replay: (deliveryId: string) => http<Out<typeof WebhookDeliveryDto>>('POST', `/v1/webhooks/deliveries/${enc(deliveryId)}/replay`),
    },
  };
}

export type HermeticaClient = ReturnType<typeof createClient>;
