import { z } from 'zod';
import { Channel, Id, Purpose, Timestamp } from './common.ts';

export const ConsentStatus = z.enum(['granted', 'revoked', 'pending_confirmation']);
export const LegalBasis = z.enum(['consent', 'legitimate_interest', 'contract', 'other']);
export const ConsentSource = z.enum(['form', 'import', 'api', 'sms_keyword', 'preference_center', 'admin', 'double_opt_in']);
export const RevocationScope = z.enum(['topic', 'channel', 'all']);
export const SuppressionReason = z.enum(['unsubscribe', 'hard_bounce', 'complaint', 'stop_keyword', 'manual', 'invalid', 'dnc']);
export const SuppressionScope = z.enum(['global', 'topic', 'purpose']);
export const BlockReason = z.enum([
  'suppressed',
  'no_consent',
  'consent_revoked',
  'consent_expired',
  'topic_unsubscribed',
  'blocklisted_domain',
  'jurisdiction_blocked',
  'transactional_only',
  'snoozed',
  'channel_not_preferred',
  'frequency_limited',
]);
export type BlockReason = z.infer<typeof BlockReason>;

/** Consent assertion for one (channel, purpose, topic). */
export const ConsentInputBody = z.object({
  channel: Channel,
  purpose: Purpose,
  topicId: Id.nullish(),
  status: ConsentStatus,
  legalBasis: LegalBasis.default('consent'),
  source: ConsentSource,
  sourceRef: z.string().max(256).nullish(),
  disclosureText: z.string().max(4000).nullish(),
  disclosureVersion: z.string().max(64).nullish(),
  ip: z.string().max(64).nullish(),
  userAgent: z.string().max(512).nullish(),
  proof: z.record(z.string(), z.unknown()).nullish(),
  expiresAt: z.coerce.date().nullish(),
  revocationScope: RevocationScope.nullish(),
});
export type ConsentInputBody = z.input<typeof ConsentInputBody>;

export const ConsentInput = ConsentInputBody.extend({ profileId: Id });
export type ConsentInput = z.infer<typeof ConsentInput>;

export const ConsentRecordDto = z.object({
  id: Id,
  profileId: Id,
  channel: Channel,
  purpose: Purpose,
  topicId: Id.nullable(),
  status: ConsentStatus,
  legalBasis: LegalBasis,
  source: ConsentSource,
  sourceRef: z.string().nullable(),
  disclosureText: z.string().nullable(),
  disclosureVersion: z.string().nullable(),
  expiresAt: Timestamp.nullable(),
  revocationScope: RevocationScope.nullable(),
  at: Timestamp,
});
export const ConsentOutcome = z.union([z.object({ record: ConsentRecordDto }), z.object({ ignored: z.literal('revoked_previously') })]);
/** Latest status per (profile, channel, purpose, topic). */
export const ConsentStateDto = z.object({
  profileId: Id,
  channel: Channel,
  purpose: Purpose,
  topicId: Id.nullable(),
  status: ConsentStatus,
  recordId: Id,
  expiresAt: Timestamp.nullable(),
  updatedAt: Timestamp,
});

export const TopicInput = z.object({
  channel: Channel,
  key: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(128),
  description: z.string().max(1000).nullish(),
  defaultOptIn: z.boolean().default(false),
  visibleInPreferenceCenter: z.boolean().default(true),
  groupId: Id.nullish(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type TopicInput = z.input<typeof TopicInput>;
export const TopicPatch = TopicInput.omit({ channel: true, key: true }).partial();
export type TopicPatch = z.infer<typeof TopicPatch>;
export const TopicDto = z.object({
  id: Id,
  channel: Channel,
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  defaultOptIn: z.boolean(),
  visibleInPreferenceCenter: z.boolean(),
  groupId: Id.nullable().optional(),
  position: z.number().int().optional(),
  createdAt: Timestamp,
});

/** Interest category: groups topics with a display type for the preference centre. */
export const TopicGroupBody = z.object({
  name: z.string().trim().min(1).max(128),
  displayType: z.enum(['checkboxes', 'radio', 'dropdown', 'hidden']).default('checkboxes'),
  position: z.number().int().min(0).max(10_000).default(0),
});
export type TopicGroupBody = z.infer<typeof TopicGroupBody>;
export const TopicGroupPatch = TopicGroupBody.partial();
export const TopicGroupDto = z.object({ id: Id, name: z.string(), displayType: z.string(), position: z.number().int(), topicCount: z.number().int().optional(), createdAt: Timestamp });

export const SuppressionInput = z.object({
  channel: Channel,
  value: z.string().min(1).max(320),
  scope: SuppressionScope.default('global'),
  topicId: Id.nullish(),
  purpose: Purpose.nullish(),
  reason: SuppressionReason,
  sourceRef: z.string().max(256).nullish(),
});
export type SuppressionInput = z.input<typeof SuppressionInput>;
export const SuppressionDto = z.object({
  id: Id,
  channel: Channel,
  valueNormalized: z.string(),
  scope: SuppressionScope,
  topicId: Id.nullable(),
  purpose: Purpose.nullable(),
  reason: SuppressionReason,
  sourceRef: z.string().nullable(),
  liftedAt: Timestamp.nullable(),
  liftedBy: z.string().nullable(),
  liftReason: z.string().nullable(),
  createdAt: Timestamp,
});
export const SuppressionListQuery = z.object({
  channel: Channel.optional(),
  active: z.enum(['true', 'false']).optional(),
  /** Case-insensitive substring of the suppressed address / phone number. */
  q: z.string().trim().min(1).max(320).optional(),
  /** Suppression type. */
  reason: SuppressionReason.optional(),
  /** Email domain (e.g. example.com); email suppressions only. */
  domain: z.string().trim().toLowerCase().min(1).max(253).optional(),
  /** Created on/after, before. */
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: Id.optional(),
});
export const LiftSuppressionBody = z.object({ reason: z.string().min(1).max(500) });

export const BlocklistInput = z.object({ domain: z.string().min(3).max(253), reason: z.string().max(500).nullish() });
export const BlocklistDto = z.object({ id: Id, domain: z.string(), reason: z.string().nullable(), createdAt: Timestamp });

export const EligibilityRequest = z.object({
  profileId: Id,
  channel: Channel,
  purpose: Purpose,
  topicId: Id.optional(),
  destination: z.string().min(1).max(320),
  recipientCountry: z.string().length(2).optional(),
});
export type EligibilityRequest = z.infer<typeof EligibilityRequest>;
export const Eligibility = z.object({ eligible: z.boolean(), reasons: z.array(BlockReason) });
export type Eligibility = z.infer<typeof Eligibility>;

/** Workspace-wide opt-outs (latest consent state revoked), filterable by channel and topic. */
export const OptoutListQuery = z.object({
  channel: Channel.optional(), topicId: z.union([z.uuid(), z.literal('none')]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
});
export const OptoutDto = z.object({ profileId: z.uuid(), channel: Channel, purpose: z.string(), topicId: z.uuid().nullable(), revokedAt: Timestamp });
export const OptoutPage = z.object({ items: z.array(OptoutDto), total: z.number().int() });

/** Clear hard-bounce suppressions in a date range (or one address); admin only, audited with the reason. */
export const BounceLiftBody = z.object({ startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), email: z.string().max(320).optional(), reason: z.string().min(1).max(500) });
export const BounceLiftResult = z.object({ lifted: z.number().int() });
