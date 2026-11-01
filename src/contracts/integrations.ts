import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';

/** Exact topic (`profile.created`), prefix wildcard (`segment.*`) or everything (`*`). */
export const WebhookTopicPattern = z.string().regex(/^(\*|[a-z_]+(\.[a-z_]+)*(\.\*)?)$/, 'Use an exact topic, "prefix.*" or "*"').max(100);

const Url = z.url().max(2048);
const Topics = z.array(WebhookTopicPattern).min(1).max(50);

/** A payload condition on `data` (dotted path). All filters of an endpoint must match for a delivery to be created. */
export const WebhookFilter = z.object({
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
};

export const CreateWebhookEndpoint = z.object({ url: Url, topics: Topics, description: z.string().max(500).optional(), filters: Scope.filters.optional(), listIds: Scope.listIds.optional(), sources: Scope.sources.optional(), sequenceIds: Scope.sequenceIds.optional(), bodyTemplate: Delivery.bodyTemplate.optional(), authHeaders: Delivery.authHeaders.optional(), throttleSeconds: Delivery.throttleSeconds.optional(), throttleTopics: Delivery.throttleTopics.optional() });
export const UpdateWebhookEndpoint = z.object({
  url: Url.optional(),
  topics: Topics.optional(),
  filters: Scope.filters.optional(), listIds: Scope.listIds.optional(), sources: Scope.sources.optional(), sequenceIds: Scope.sequenceIds.optional(),
  description: z.string().max(500).nullable().optional(),
  bodyTemplate: Delivery.bodyTemplate.nullable().optional(), authHeaders: Delivery.authHeaders.optional(), throttleSeconds: Delivery.throttleSeconds.optional(), throttleTopics: Delivery.throttleTopics.optional(),
  /** Re-enabling resets the failure counter. */
  status: z.enum(['active', 'disabled']).optional(),
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
  status: z.enum(['active', 'disabled']),
  consecutiveFailures: z.number().int(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
/** `secret` is shown exactly once (create / rotate). */
export const WebhookEndpointCreated = WebhookEndpointDto.extend({ secret: z.string() });
export const WebhookSecretResult = z.object({ secret: z.string() });
export const WebhookEndpointPage = pageResult(WebhookEndpointDto);

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
/** Never carries the value. */
export const IntegrationSecretDto = z.object({ id: Id, name: z.string(), description: z.string().nullable(), createdAt: Timestamp, updatedAt: Timestamp });
export const IntegrationSecretList = z.object({ items: z.array(IntegrationSecretDto) });

/** Async journal export job: same filters as the journal read; poll the job, then download the CSV. */
export const WebhookJournalExportBody = z.object({ after: z.number().int().min(0).optional(), endpointId: Id.optional(), topic: WebhookTopicPattern.optional() });
