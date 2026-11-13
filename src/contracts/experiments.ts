import { z } from 'zod';
import { Channel, DateTimeIn, Id, PageQuery, Purpose, Timestamp, pageResult } from './common.ts';

export const ExperimentKind = z.enum(['message_variant', 'path_split', 'holdout', 'send_time']);
export const ExperimentMethod = z.enum(['bayesian_beta', 'frequentist_ztest']);
/** Opens are accepted but flagged unreliable (Apple MPP, prefetch). */
export const PrimaryMetric = z.enum(['clicks', 'replies', 'conversions', 'revenue', 'opens']);
export type PrimaryMetric = z.infer<typeof PrimaryMetric>;
export const GuardrailMetric = z.enum(['unsubscribe', 'complaint', 'bounce']);
export type GuardrailMetric = z.infer<typeof GuardrailMetric>;

export const VariantWeight = z.object({ key: z.string().min(1).max(32), weight: z.number().int().min(0).max(1000) });
export type VariantWeight = z.infer<typeof VariantWeight>;

export const ExperimentMetricSpec = z.object({
  primary: PrimaryMetric.default('clicks'),
  /** Absolute increase in the rate (vs control) that counts as harm, e.g. 0.002 = +0.2 percentage points. */
  guardrails: z.array(z.object({ metric: GuardrailMetric, threshold: z.number().min(0).max(1) })).max(3).default([]),
});
export type ExperimentMetricSpec = z.infer<typeof ExperimentMetricSpec>;

export const AutoSelect = z.object({
  enabled: z.boolean().default(false),
  afterHours: z.number().int().min(1).max(24 * 30).default(4),
  pBest: z.number().min(0.5).max(0.999).default(0.95),
  /** End the test at this moment even without a clear winner: the variant that is ahead wins. */
  stopAt: z.iso.datetime({ offset: true }).optional(),
  /** While running, send more of the new traffic to the variants that look better (each keeps a share to keep learning). */
  shift: z.boolean().optional(),
  /** Stop early and keep the control when a variant (with the minimum sample) is likely worse on a guardrail, even before `afterHours`. Off = guardrails only block a winner. */
  stopOnGuardrail: z.boolean().optional(),
});
export type AutoSelect = z.infer<typeof AutoSelect>;

export const CreateExperimentBody = z.object({
  name: z.string().trim().min(1).max(200),
  kind: ExperimentKind.default('message_variant'),
  scopeType: z.enum(['campaign', 'workflow', 'form', 'workspace']),
  scopeId: Id.nullish(),
  key: z.string().max(64).default(''),
  variants: z.array(VariantWeight).min(2).max(10),
  control: z.string().max(32).optional(),
  metric: ExperimentMetricSpec.default({ primary: 'clicks', guardrails: [] }),
  method: ExperimentMethod.default('bayesian_beta'),
  autoSelect: AutoSelect.nullish(),
  minRecipients: z.number().int().min(1).max(1_000_000).default(100),
  minConversions: z.number().int().min(1).max(1_000_000).default(20),
});
export type CreateExperimentBody = z.input<typeof CreateExperimentBody>;

export const GuardrailResult = z.object({ metric: GuardrailMetric, rate: z.number(), pWorse: z.number().nullable(), failed: z.boolean() });
export const ReportArm = z.object({
  key: z.string(),
  n: z.number().int(),
  conversions: z.number().int(),
  rate: z.number(),
  ci: z.tuple([z.number(), z.number()]),
  pBest: z.number(),
  expectedLoss: z.number(),
  pValue: z.number().nullable(),
  guardrails: z.array(GuardrailResult),
  /** Attributed orders and revenue (minor units) for this variant, whatever the test is measured by. */
  orders: z.number().int().optional(),
  revenueMinor: z.number().optional(),
});
export const ExperimentReport = z.object({
  arms: z.array(ReportArm),
  recommendation: z.object({ kind: z.enum(['winner', 'keep_running', 'no_winner']), key: z.string().nullable() }),
  reason: z.string(),
  method: ExperimentMethod,
  metric: PrimaryMetric,
  /** True only when the decision rule is met; the UI must not say "significant" otherwise. */
  significant: z.boolean(),
  sampleSufficient: z.boolean(),
  /** Set when the metric is approximate (opens). */
  caveat: z.string().nullable(),
});
export type ExperimentReport = z.infer<typeof ExperimentReport>;

const Row = z.looseObject({ id: Id });
export const ExperimentDto = Row;
export const ExperimentPage = pageResult(ExperimentDto);
export const ExperimentListQuery = PageQuery.extend({ status: z.enum(['draft', 'running', 'concluded']).optional(), scopeId: Id.optional() });
export const ConcludeBody = z.object({ winnerKey: z.string().min(1).max(32) });

export const HoldoutScope = z.enum(['workspace', 'campaign', 'workflow']);
export const HoldoutBody = z.object({
  name: z.string().trim().min(1).max(200),
  percent: z.number().min(0).max(50),
  scopeType: HoldoutScope.default('workspace'),
  scopeId: Id.nullish(),
});
export const HoldoutDto = Row;
/** Incrementality: who of the held-back vs treated people did `event` after being assigned; the sample floors gate any recommendation. */
export const HoldoutReportQuery = z.object({
  event: z.string().min(1).max(128).default('purchase'),
  minPeople: z.coerce.number().int().min(1).max(1_000_000).default(100),
  minConversions: z.coerce.number().int().min(1).max(1_000_000).default(20),
});
export const HoldoutPage = pageResult(HoldoutDto);

/** Frequency caps (T6.3). `windowHours` instead of ms so the API stays human-sized. */
export const FrequencyCapInput = z.object({
  channel: Channel,
  purpose: Purpose,
  max: z.number().int().min(1).max(1000),
  windowHours: z.number().int().min(1).max(24 * 30),
});
export type FrequencyCapInput = z.infer<typeof FrequencyCapInput>;
export const SmartSending = z.object({ hours: z.number().int().min(1).max(24 * 14), action: z.enum(['defer', 'skip']).default('skip') });
export type SmartSending = z.infer<typeof SmartSending>;
export const FrequencySettingsBody = z.object({
  scopeType: z.enum(['workspace', 'campaign', 'workflow']).default('workspace'),
  scopeId: Id.nullish(),
  caps: z.array(FrequencyCapInput).max(20).default([]),
  smartSending: SmartSending.nullish(),
  /**
   * One cap over prospecting + marketing sends to the same person on a channel together (workspace: off by default). Omitted = keep the saved value.
   * Workspace row: null or `off` = off. Campaign/workflow override: null = follow the workspace, `off` = no cross-purpose cap for it, a cap = its own.
   */
  crossPurpose: z.union([z.object({ max: z.number().int().min(1).max(1000), windowHours: z.number().int().min(1).max(24 * 30) }), z.literal('off')]).nullish(),
});
export const FrequencySettingsDto = Row;
export const FrequencySettingsList = z.object({ items: z.array(FrequencySettingsDto) });

/** `hour` is local to `timezone`: the profile's own zone, else the workspace's. */
export const SendTimeRecommendation = z.object({ profileId: Id, hour: z.number().int().min(0).max(23), source: z.enum(['profile', 'workspace', 'default']), timezone: z.string().optional(), at: Timestamp });
/** `new_subscribers`: people in the audience now who were not sent the original; `non_purchasers`: recipients with no attributed order. */
export const ResendBody = z.object({
  to: z.enum(['non_openers', 'non_clickers', 'new_subscribers', 'non_purchasers']),
  subject: z.string().trim().min(1).max(998),
  at: DateTimeIn().optional(),
});
export const AbTestConfig = z.object({
  /** 100 = everyone gets a variant and you pick the winner by hand (nothing is held back). */
  testPercent: z.number().int().min(1).max(100).default(20),
  metric: PrimaryMetric.default('clicks'),
  waitHours: z.number().int().min(1).max(48).default(4),
  auto: z.boolean().default(true),
  method: ExperimentMethod.default('bayesian_beta'),
  /** Auto mode: chance of being best the leader needs before it is rolled out (unset = 0.95). */
  confidence: z.number().min(0.5).max(0.999).optional(),
  /** Guardrail: a variant whose unsubscribe/complaint/bounce rate is this much (absolute share) above control fails (unset = 0.005). */
  guardrail: z.number().min(0.001).max(0.1).optional(),
});
export type AbTestConfig = z.infer<typeof AbTestConfig>;
export const RolloutBody = z.object({ winnerKey: z.string().min(1).max(32).optional() });

/** Multivariate: every combination of the listed values becomes one variant (at most 8). An empty dimension keeps the base value. */
export const MultivariateGridBody = z.object({
  templateVersionIds: z.array(Id).max(8).default([]),
  subjects: z.array(z.string().trim().min(1).max(998)).max(8).default([]),
  fromNames: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  previewTexts: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
  /** Used where `templateVersionIds` is empty. */
  baseTemplateVersionId: Id,
});
export const MultivariateGridResult = z.object({
  combinations: z.number().int(),
  variants: z.array(z.object({ key: z.string(), templateVersionId: z.string(), subject: z.string().nullable(), fromName: z.string().nullable(), previewText: z.string().nullable() })),
});
