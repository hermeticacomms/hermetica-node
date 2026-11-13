import { z } from 'zod';
import { AppSlug, Id, PageQuery, Timestamp, pageResult } from './common.ts';

/** Exact topic (`profile.created`), prefix wildcard (`segment.*`) or everything (`*`). */
export const WebhookTopicPattern = z.string().regex(/^(\*|[a-z_]+(\.[a-z_]+)*(\.\*)?)$/, 'Use an exact topic, "prefix.*" or "*"').max(100);

const Url = z.url().max(2048);
const Topics = z.array(WebhookTopicPattern).min(1).max(50);

/** A payload condition on `data` (dotted path). All filters of an endpoint must match for a delivery to be created. */
export const WebhookFilter = z.object({
  /** Stable id, assigned on save when absent (B5); older filters were addressed by position. */
  id: z.string().min(1).max(40).optional(),
  path: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/).max(120),
  op: z.enum(['eq', 'neq', 'in', 'contains', 'exists', 'gt', 'lt']),
  value: z.unknown().optional(),
});
const Filters = z.array(WebhookFilter).max(20);
const Ids = z.array(z.string().min(1).max(128)).max(100);
const Scope = { filters: Filters, listIds: Ids, sources: Ids, sequenceIds: Ids };

const RESERVED_HEADERS = new Set(['content-type', 'content-length', 'host', 'user-agent', 'idempotency-key', 'transfer-encoding', 'connection']);
/** An extra header whose value is read from a named integration secret at send time. */
export const WebhookAuthHeader = z.object({
  header: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).refine((h) => !RESERVED_HEADERS.has(h.toLowerCase()) && !h.toLowerCase().startsWith('hermetica-'), 'Reserved header name'),
  secretName: z.string().min(1).max(100),
  prefix: z.string().max(40).optional(),
});
const Delivery = {
  /** JSON text with `{{ path }}` placeholders over `{ id, topic, workspaceId, createdAt, data }`. */
  bodyTemplate: z.string().max(8000),
  authHeaders: z.array(WebhookAuthHeader).max(10),
  throttleSeconds: z.number().int().min(0).max(86_400),
  throttleTopics: z.array(WebhookTopicPattern).max(50),
  /** Consecutive failed attempts before the endpoint is disabled (default 50). */
  autoDisableAfter: z.number().int().min(1).max(1000),
  /** Hours one event is retried (doubling backoff, at most 6 h apart) before it is given up (default 24). */
  retryWindowHours: z.number().int().min(1).max(72),
};

/** A signing secret chosen by the caller (e.g. kept in a config file) instead of a generated one: unguessable, and never returned. */
export const WebhookSigningSecret = z.string().min(32).max(256).refine((s) => new Set(s).size >= 12, 'Use a random secret: at least 32 characters, at least 12 of them different');
export const CreateWebhookEndpoint = z.object({ url: Url, topics: Topics, secret: WebhookSigningSecret.optional(), description: z.string().max(500).optional(), filters: Scope.filters.optional(), listIds: Scope.listIds.optional(), sources: Scope.sources.optional(), sequenceIds: Scope.sequenceIds.optional(), bodyTemplate: Delivery.bodyTemplate.optional(), authHeaders: Delivery.authHeaders.optional(), throttleSeconds: Delivery.throttleSeconds.optional(), throttleTopics: Delivery.throttleTopics.optional(), autoDisableAfter: Delivery.autoDisableAfter.optional(), retryWindowHours: Delivery.retryWindowHours.optional(), /** Product this endpoint belongs to: it only gets events attributed to that app (or not attributed to any). An app-bound key sets it for you. */ app: AppSlug.nullish() });
export const UpdateWebhookEndpoint = z.object({
  url: Url.optional(),
  topics: Topics.optional(),
  filters: Scope.filters.optional(), listIds: Scope.listIds.optional(), sources: Scope.sources.optional(), sequenceIds: Scope.sequenceIds.optional(),
  description: z.string().max(500).nullable().optional(),
  bodyTemplate: Delivery.bodyTemplate.nullable().optional(), authHeaders: Delivery.authHeaders.optional(), throttleSeconds: Delivery.throttleSeconds.optional(), throttleTopics: Delivery.throttleTopics.optional(),
  autoDisableAfter: Delivery.autoDisableAfter.optional(), retryWindowHours: Delivery.retryWindowHours.optional(),
  /** Re-enabling resets the failure counter. */
  status: z.enum(['active', 'disabled']).optional(),
  app: AppSlug.nullable().optional(),
});

export const WebhookEndpointDto = z.object({
  id: Id,
  url: z.string(),
  topics: z.array(z.string()),
  description: z.string().nullable(),
  filters: Filters,
  listIds: Ids,
  sources: Ids,
  sequenceIds: Ids,
  bodyTemplate: z.string().nullable(), authHeaders: Delivery.authHeaders, throttleSeconds: z.number().int(), throttleTopics: z.array(z.string()),
  autoDisableAfter: z.number().int().default(50), retryWindowHours: z.number().int().default(24),
  status: z.enum(['active', 'disabled']),
  app: z.string().nullable().optional(),
  consecutiveFailures: z.number().int(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
/** `secret` is shown exactly once (create / rotate); absent when the caller supplied its own. */
export const WebhookEndpointCreated = WebhookEndpointDto.extend({ secret: z.string().optional() });
export const WebhookSecretResult = z.object({
  secret: z.string(),
  /** Until then deliveries also carry the old secret's signature (a second `v1=`); null when it stopped at once. */
  previousSecretExpiresAt: Timestamp.nullable(),
});
/** `graceHours`: how long the old secret keeps signing next to the new one (default 24; `0` stops it at once, e.g. after a leak). */
export const RotateWebhookSecretQuery = z.object({ graceHours: z.coerce.number().int().min(0).max(168).optional() });
export const WebhookEndpointPage = pageResult(WebhookEndpointDto);
/** `app` lists one product's endpoints (an app-bound key always gets its own). */
export const WebhookEndpointQuery = PageQuery.extend({ app: AppSlug.optional() });

export const WebhookDeliveryStatus = z.enum(['pending', 'succeeded', 'failed']);
export const WebhookDeliveryDto = z.object({
  id: Id,
  endpointId: Id,
  outboxId: Id.nullable(),
  topic: z.string(),
  attempt: z.number().int(),
  status: WebhookDeliveryStatus,
  responseCode: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  error: z.string().nullable(),
  nextAttemptAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export const WebhookDeliveryPage = pageResult(WebhookDeliveryDto);
export const WebhookDeliveriesQuery = PageQuery.extend({ status: WebhookDeliveryStatus.optional() });

/** Pull journal entry: `offset` is the opaque, increasing position consumers resume from. */
export const WebhookJournalEntry = z.object({ offset: z.number().int(), id: Id, topic: z.string(), createdAt: Timestamp, data: z.unknown() });
export const WebhookJournalQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** Entries strictly after this offset (omit to start at the beginning). */
  after: z.coerce.number().int().min(0).optional(),
  /** Apply this endpoint's topics and filters to the stream. */
  endpointId: Id.optional(),
  topic: WebhookTopicPattern.optional(),
});
export const WebhookJournalPage = z.object({ items: z.array(WebhookJournalEntry), nextOffset: z.number().int().nullable() });
export const WebhookJournalBounds = z.object({ earliest: z.number().int().nullable(), latest: z.number().int().nullable() });
export const WebhookJournalBatchBody = z.object({ offsets: z.array(z.number().int().min(0)).min(1).max(500) });

export const WebhookSummaryQuery = z.object({ endpointId: Id.optional(), since: Timestamp.optional(), until: Timestamp.optional() });
export const WebhookSummary = z.object({ total: z.number().int(), succeeded: z.number().int(), failed: z.number().int(), pending: z.number().int(), avgLatencyMs: z.number().int().nullable() });
export const WebhookSummaryByDate = z.object({ items: z.array(WebhookSummary.extend({ date: z.string() })) });
export const WebhookRetriggerResult = z.object({ requeued: z.number().int() });
export const WebhookExportQuery = z.object({
  endpointId: Id.optional(), status: WebhookDeliveryStatus.optional(), since: Timestamp.optional(), until: Timestamp.optional(), format: z.enum(['ndjson', 'csv']).default('ndjson'),
});

export type CreateWebhookEndpoint = z.infer<typeof CreateWebhookEndpoint>;
export type UpdateWebhookEndpoint = z.infer<typeof UpdateWebhookEndpoint>;
export type WebhookEndpointDto = z.infer<typeof WebhookEndpointDto>;
export type WebhookEndpointCreated = z.infer<typeof WebhookEndpointCreated>;
export type WebhookDeliveryDto = z.infer<typeof WebhookDeliveryDto>;

export const IntegrationSecretName = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,99}$/, 'Use lowercase letters, digits, ".", "-" and "_"');
export const PutIntegrationSecretBody = z.object({ value: z.string().min(1).max(4096), description: z.string().max(300).nullable().optional() });
export const IntegrationSecretParams = z.object({ name: IntegrationSecretName });
/** Signs in with Google and saves the refreshable grant under `secretName` (journey Google Sheets steps reference it). */
export const GoogleSecretStartBody = z.object({ secretName: IntegrationSecretName });
/** Never carries the value. */
export const IntegrationSecretDto = z.object({ id: Id, name: z.string(), description: z.string().nullable(), createdAt: Timestamp, updatedAt: Timestamp });
export const IntegrationSecretList = z.object({ items: z.array(IntegrationSecretDto) });

/** Async journal export job: same filters as the journal read; poll the job, then download the CSV. */
export const WebhookJournalExportBody = z.object({ after: z.number().int().min(0).optional(), endpointId: Id.optional(), topic: WebhookTopicPattern.optional() });
