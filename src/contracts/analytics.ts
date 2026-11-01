import { z } from 'zod';
import { Channel } from './common.ts';

export const METRICS = [
  'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'opened', 'opened_unique', 'clicked', 'clicked_unique', 'replied', 'unsubscribed',
] as const;
export const Metric = z.enum(METRICS);
export type Metric = z.infer<typeof Metric>;

export const MetricAvailability = z.enum(['available', 'unavailable', 'approximate']);
export type MetricAvailability = z.infer<typeof MetricAvailability>;
export const AvailabilityMap = z.record(Metric, MetricAvailability);

const Bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MessageAnalyticsQuery = z.object({
  from: Day, to: Day,
  groupBy: z.enum(['day', 'channel', 'source', 'variant']).default('day'),
  sourceKind: z.string().min(1).max(64).optional(),
  sourceId: z.string().min(1).max(128).optional(),
  channel: Channel.optional(),
  /** Count machine opens (Apple MPP, scanners) in opened / opened_unique. Off by default. */
  includeMachineOpens: Bool.optional(),
});
export type MessageAnalyticsQuery = z.infer<typeof MessageAnalyticsQuery>;

export const SummaryQuery = z.object({ includeMachineOpens: Bool.optional() });
export const SourceParams = z.object({ kind: z.string().min(1).max(64), id: z.string().min(1).max(128) });

export const MetricCounts = z.record(Metric, z.number().int());
export const SeriesPoint = z.object({ key: z.string(), counts: MetricCounts });

export const MessageAnalytics = z.object({
  groupBy: z.string(),
  series: z.array(SeriesPoint),
  totals: MetricCounts,
  availability: AvailabilityMap,
});
export type MessageAnalytics = z.infer<typeof MessageAnalytics>;

export const SourceSummary = z.object({ totals: MetricCounts, availability: AvailabilityMap });
export type SourceSummary = z.infer<typeof SourceSummary>;

// ---- predictive analytics ----------------------------------------------------------------------------------------------
export const PredictionDto = z.object({
  profileId: z.uuid(), model: z.string(), orderCount: z.number().int(), avgOrderMinor: z.number(), avgIntervalDays: z.number(),
  historicClvMinor: z.number(), predictedClvMinor: z.number(), expectedNextOrderAt: z.iso.datetime({ offset: true }), churnRisk: z.number(),
  why: z.string(), computedAt: z.iso.datetime({ offset: true }),
  /** BG/NBD models only: probability still active and expected orders in the next 365 days. */
  pAlive: z.number().nullish(), expectedOrders: z.number().nullish(),
});
/** Inference from the first name against US birth records; shown to staff and in templates, never shared with ad platforms or benchmarks. */
export const PredictedGenderDto = z.object({
  gender: z.enum(['likely_female', 'likely_male', 'uncertain']), confidence: z.number(), computedAt: z.iso.datetime({ offset: true }),
});
export const PredictionHoldout = z.object({
  holdoutWeeks: z.number(), customers: z.number().int(), mae: z.number(), baselineMae: z.number(), customerMae: z.number(), baselineCustomerMae: z.number(), priorMae: z.number(),
  totalPredicted: z.number(), totalActual: z.number(), beatsBaseline: z.boolean(),
  calibration: z.array(z.object({ bucket: z.string(), customers: z.number().int(), predicted: z.number(), actual: z.number(), baseline: z.number() })),
});
export const PredictionFit = z.object({
  version: z.string(), fittedAt: z.iso.datetime({ offset: true }), customers: z.number().int(), repeatBuyers: z.number().int(), priorUsed: z.string(), priorWeight: z.number(), networkCohort: z.string().nullable(),
  params: z.object({ r: z.number(), alpha: z.number(), a: z.number(), b: z.number() }), spendParams: z.object({ p: z.number(), q: z.number(), v: z.number() }), holdout: PredictionHoldout.nullable(),
});
export const PredictionStatus = z.object({
  model: z.string(), orderEvent: z.string(), eligible: z.boolean(), reason: z.string().nullable(),
  repeatCustomers: z.number().int(), spanDays: z.number(), minRepeatCustomers: z.number().int(), minSpanDays: z.number().int(),
  predictedProfiles: z.number().int(), lastComputedAt: z.iso.datetime({ offset: true }).nullable(),
  /** none: no model yet; prior_only: too little data to fit, population prior in use; fitted: model fitted on this workspace's customers */
  sufficiency: z.enum(['none', 'prior_only', 'fitted']),
  fit: PredictionFit.nullable(),
  lastAttempt: z.object({ fittedAt: z.iso.datetime({ offset: true }), promoted: z.boolean(), note: z.string() }).nullable(),
});
export const RecommendationDto = z.object({ productId: z.string(), title: z.string().nullable(), score: z.number(), rank: z.number().int(), basis: z.enum(['co_purchase', 'popular']) });
export const RecommendationList = z.object({ profileId: z.uuid(), computedAt: z.iso.datetime({ offset: true }).nullable(), items: z.array(RecommendationDto) });
export const PredictionRunResult = z.object({ ran: z.boolean(), profiles: z.number().int(), reason: z.string().nullable() });

// ---- funnels and cohorts -----------------------------------------------------------------------------------------------
const DayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const FunnelQuery = z.object({
  steps: z.array(z.string().min(1).max(128)).min(2).max(6),
  from: DayStr, to: DayStr,
  windowDays: z.number().int().min(1).max(365).default(30),
});
export type FunnelQuery = z.infer<typeof FunnelQuery>;
export const FunnelResult = z.object({ steps: z.array(z.object({ name: z.string(), profiles: z.number().int(), conversionFromPrevious: z.number().nullable(), conversionFromFirst: z.number().nullable() })) });

export const CohortQuery = z.object({
  anchorEvent: z.string().min(1).max(128), returnEvent: z.string().min(1).max(128),
  from: DayStr, to: DayStr, weeks: z.number().int().min(1).max(12).default(8),
});
export type CohortQuery = z.infer<typeof CohortQuery>;
export const CohortResult = z.object({ weeks: z.number().int(), cohorts: z.array(z.object({ cohort: z.string(), size: z.number().int(), retained: z.array(z.number().int()) })) });
