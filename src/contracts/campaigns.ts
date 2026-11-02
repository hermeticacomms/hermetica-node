import { z } from 'zod';
import { Channel, Id, PageQuery, Purpose, ReplyToList, Timestamp, pageResult } from './common.ts';
import { AbTestConfig } from './experiments.ts';
import { PushTestTarget } from './push.ts';
import { MetricCounts, AvailabilityMap } from './analytics.ts';

/** `failed`: fan-out errored out after its retries; nothing more is sent (messages already queued still go). */
export const CampaignStatus = z.enum(['draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const CampaignAction = z.enum(['schedule', 'unschedule', 'start', 'pause', 'resume', 'complete', 'cancel', 'fail']);
export type CampaignAction = z.infer<typeof CampaignAction>;

export const CampaignAudience = z.object({
  includeSegmentIds: z.array(Id).max(50).default([]),
  includeListIds: z.array(Id).max(50).default([]),
  excludeSegmentIds: z.array(Id).max(50).default([]),
  excludeListIds: z.array(Id).max(50).default([]),
  /** Send to one contact per company (the lowest profile id); people without a company are all kept. */
  onePerCompany: z.boolean().optional(),
  /** Everyone in the workspace (not deleted or archived); exclusions still apply. */
  everyone: z.boolean().optional(),
  /** People carrying any of these profile tags (by name, as everywhere in the tag API). */
  includeTags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  excludeTags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});
export type CampaignAudience = z.infer<typeof CampaignAudience>;

const Minutes = z.number().int().min(0).max(1440);
export const CampaignSchedule = z.object({
  /** Fixed instant, or (recipientLocal) the wall-clock time read in `tz` and re-applied in each recipient's zone. */
  at: z.coerce.date(),
  tz: z.string().min(1).max(64).default('UTC'),
  recipientLocal: z.boolean().default(false),
  throttlePerHour: z.number().int().min(1).max(1_000_000).optional(),
  /** Allowed send window, minutes-of-day in the recipient zone (or `tz` when not recipientLocal). */
  window: z.object({ startMin: Minutes, endMin: Minutes }).optional(),
  /** `optimized`: each recipient's own best hour (T6.4) within 24 h of `at`; falls back to the workspace best hour. Ignores throttle. */
  sendTime: z.enum(['fixed', 'optimized']).default('fixed'),
  /** Recipient-local sends: where the local time has already passed, send `immediately` (default) or at that time `tomorrow`. */
  pastZones: z.enum(['immediately', 'tomorrow']).optional(),
  /** Recipients frozen and sent per fan-out transaction (default 100). Smaller batches hold locks for less time. */
  batchSize: z.number().int().min(10).max(1000).optional(),
});
export type CampaignSchedule = z.infer<typeof CampaignSchedule>;

export const CampaignRoute = z.object({ connectionId: Id.optional(), poolId: Id.optional(), routePolicyId: Id.optional() });

export const VariantInput = z.object({
  key: z.string().min(1).max(32),
  templateVersionId: Id,
  subject: z.string().max(998).nullish(),
  fromName: z.string().max(200).nullish(),
  previewText: z.string().max(300).nullish(),
  replyTo: ReplyToList.nullish(),
  imageAssetId: Id.nullish(),
  sendOffset: z.number().int().min(0).max(10_080).default(0),
  weight: z.number().int().min(1).max(1000).default(1),
});
export type VariantInput = z.infer<typeof VariantInput>;

/** Per-campaign tracking toggles; an unset key falls back to the workspace default. */
export const CampaignTracking = z.object({ opens: z.boolean().optional(), clicks: z.boolean().optional() });
export type CampaignTracking = z.infer<typeof CampaignTracking>;

/** Fanout pauses itself when failed or bounced sends pass these shares of the attempted sends (after `minSample` attempts). Unset = defaults. */
export const CampaignAutoPause = z.object({
  enabled: z.boolean().default(true),
  maxFailureRate: z.number().min(0).max(1).default(0.25),
  maxBounceRate: z.number().min(0).max(1).default(0.1),
  minSample: z.number().int().min(10).max(100_000).default(50),
});
export type CampaignAutoPause = z.infer<typeof CampaignAutoPause>;

/** Archive page path segment: `/p/a/<list>/<slug>`. */
export const CampaignSlug = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes');

/** Review drafts nobody decided within `hours` of fan-out are sent (consent and suppression still apply) or skipped. */
export const ReviewDeadline = z.object({ hours: z.number().int().min(1).max(720), action: z.enum(['send', 'skip']) });
export type ReviewDeadline = z.infer<typeof ReviewDeadline>;

export const CreateCampaignBody = z.object({
  name: z.string().trim().min(1).max(200),
  channel: Channel,
  purpose: Purpose.default('marketing'),
  audience: CampaignAudience.default({ includeSegmentIds: [], includeListIds: [], excludeSegmentIds: [], excludeListIds: [] }),
  templateId: Id.nullish(),
  route: CampaignRoute.default({}),
  schedule: CampaignSchedule.nullish(),
  utm: z.record(z.string(), z.string()).nullish(),
  topicId: Id.nullish(),
  tracking: CampaignTracking.nullish(),
  autoPause: CampaignAutoPause.nullish(),
  slug: CampaignSlug.nullish(),
  /** Values the public archive/web-version page shows in place of the recipient's (for example first_name: friend). */
  archiveProfile: z.record(z.string().max(60), z.string().max(200)).nullish(),
  /** List the sent campaign on the public archive page of its audience lists. */
  inArchive: z.boolean().optional(),
  variants: z.array(VariantInput).max(8).default([]),
  /** Test-then-send: `testPercent` of the audience gets the variants; the winner goes to the rest. */
  abTest: AbTestConfig.nullish(),
  /** Hold every recipient's message as a draft to review, edit and send (GET /v1/campaigns/:id/drafts). */
  reviewDrafts: z.boolean().optional(),
  reviewDeadline: ReviewDeadline.nullish(),
});
export type CreateCampaignBody = z.input<typeof CreateCampaignBody>;

/** Explicit (no defaults): a PATCH must only touch the fields it names. */
export const UpdateCampaignBody = z.object({
  name: CreateCampaignBody.shape.name.optional(),
  purpose: Purpose.optional(),
  audience: CampaignAudience.optional(),
  templateId: Id.nullish(),
  route: CampaignRoute.optional(),
  schedule: CampaignSchedule.nullish(),
  utm: z.record(z.string(), z.string()).nullish(),
  topicId: Id.nullish(),
  tracking: CampaignTracking.nullish(),
  autoPause: CampaignAutoPause.nullish(),
  slug: CampaignSlug.nullish(),
  archiveProfile: z.record(z.string().max(60), z.string().max(200)).nullable().optional(),
  inArchive: z.boolean().optional(),
  variants: z.array(VariantInput).max(8).optional(),
  abTest: AbTestConfig.nullish(),
  reviewDrafts: z.boolean().optional(),
  reviewDeadline: ReviewDeadline.nullish(),
});

/** Planning details, editable at any status. Dates are calendar days; the campaign's real send time is its schedule. */
export const CampaignDetailsBody = z.object({
  ownerId: Id.nullable(),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  notes: z.string().max(5000).nullable(),
}).refine((b) => !b.startsOn || !b.endsOn || b.endsOn >= b.startsOn, { message: 'The end date cannot be before the start date', path: ['endsOn'] });
export const CampaignDetailsDto = z.object({ id: Id, ownerId: Id.nullable(), startsOn: z.string().nullable(), endsOn: z.string().nullable(), notes: z.string().nullable() });

export const CampaignScheduleDto = CampaignSchedule.extend({ at: Timestamp });

export const CampaignDto = z.object({
  id: Id,
  name: z.string(),
  channel: Channel,
  purpose: Purpose,
  status: CampaignStatus,
  audience: CampaignAudience,
  /** Set once the audience was frozen into recipients (fanout started). */
  audienceFrozenAt: Timestamp.nullable(),
  templateId: Id.nullable(),
  topicId: Id.nullable(),
  route: CampaignRoute,
  schedule: CampaignScheduleDto.nullable(),
  abTest: AbTestConfig.nullable(),
  /** Only on GET /v1/campaigns/:id. */
  variants: z.array(VariantInput).optional(),
  utm: z.record(z.string(), z.string()).nullable(),
  tracking: CampaignTracking.nullable(),
  autoPause: CampaignAutoPause.nullable(),
  slug: z.string().nullable(),
  archiveProfile: z.record(z.string(), z.string()).nullable(),
  inArchive: z.boolean(),
  ownerId: Id.nullish(),
  startsOn: z.string().nullish(),
  endsOn: z.string().nullish(),
  notes: z.string().nullish(),
  approvalStatus: z.string(),
  approvedBy: z.string().nullable(),
  startedAt: Timestamp.nullable(),
  completedAt: Timestamp.nullable(),
  testSentAt: Timestamp.nullable(),
  /** Set when the content of a sent campaign was erased. */
  contentErasedAt: Timestamp.nullish(),
  /** Free-form counters; `audience` is the frozen audience size once known. */
  stats: z.record(z.string(), z.number()),
  /** Hidden from the default list; still reportable. */
  archivedAt: Timestamp.nullish(),
  /** The campaign this one was made from: a resend's original, or an RSS issue's feed campaign. */
  parentCampaignId: Id.nullish(),
  reviewDrafts: z.boolean().optional(),
  reviewDeadline: ReviewDeadline.nullish(),
  /** Why fan-out failed (status `failed`). */
  failureReason: z.string().nullish(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const CampaignEraseResult = z.object({ outcome: z.enum(['deleted', 'content_erased']) });
export type CampaignDto = z.infer<typeof CampaignDto>;
export const CampaignPage = pageResult(CampaignDto);
/** Shared by the list and search routes. `q` matches name, message subject and message content. */
export const CampaignListQuery = PageQuery.extend({
  status: CampaignStatus.optional(),
  q: z.string().max(200).optional(),
  channel: Channel.optional(),
  purpose: Purpose.optional(),
  folderId: Id.optional(),
  tag: z.string().max(80).optional(),
  listId: Id.optional(),
  /** Created-at range. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  scheduledFrom: z.coerce.date().optional(),
  scheduledTo: z.coerce.date().optional(),
  updatedFrom: z.coerce.date().optional(),
  updatedTo: z.coerce.date().optional(),
  /** Send-time range: when sending started. */
  sentFrom: z.coerce.date().optional(),
  sentTo: z.coerce.date().optional(),
  /** Campaigns sent to this member (they are a frozen recipient). */
  profileId: Id.optional(),
  /** `true` lists only archived campaigns; default hides them. */
  archived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  /** `true` lists soft-deleted drafts (for restore). */
  deleted: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['created', 'updated', 'name', 'scheduled']).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type CampaignListQuery = z.infer<typeof CampaignListQuery>;

export const ChecklistItem = z.object({
  key: z.string(),
  severity: z.enum(['error', 'warning']),
  ok: z.boolean(),
  message: z.string(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;
export const ChecklistResult = z.object({ items: z.array(ChecklistItem), canSchedule: z.boolean() });

/** A saved seed list, addresses typed in for this one test, or both. */
export const TestSendBody = z.object({
  seedListId: Id.optional(),
  emails: z.array(z.email()).max(20).default([]),
  phones: z.array(z.string().min(5).max(32)).max(20).default([]),
  /** Push campaigns: the devices of this profile, or one pasted device token. */
  profileId: Id.optional(),
  pushToken: PushTestTarget.shape.pushToken,
}).refine((b) => b.seedListId || b.emails.length + b.phones.length > 0 || b.profileId || b.pushToken, 'Name a seed list, an address, a test profile or a device token');
export const TestSendResult = z.object({ sent: z.number().int(), blocked: z.number().int(), jobIds: z.array(Id) });

export const SeedListBody = z.object({
  name: z.string().trim().min(1).max(200),
  emails: z.array(z.email()).max(200).default([]),
  phones: z.array(z.string().min(5).max(32)).max(200).default([]),
});
export const SeedListDto = z.object({ id: Id, name: z.string(), emails: z.array(z.string()), phones: z.array(z.string()), createdAt: Timestamp, updatedAt: Timestamp });
export const SeedListPage = pageResult(SeedListDto);

export const CalendarQuery = z.object({ from: z.coerce.date(), to: z.coerce.date() });
export const CalendarItem = z.object({
  /** `workflow`: one occurrence of a live workflow's `schedule` (cron) trigger. */
  kind: z.enum(['campaign', 'workflow']),
  id: Id,
  name: z.string(),
  channel: Channel.nullable(),
  /** Campaign status, or the workflow status (`live`). */
  status: z.string(),
  at: Timestamp,
  /** Estimated completion: actual `completedAt`, else `at` + audience / throttle; equals `at` when there is no basis to estimate. */
  endAt: Timestamp,
  endEstimated: z.boolean(),
});
export const CalendarResult = z.object({ items: z.array(CalendarItem) });

export const CampaignReport = z.object({
  campaignId: Id,
  recipients: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
  /** Analytics rollup for this campaign (counts + per-metric availability for its sending connections). */
  analytics: z.object({ totals: MetricCounts, availability: AvailabilityMap }),
});

export const CampaignInsights = z.object({
  timeline: z.array(z.object({ hour: z.number().int(), opens: z.number().int(), clicks: z.number().int(), unsubscribes: z.number().int() })),
  links: z.array(z.object({ url: z.string(), total: z.number().int(), unique: z.number().int() })),
  domains: z.array(z.object({ group: z.enum(['gmail', 'outlook', 'yahoo', 'icloud', 'other']), sent: z.number().int(), opened: z.number().int(), clicked: z.number().int() })),
  devices: z.array(z.object({ device: z.enum(['mobile', 'desktop', 'webmail', 'unknown']), opens: z.number().int(), clicks: z.number().int() })),
  machineEvents: z.number().int(),
  problems: z.object({ unsubscribes: z.number().int(), complaints: z.number().int(), bounces: z.number().int() }),
  /** Attributed conversions; amounts in minor units (the workspace currency is not carried per conversion). */
  revenue: z.object({ orders: z.number().int(), revenueMinor: z.number().int() }),
});
export type CampaignInsights = z.infer<typeof CampaignInsights>;
