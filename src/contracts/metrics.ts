import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';
import { EventRecord } from './events.ts';

// ---- property conditions (shared by filters and custom metrics) --------------------------------------------------------
export const CONDITION_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 'starts_with', 'ends_with', 'exists', 'not_exists', 'in', 'not_in', 'between'] as const;
export const PropertyCondition = z.object({
  property: z.string().min(1).max(128),
  op: z.enum(CONDITION_OPS).default('eq'),
  /** Arrays carry `in`/`not_in` members and the `[low, high]` of `between`. */
  value: z.union([z.string().max(512), z.number(), z.boolean(), z.array(z.union([z.string().max(512), z.number()])).max(100)]).optional(),
});
export type PropertyCondition = z.infer<typeof PropertyCondition>;

// ---- event explorer ---------------------------------------------------------------------------------------------------
export const EventExplorerQuery = PageQuery.extend({
  name: z.string().max(128).optional(),
  profileId: Id.optional(),
  from: Timestamp.optional(),
  to: Timestamp.optional(),
  /** JSON-encoded PropertyCondition[] (query strings carry no arrays). */
  filter: z.string().max(4000).optional(),
  /** By when it happened: `datetime` oldest first, `-datetime` newest first. Default: newest received first. */
  sort: z.enum(['datetime', '-datetime']).optional(),
  /** Comma separated: `metric` (the event's definition) and/or `profile` (who did it). */
  include: z.string().max(40).regex(/^(metric|profile)(,(metric|profile))?$/, 'include takes metric and/or profile').optional(),
  /** Only events from messages of this journey, or of this broadcast (campaign). */
  journeyId: Id.optional(),
  broadcastId: Id.optional(),
});
export const EventExplorerPage = pageResult(EventRecord);
/** Matching events as CSV text (first 50,000). */
export const EventExportResult = z.object({ filename: z.string(), csv: z.string(), count: z.number().int(), truncated: z.boolean() });

// ---- metrics -----------------------------------------------------------------------------------------------------------
export const MetricSummary = z.object({
  name: z.string(),
  kind: z.enum(['event', 'custom']),
  customMetricId: Id.nullable(),
  category: z.enum(['standard', 'custom']),
  goal: z.boolean(),
  eventCount: z.number().int(),
  lastEventAt: Timestamp.nullable(),
  firstSeenAt: Timestamp.nullable(),
});
export const MetricList = z.object({ items: z.array(MetricSummary) });
export const ObservedProperty = z.object({ key: z.string(), types: z.array(z.string()), seen: z.number().int() });
export const MetricDetail = MetricSummary.extend({ schema: z.record(z.string(), z.string()).nullable(), properties: z.array(ObservedProperty) });
export const MetricParams = z.object({ name: z.string().min(1).max(128) });

export const AGGREGATE_MEASUREMENTS = ['count', 'unique', 'sum_value', 'avg_value', 'sum_property', 'avg_property'] as const;
export const INTERVALS = ['hour', 'day', 'week', 'month'] as const;
export const MetricAggregateQuery = z.object({
  /** An event name, a custom metric id, or `mapped:<role>`. */
  metric: z.string().min(1).max(128),
  measurement: z.enum(AGGREGATE_MEASUREMENTS).default('count'),
  /** Event property summed or averaged by `sum_property` / `avg_property`. */
  measurementProperty: z.string().min(1).max(128).optional(),
  interval: z.enum(INTERVALS).default('day'),
  /** Breakdown: an event property key, or `$source` / `$currency`. */
  by: z.string().min(1).max(128).optional(),
  from: Timestamp,
  to: Timestamp,
  timezone: z.string().min(1).max(64).default('UTC'),
  filter: z.array(PropertyCondition).max(10).default([]),
  /** Largest number of breakdown values returned (the rest are dropped). */
  topN: z.number().int().min(1).max(25).default(10),
});
export type MetricAggregateQuery = z.input<typeof MetricAggregateQuery>;
export const MetricAggregateResult = z.object({
  metric: z.string(), measurement: z.string(), interval: z.string(), timezone: z.string(), by: z.string().nullable(),
  /** Local bucket starts (ISO, no offset), oldest first; every series is aligned to them. */
  buckets: z.array(z.string()),
  series: z.array(z.object({ key: z.string(), values: z.array(z.number()), total: z.number() })),
  total: z.number(),
});

// ---- custom + mapped metrics ---------------------------------------------------------------------------------------------
export const MetricSource = z.object({ event: z.string().min(1).max(128), conditions: z.array(PropertyCondition).max(10).default([]) });
export const CustomMetricDefinition = z.object({
  sources: z.array(MetricSource).min(1).max(10),
  /** Numeric event property used as the metric's value; defaults to the event's own value. */
  valueProperty: z.string().min(1).max(128).nullable().default(null),
});
export const CreateCustomMetricBody = z.object({ name: z.string().trim().min(1).max(128), description: z.string().max(500).nullable().default(null), definition: CustomMetricDefinition });
export const UpdateCustomMetricBody = z.object({ name: z.string().trim().min(1).max(128).optional(), description: z.string().max(500).nullable().optional(), definition: CustomMetricDefinition.optional() });
export const CustomMetricDto = z.object({ id: Id, name: z.string(), description: z.string().nullable(), definition: CustomMetricDefinition, createdAt: Timestamp, updatedAt: Timestamp });
export const CustomMetricList = z.object({ items: z.array(CustomMetricDto) });

export const MAPPED_ROLES = ['placed_order', 'viewed_product', 'started_checkout', 'added_to_cart', 'submitted_form'] as const;
export const MappedMetricRole = z.enum(MAPPED_ROLES);
export const MappedMetricDto = z.object({ role: MappedMetricRole, metricName: z.string(), configured: z.boolean() });
export const MappedMetricList = z.object({ items: z.array(MappedMetricDto) });
export const SetMappedMetricBody = z.object({ metricName: z.string().trim().min(1).max(128) });

// ---- used by -----------------------------------------------------------------------------------------------------------
export const UsedByItem = z.object({ kind: z.enum(['workflow', 'campaign', 'segment', 'form', 'custom_metric', 'sender_pool']), id: Id, name: z.string(), status: z.string().nullable(), via: z.string() });
export const UsedByResult = z.object({ items: z.array(UsedByItem) });
export const UsedByParams = z.object({ kind: z.enum(['list', 'segment', 'template', 'metric', 'sender']), id: z.string().min(1).max(128) });
