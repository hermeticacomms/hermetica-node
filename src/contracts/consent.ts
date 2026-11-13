import { z } from 'zod';
import { AppSlug, Channel, DateTimeIn, Id, Purpose, Timestamp, patchOf } from './common.ts';

export const ConsentStatus = z.enum(['granted', 'revoked', 'pending_confirmation']);
export const LegalBasis = z.enum(['consent', 'legitimate_interest', 'contract', 'other']);
export type LegalBasis = z.infer<typeof LegalBasis>;
export const ConsentSource = z.enum(['form', 'import', 'api', 'sms_keyword', 'preference_center', 'admin', 'double_opt_in', 'instagram_dm', 'facebook_dm']);
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
  proof: z.record(z.string(), z.unknown()).nullish().describe('From an API key, a proof source needs evidence: form → formSubmissionId; double_opt_in / sms_keyword → consentRecordId of that flow'),
  expiresAt: DateTimeIn().nullish(),
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
  /** Source of the record behind this state (form, double_opt_in, api, ...). */
  source: z.string().nullable().optional(),
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
  /** Product that owns the topic (null = shared). Keys stay workspace-unique, so still prefix them across products. */
  app: AppSlug.nullish(),
});
export type TopicInput = z.input<typeof TopicInput>;
// Without defaults: zod 4 `.partial()` keeps them, so patching only the name would flip defaultOptIn back to false.
export const TopicPatch = TopicInput.omit({ channel: true, key: true }).extend({ defaultOptIn: z.boolean().optional(), visibleInPreferenceCenter: z.boolean().optional() }).partial();
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
  app: z.string().nullable().optional(),
  createdAt: Timestamp,
  archivedAt: Timestamp.nullable().optional(),
  /** With ?counts=true: people with granted consent on this topic. */
  subscriberCount: z.number().int().optional(),
});

/** Interest category: groups topics with a display type for the preference centre. */
export const TopicGroupBody = z.object({
  name: z.string().trim().min(1).max(128),
  displayType: z.enum(['checkboxes', 'radio', 'dropdown', 'hidden']).default('checkboxes'),
  position: z.number().int().min(0).max(10_000).default(0),
});
export type TopicGroupBody = z.infer<typeof TopicGroupBody>;
export const TopicGroupPatch = patchOf(TopicGroupBody);
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
  createdFrom: DateTimeIn().optional(),
  createdTo: DateTimeIn().optional(),
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
  /** Outbound sequence the send belongs to: a legitimate-interest assessment scoped to it may lift a jurisdiction block. */
  sequenceId: Id.optional(),
});
export type EligibilityRequest = z.infer<typeof EligibilityRequest>;
/** `liaId`: the legitimate-interest assessment that lifted this prospecting send's jurisdiction block. */
export const Eligibility = z.object({ eligible: z.boolean(), reasons: z.array(BlockReason), liaId: z.string().optional() });
export type Eligibility = z.infer<typeof Eligibility>;

/** Workspace-wide opt-outs (latest consent state revoked), filterable by channel and topic. */
export const OptoutListQuery = z.object({
  channel: Channel.optional(), topicId: z.union([z.uuid(), z.literal('none')]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
});
export const OptoutDto = z.object({ profileId: z.uuid(), channel: Channel, purpose: z.string(), topicId: z.uuid().nullable(), revokedAt: Timestamp });
export const OptoutPage = z.object({ items: z.array(OptoutDto), total: z.number().int() });

/** Clear hard-bounce suppressions in a date range (or one address); admin only, audited with the reason. */
export const BounceLiftBody = z.object({ startDate: DateTimeIn().optional(), endDate: DateTimeIn().optional(), email: z.string().max(320).optional(), reason: z.string().min(1).max(500) });
export const BounceLiftResult = z.object({ lifted: z.number().int() });

/** Legitimate-interest assessment (D-OUT-29): unlocks prospecting to the listed default-blocked countries until revoked. */
export const LiaInput = z.object({
  purpose: z.string().trim().min(10).max(4000),
  balancingTest: z.string().trim().min(10).max(8000),
  optOutWording: z.string().trim().min(5).max(1000),
  countries: z.array(z.string().length(2)).min(1).max(40),
  /** Limit it to these outbound sequences and/or profiles in these segments; both empty = every prospecting path. */
  sequenceIds: z.array(Id).max(50).optional(), segmentIds: z.array(Id).max(50).optional(),
  /** When to look at it again (a reminder, not enforced) and when it stops unlocking anything. */
  reviewAt: DateTimeIn().nullable().optional(), expiresAt: DateTimeIn().nullable().optional(),
  /** The full assessment document: a file in the content library. */
  documentAssetId: Id.nullable().optional(),
});
/** Scope, dates and document of a recorded assessment; the assessment text itself is evidence and does not change (record a new one). */
export const LiaPatch = z.object({
  sequenceIds: z.array(Id).max(50).optional(), segmentIds: z.array(Id).max(50).optional(),
  reviewAt: DateTimeIn().nullable().optional(), expiresAt: DateTimeIn().nullable().optional(), documentAssetId: Id.nullable().optional(),
});
export const LiaDto = z.object({
  id: Id, purpose: z.string(), balancingTest: z.string(), optOutWording: z.string(), countries: z.array(z.string()),
  assessedBy: Id.nullable(), revokedAt: Timestamp.nullable(), createdAt: Timestamp,
  sequenceIds: z.array(Id), segmentIds: z.array(Id), reviewAt: Timestamp.nullable(), expiresAt: Timestamp.nullable(), documentAssetId: Id.nullable(),
});
export const LiaList = z.object({ items: z.array(LiaDto), blockedCountries: z.array(z.string()), unlockableCountries: z.array(z.string()) });
