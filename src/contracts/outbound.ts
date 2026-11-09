import { z } from 'zod';
import { DateTimeIn, Id, PageQuery, Purpose, Timestamp, pageResult } from './common.ts';
import { PostcardDesign } from './postcards.ts';

export const ProspectStatus = z.enum(['new', 'contacted', 'replied', 'interested', 'meeting_booked', 'won', 'lost', 'not_interested', 'bounced', 'unsubscribed', 'do_not_contact']);
export type ProspectStatus = z.infer<typeof ProspectStatus>;
export const ReplyCategory = z.enum(['positive', 'negative', 'neutral', 'ooo', 'auto_reply', 'bounce', 'unsubscribe', 'meeting', 'wrong_person']);
export type ReplyCategory = z.infer<typeof ReplyCategory>;
export const TaskKind = z.enum(['call', 'linkedin_visit', 'linkedin_connect', 'linkedin_message', 'sms', 'whatsapp', 'manual_email', 'reply_received', 'custom']);
export type TaskKind = z.infer<typeof TaskKind>;

// ---- sequences ------------------------------------------------------------------------------------------------
const Wait = { waitDays: z.number().int().min(0).max(365).default(0), businessDays: z.boolean().default(false) };
/** Evaluated after the step's wait, right before it runs. `engagement` looks at every earlier send of this sequence. */
export const StepCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('engagement'), event: z.enum(['opened', 'clicked', 'replied']), negate: z.boolean().default(false) }),
  /** Outcome a rep recorded on an earlier task step (`step` = that step's key, e.g. `s3`; omitted = the latest task). Call dispositions are free keys. */
  z.object({ kind: z.literal('task_outcome'), outcome: z.string().min(1).max(40), step: z.string().max(64).optional(), negate: z.boolean().default(false) }),
  z.object({ kind: z.literal('has_phone'), negate: z.boolean().default(false) }),
  /** The prospect accepted our LinkedIn connection request (set by the provider's new-relation signal, or by a rep completing the task). */
  z.object({ kind: z.literal('linkedin_connected'), negate: z.boolean().default(false) }),
  /** The prospect's latest reply was in this category (only matters when stop rules let the sequence continue, e.g. out-of-office). */
  z.object({ kind: z.literal('reply'), category: ReplyCategory, negate: z.boolean().default(false) }),
  /** Email verified valid: reads the profile's `email_status` attribute (set by lead verification or import customFields). */
  z.object({ kind: z.literal('verified'), negate: z.boolean().default(false) }),
  z.object({ kind: z.literal('field'), field: z.string().min(1).max(128), op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists', 'not_exists']), value: z.unknown().optional() }),
]);
export type StepCondition = z.infer<typeof StepCondition>;
const StepWindow = z.object({ startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440), weekdays: z.array(z.number().int().min(1).max(7)).min(1).optional() });
/** `when` false: the step is skipped. `window`: per-step send window overriding the sequence schedule. */
const Gate = { when: StepCondition.optional(), window: StepWindow.optional() };
export const EmailVariant = z.object({ templateId: Id, versionId: Id.optional(), weight: z.number().int().min(1).max(1000).default(1) });
const EmailStep = z.object({
  type: z.literal('email'), templateId: Id, versionId: Id.optional(), thread: z.enum(['new', 'reply']).default('new'), ...Wait, ...Gate,
  /** Extra variants (B to Z, 26 in all) next to the main template (A, weight `weightA`); each prospect gets one, sticky. */
  alternates: z.array(EmailVariant).max(25).default([]), weightA: z.number().int().min(1).max(1000).default(1),
  /** Re-weight variants toward the best reply rate once each has enough sends (maintenance job). */
  optimize: z.boolean().default(false),
  /** Send this step from this mailbox instead of the sequence's pool/pin (a fixed sender for a follow-up). */
  senderConnectionId: Id.optional(),
});
const WaitStep = z.object({ type: z.literal('wait'), days: z.number().int().min(1).max(365), businessDays: z.boolean().default(false) });
const TaskStep = z.object({
  type: z.literal('task'), kind: z.enum(['call', 'linkedin_visit', 'linkedin_connect', 'linkedin_message', 'sms', 'whatsapp', 'manual_email', 'custom']),
  title: z.string().trim().min(1).max(200), notes: z.string().max(5000).optional(), draft: z.string().max(20_000).optional(), ...Wait, ...Gate,
});
/** Sub-sequence: move the prospect into another sequence (e.g. "interested -> nurture") and end this one. */
const JumpStep = z.object({ type: z.literal('jump'), sequenceId: Id, ...Wait, ...Gate });
/**
 * Automated SMS. Prospecting SMS stays blocked by default: the send is made with the `marketing` purpose, so delivery only sends
 * when the prospect has granted SMS consent, and STOP (a suppression) always wins.
 */
const SmsStep = z.object({ type: z.literal('sms'), templateId: Id, versionId: Id.optional(), ...Wait, ...Gate });
/** API call / webhook step. `signingSecret` is write-only (sealed by the API; reads show `signingSecretSet`). */
const WebhookStep = z.object({
  type: z.literal('webhook'), url: z.url(), body: z.record(z.string(), z.unknown()).optional(), headers: z.record(z.string(), z.string()).optional(),
  maxAttempts: z.number().int().min(1).max(8).default(5), signingSecret: z.string().min(8).max(200).optional(), signingSecretSealed: z.string().max(2000).optional(), signingSecretSet: z.boolean().optional(),
  responseMap: z.array(z.object({ path: z.string().min(1).max(200), field: z.string().min(1).max(128) })).max(20).default([]), ...Wait, ...Gate,
});
/**
 * LinkedIn action through the customer's own provider account, within that account's daily limits and random spacing.
 * With no connected LinkedIn provider it becomes a manual task for a person instead. `message` is the connection note or chat text (liquid; notes cap at 300 characters).
 */
const LinkedinStep = z.object({ type: z.literal('linkedin'), action: z.enum(['visit', 'connect', 'message', 'like_post', 'inmail']), message: z.string().max(4000).optional(), ...Wait, ...Gate });
/** WhatsApp send of an approved template (a content template of channel whatsapp). Needs explicit WhatsApp consent; blocked otherwise. */
const WhatsappStep = z.object({ type: z.literal('whatsapp'), templateId: Id, versionId: Id.optional(), ...Wait, ...Gate });
/**
 * Voice message from an uploaded clip (`/v1/outbound/voice-clips`): a LinkedIn voice note through the connected provider account (same gate,
 * limits and spacing as a LinkedIn message; a manual task without one), or a call task carrying the clip for a voicemail drop through the workspace's own Twilio.
 */
const VoiceStep = z.object({ type: z.literal('voice'), clipId: Id, via: z.enum(['linkedin', 'voicemail']), message: z.string().max(4000).optional(), title: z.string().trim().max(200).optional(), ...Wait, ...Gate });
/** Printed postcard through a print connection (Lob, PostGrid). Prospects without a complete postal address, or suppressed, are skipped. */
const PostcardStep = z.object({ type: z.literal('postcard'), design: PostcardDesign, connectionId: Id, ...Wait, ...Gate });
const leafSteps = [EmailStep, WaitStep, TaskStep, JumpStep, SmsStep, WebhookStep, LinkedinStep, WhatsappStep, VoiceStep, PostcardStep] as const;
/** A step that is not a branch: what a branch path may contain (one level of branching, no nesting). */
export const SequenceLeafStep = z.discriminatedUnion('type', leafSteps);
export type SequenceLeafStep = z.infer<typeof SequenceLeafStep>;
/** Real branching: the first branch whose condition holds runs its own steps; none matching runs `otherwise`; all paths then rejoin. */
export const BranchStep = z.object({
  type: z.literal('branch'), ...Wait,
  branches: z.array(z.object({ key: z.string().regex(/^[a-z0-9]{1,8}$/), label: z.string().max(80).optional(), when: StepCondition, steps: z.array(SequenceLeafStep).max(20).default([]) })).min(1).max(8),
  otherwise: z.array(SequenceLeafStep).max(20).default([]),
});
export const SequenceStep = z.discriminatedUnion('type', [...leafSteps, BranchStep]);
export type SequenceStep = z.infer<typeof SequenceStep>;

export const StopRules = z.object({
  /** `human`: auto-replies/OOO do not count as a reply; `any`: every inbound reply stops the sequence. */
  onReply: z.enum(['human', 'any']).default('human'),
  onAutoReply: z.enum(['continue', 'pause']).default('continue'),
  onOoo: z.enum(['pause_until_return', 'continue', 'stop']).default('pause_until_return'),
  /** A human reply from anyone at the same company domain: end the other live enrollments there (default for new sequences), pause them, or leave them alone. */
  onCompanyReply: z.enum(['none', 'stop', 'pause']).default('stop'),
});
export type StopRules = z.infer<typeof StopRules>;

export const DedupeRules = z.object({
  /** Prospect already live in another sequence: skip (default) or allow. */
  crossSequence: z.enum(['skip', 'allow']).default('skip'),
  /** Skip prospects contacted by any sequence within N days. */
  contactedWithinDays: z.number().int().min(0).max(3650).default(0),
  /** One contact per company domain at a time. */
  domain: z.boolean().default(false),
});

export const SequenceSettings = z.object({
  steps: z.array(SequenceStep).max(50).default([]),
  schedule: z.object({
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
    startMin: z.number().int().min(0).max(1440).default(540),
    endMin: z.number().int().min(0).max(1440).default(1020),
    timezoneSource: z.enum(['prospect', 'sequence']).default('prospect'),
    timezone: z.string().default('UTC'),
  }).default({ weekdays: [1, 2, 3, 4, 5], startMin: 540, endMin: 1020, timezoneSource: 'prospect', timezone: 'UTC' }),
  mailbox: z.object({
    poolId: Id.optional(),
    connectionId: Id.optional(),
    sticky: z.boolean().default(true),
    /** Sticky mailbox became unavailable: pause the enrollment (default) or move it to another pool member (new thread). */
    onUnavailable: z.enum(['pause', 'reassign']).default('pause'),
    /** ESP matching (unset = on): a new prospect on Gmail/Google Workspace gets a Google mailbox, on Outlook/M365 a Microsoft one, when such a mailbox has room today. */
    matchProvider: z.boolean().optional(),
  }).default({ sticky: true, onUnavailable: 'pause' }),
  dailyNewLimit: z.number().int().min(1).max(100_000).optional(),
  /** Share (%) of `dailyNewLimit` held back for follow-ups, so new prospects can use only the rest. */
  followUpPercent: z.number().int().min(0).max(90).optional(),
  /** Send every email of this sequence as plain text: no HTML part, no tracking pixel. */
  plainTextOnly: z.boolean().optional(),
  /** Add an open pixel to this sequence's HTML emails so "opened" conditions can fire. Prospecting mail has none by default; ignored with `plainTextOnly`. */
  trackOpens: z.boolean().optional(),
  /** Wording of the unsubscribe link in the footer (default "Unsubscribe"). */
  unsubscribeText: z.string().trim().min(1).max(120).optional(),
  /** `{a|b}` wording: random per send (default) or rotated evenly across the sequence's sends of a step. */
  spintaxMode: z.enum(['random', 'sequential']).optional(),
  /** Campaign variables: `{{ vars.key }}` in every email of this sequence. */
  variables: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().max(500)).refine((v) => Object.keys(v).length <= 30, 'At most 30 variables').refine((v) => !['locale', 'rss', 'trigger', 'message'].some((k) => k in v), 'locale, rss, trigger and message are reserved names').optional(),
  /** This campaign's own do-not-send list (on top of the workspace blocklist): lower-case addresses and domains (a domain covers its subdomains). */
  blocklist: z.object({
    emails: z.array(z.email().transform((v) => v.toLowerCase())).max(2000).default([]),
    domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter a domain such as example.com')).max(500).default([]),
  }).optional(),
  /** Lemlist-style review gate: enrolled prospects wait (status `pending_review`) until someone launches them. */
  reviewBeforeSend: z.boolean().optional(),
  /** Per-message review gate: every rendered email waits in the review queue (never auto-sends) until approved, edited or rejected. */
  reviewEachMessage: z.boolean().optional(),
  stop: StopRules.default({ onReply: 'human', onAutoReply: 'continue', onOoo: 'pause_until_return', onCompanyReply: 'stop' }),
  /** Sub-sequences: when a reply to this sequence is classified as `category`, start `sequenceId` for that person (ending their other live sequences when `stopCurrent`). Consent, dedupe and blocklists still apply. */
  onCategory: z.array(z.object({ category: ReplyCategory, sequenceId: Id, stopCurrent: z.boolean().default(true) })).max(10).optional(),
  /** Positive reply -> opt-in ask: email the prospect a double opt-in link for `listId` (the list's confirmation email). Only their click grants marketing consent. */
  optInAsk: z.object({ listId: Id, connectionId: Id.optional() }).optional(),
  /** Default owner for prospects this sequence enrolls who have none yet. */
  ownerUserId: Id.optional(),
  /** Reusable schedule object: when set, its window replaces `schedule` on save (and again when the schedule is edited). */
  scheduleId: Id.optional(),
  dedupe: DedupeRules.default({ crossSequence: 'skip', contactedWithinDays: 0, domain: false }),
  /** Nothing is sent before this instant: every enrollment waits at the start until then. */
  startAt: DateTimeIn().optional(),
  /** Minimum minutes between two emails of this sequence from one mailbox (across prospects and steps; clock-aligned windows). */
  minGapMinutes: z.number().int().min(1).max(1440).optional(),
  /** Per-mailbox overrides inside this sequence only: a lower daily limit, or leave the mailbox out of new assignments. Keyed by connection id. */
  senderOverrides: z.record(Id, z.object({ dailyLimit: z.number().int().min(0).max(100_000).optional(), paused: z.boolean().optional() })).optional(),
  /** Account-based (ABM) settings, used when enrolling companies: at most this many contacts per account, and what a colleague's human reply does. */
  abm: z.object({ maxPerAccount: z.number().int().min(1).max(100).default(5), onAccountReply: z.enum(['none', 'stop', 'pause']).default('stop') }).optional(),
});
export type SequenceSettings = z.infer<typeof SequenceSettings>;
export type SequenceSettingsInput = z.input<typeof SequenceSettings>;

export const CreateSequenceBody = z.object({ name: z.string().trim().min(1).max(200), settings: SequenceSettings });
/** PATCH settings: only the keys sent change, an omitted key keeps its saved value and `null` resets a key (e.g. detaches `scheduleId`). */
const SequenceSettingsPatch = z.object(Object.fromEntries(Object.entries(SequenceSettings.shape).map(([k, s]) => [k, ((s instanceof z.ZodDefault ? s.unwrap() : s) as z.ZodType).nullable().optional()]))) as unknown as z.ZodType<{ [K in keyof SequenceSettingsInput]?: SequenceSettingsInput[K] | null }>;
export const UpdateSequenceBody = z.object({ name: z.string().trim().min(1).max(200).optional(), settings: SequenceSettingsPatch.optional() });
/** Enroll chosen prospects, or every member of a list (`listId`). */
export const EnrollProspectsBody = z.object({ profileIds: z.array(Id).max(1000).default([]), listId: Id.optional(), ownerUserId: Id.optional() })
  .refine((b) => b.profileIds.length > 0 || !!b.listId, { message: 'Pass profileIds or listId', path: ['profileIds'] });
/** ABM: enroll the contacts of these companies, grouped per account (the sequence's `abm` caps and stop rules apply). */
export const EnrollAccountsBody = z.object({ companyIds: z.array(Id).min(1).max(200), ownerUserId: Id.optional() });
export const EnrollProspectsResult = z.object({
  enrolled: z.number().int(),
  skipped: z.array(z.object({ profileId: Id, reason: z.string() })),
  warnings: z.array(z.object({ profileId: Id, warning: z.string() })),
});

// ---- prospects ------------------------------------------------------------------------------------------------
export const ProspectInput = z.object({
  email: z.email(),
  firstName: z.string().max(128).optional(),
  lastName: z.string().max(128).optional(),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  linkedinUrl: z.string().max(300).optional(),
  country: z.string().length(2).optional(),
  timezone: z.string().max(64).optional(),
  customFields: z.record(z.string().regex(/^[A-Za-z0-9_]{1,64}$/), z.unknown()).default({}),
});
export const ImportProspectsBody = z.object({
  /** email is checked per row by the import (bad rows come back in `errors[]`), so one typo does not reject the batch. */
  rows: z.array(ProspectInput.extend({ email: z.string().max(320) })).min(1).max(5000),
  /** Someone already a prospect: refresh their details (default) or leave them untouched and count the row as skipped. */
  onExisting: z.enum(['update', 'skip']).default('update'),
  ownerRule: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('user'), userId: Id }),
    z.object({ kind: z.literal('round_robin') }),
    z.object({ kind: z.literal('field'), field: z.string().min(1).max(64) }),
  ]).default({ kind: 'none' }),
});
export const ImportProspectsResult = z.object({
  created: z.number().int(), updated: z.number().int(), skipped: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), error: z.string() })),
  warnings: z.array(z.object({ row: z.number().int(), warning: z.string() })),
  profileIds: z.array(Id),
});
export const AdoptProspectsBody = z.object({ profileIds: z.array(Id).min(1).max(1000) });
export const ProspectListQuery = PageQuery.extend({ status: ProspectStatus.optional(), ownerUserId: Id.optional(), domain: z.string().optional() });
export const UpdateProspectBody = z.object({ status: ProspectStatus.optional(), ownerUserId: Id.nullable().optional(), dealValueCents: z.number().int().min(0).max(2_000_000_000).nullable().optional() });
export const DncImportBody = z.object({ emails: z.array(z.email()).max(10_000).default([]), domains: z.array(z.string().min(3).max(253)).max(1000).default([]) });
export const DncImportResult = z.object({ suppressed: z.number().int(), domainsBlocked: z.number().int() });
/** Display data of the person behind a prospect / task / reply, so lists need no per-row profile fetch. */
export const ProfileRef = z.object({ id: Id, name: z.string().nullable(), email: z.string().nullable() });
export type ProfileRef = z.infer<typeof ProfileRef>;
export const ProspectDto = z.object({
  id: Id,
  profileId: Id,
  status: ProspectStatus,
  ownerUserId: Id.nullable(),
  companyObjectId: Id.nullable(),
  domain: z.string().nullable(),
  title: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  website: z.string().nullable(),
  lastContactedAt: Timestamp.nullable(),
  lastSequenceId: Id.nullable(),
  enrichment: z.record(z.string(), z.unknown()),
  dealValueCents: z.number().int().nullable().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  profile: ProfileRef.nullable(),
});
export const ProspectPage = pageResult(ProspectDto);

/** A sequence is a workflow in `sequence` mode; `sequence` is its editable settings (steps, schedule, mailbox, stop rules). */
export const SequenceDto = z.object({
  id: Id,
  name: z.string(),
  purpose: Purpose,
  mode: z.literal('sequence'),
  status: z.enum(['draft', 'live', 'paused', 'archived']),
  publishedVersionId: Id.nullable(),
  folder: z.string().nullable(),
  tags: z.array(z.string()),
  sequence: SequenceSettings,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const SequencePage = pageResult(SequenceDto);

// ---- tasks ----------------------------------------------------------------------------------------------------
export const TaskListQuery = PageQuery.extend({
  assigneeUserId: Id.optional(), status: z.enum(['open', 'done', 'skipped']).optional(),
  bucket: z.enum(['overdue', 'today', 'upcoming']).optional(), kind: TaskKind.optional(),
  profileId: Id.optional(), unassigned: z.coerce.boolean().optional(), dueBefore: DateTimeIn().optional(), dueAfter: DateTimeIn().optional(), outcome: z.string().max(40).optional(),
});
const TaskFilterField = z.enum(['kind', 'status', 'outcome', 'assigneeUserId', 'profileId', 'dueAt', 'title']);
const TaskFilterLeaf = z.object({ field: TaskFilterField, op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'is_null', 'not_null']), value: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]).optional() });
export type TaskFilterNode = z.infer<typeof TaskFilterLeaf> | { op: 'and' | 'or'; filters: TaskFilterNode[] } | { op: 'not'; filter: TaskFilterNode };
/** Nested and / or / not over task columns, at most 20 conditions deep-or-wide in total (checked on the server). */
export const TaskFilterNode: z.ZodType<TaskFilterNode> = z.lazy(() => z.union([
  TaskFilterLeaf,
  z.object({ op: z.enum(['and', 'or']), filters: z.array(TaskFilterNode).min(1).max(20) }),
  z.object({ op: z.literal('not'), filter: TaskFilterNode }),
]));
export const TaskSearchBody = z.object({ filter: TaskFilterNode.optional(), limit: z.number().int().min(1).max(200).default(50), cursor: z.string().regex(/^\d{1,6}$/).optional() });
const TaskLinks = {
  /** Team-defined task type (`/v1/outbound/task-types`). */
  typeId: Id.nullable().optional(),
  /** Linked company (leads companies) and further contacts besides the main one. */
  companyId: Id.nullable().optional(), contactIds: z.array(Id).max(20).optional(),
  /** Planned length in minutes. */
  plannedMin: z.number().int().min(1).max(1440).nullable().optional(),
  /** Remind the assignee this many minutes before the due time (0 = at the due time); null turns the reminder off. */
  remindBeforeMin: z.number().int().min(0).max(10_080).nullable().optional(),
};
export const CreateTaskBody = z.object({
  kind: TaskKind.default('custom'), profileId: Id, title: z.string().trim().min(1).max(200), notes: z.string().max(5000).optional(),
  assigneeUserId: Id.optional(), dueAt: DateTimeIn().optional(), ...TaskLinks,
});
export const UpdateTaskBody = z.object({ title: z.string().trim().min(1).max(200).optional(), notes: z.string().max(5000).nullable().optional(), dueAt: DateTimeIn().optional(), kind: TaskKind.optional(), ...TaskLinks });
/** Bulk edit of open tasks: assign, snooze (new due time) or complete / skip. */
export const BulkTaskBody = z.object({
  ids: z.array(Id).min(1).max(200),
  action: z.discriminatedUnion('op', [
    z.object({ op: z.literal('assign'), assigneeUserId: Id.nullable() }),
    z.object({ op: z.literal('snooze'), until: DateTimeIn() }),
    z.object({ op: z.literal('complete'), outcome: z.string().trim().min(1).max(40).optional() }),
    z.object({ op: z.literal('skip') }),
  ]),
});
export const BulkTaskResult = z.object({ updated: z.number().int(), failed: z.array(z.object({ id: Id, error: z.string() })) });
export const AssignTaskBody = z.object({ assigneeUserId: Id.nullable() });
export const CompleteTaskBody = z.object({
  notes: z.string().max(5000).optional(),
  outcome: z.string().trim().min(1).max(40).optional(),
  /** Call detail (call tasks). */
  durationSec: z.number().int().min(0).max(86_400).optional(), recordingUrl: z.url().max(1000).optional(), externalId: z.string().max(200).optional(),
});
export const SnoozeBody = z.object({ until: DateTimeIn() });
export const TaskDto = z.object({
  id: Id,
  kind: TaskKind,
  profileId: Id,
  enrollmentId: Id.nullable(),
  nodeId: z.string().nullable(),
  assigneeUserId: Id.nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  outcome: z.string().nullable(),
  durationSec: z.number().int().nullable().optional(),
  recordingUrl: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  dueAt: Timestamp,
  status: z.enum(['open', 'done', 'skipped']),
  completedAt: Timestamp.nullable(),
  typeId: Id.nullable().optional(), companyId: Id.nullable().optional(), contactIds: z.array(Id).optional(), plannedMin: z.number().int().nullable().optional(),
  remindBeforeMin: z.number().int().nullable().optional(), voicemailClipId: Id.nullable().optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  profile: ProfileRef.nullable(),
});
export const TaskPage = pageResult(TaskDto);

// ---- inbox ----------------------------------------------------------------------------------------------------
export const InboxQuery = PageQuery.extend({
  category: ReplyCategory.optional(), connectionId: Id.optional(), assigneeUserId: Id.optional(), sequenceId: Id.optional(),
  unread: z.coerce.boolean().optional(), label: z.string().max(40).optional(), leadStatus: ProspectStatus.optional(), includeSnoozed: z.coerce.boolean().default(false),
  sourceKind: z.enum(['campaign', 'sequence', 'workflow']).optional(), campaignId: Id.optional(),
  important: z.coerce.boolean().optional(), reminders: z.coerce.boolean().optional(), unmatched: z.coerce.boolean().optional(), ignored: z.coerce.boolean().optional(),
  /** Archived replies only / snoozed (still waiting) only / replies from members of one list. */
  archived: z.coerce.boolean().optional(), snoozed: z.coerce.boolean().optional(), listId: Id.optional(),
});
export const OverrideBody = z.object({ category: ReplyCategory });
export const LabelsBody = z.object({ labels: z.array(z.string().trim().min(1).max(40)).max(20) });
export const InboxAssignBody = z.object({ assigneeUserId: Id.nullable() });
export const InboxReplyBody = z.object({ text: z.string().trim().min(1).max(20_000), subject: z.string().max(300).optional(), /** Send from this mailbox instead of the one that got the reply. */ connectionId: Id.optional(),
  /** Hold the reply and send it at this time (it appears in the scheduled view until then). */ scheduledFor: DateTimeIn().optional() });
export const ReferralBody = z.object({ enrollSequenceId: Id.optional() });
export const ReplyMetaDto = z.object({
  category: ReplyCategory,
  confidence: z.number(),
  source: z.enum(['rule', 'llm', 'manual']),
  labels: z.array(z.string()),
  snoozedUntil: Timestamp.nullable(),
  oooUntil: Timestamp.nullable(),
  referral: z.object({ name: z.string().optional(), email: z.string() }).nullable(),
  /** Set when a human changed the category: what the machine had said. */
  machineCategory: ReplyCategory.nullable(),
  important: z.boolean().optional(), ignored: z.boolean().optional(), remindAt: Timestamp.nullable().optional(), latencySec: z.number().int().nullable().optional(),
});
export const InboxDto = z.object({
  id: Id,
  connectionId: Id,
  fromAddr: z.string(),
  toAddr: z.string(),
  subject: z.string().nullable(),
  text: z.string().nullable(),
  receivedAt: Timestamp,
  profileId: Id.nullable(),
  classification: z.string().nullable(),
  classificationSource: z.string().nullable(),
  oooUntil: Timestamp.nullable(),
  readAt: Timestamp.nullable(),
  assignedUserId: Id.nullable(),
  archived: z.boolean(),
  /** The send this reply answers (campaign/sequence/...), when matched. */
  sourceKind: z.string().nullable(),
  sourceId: z.string().nullable(),
  stepKey: z.string().nullable(),
  meta: ReplyMetaDto.nullable(),
  profile: ProfileRef.nullable(),
});
export const InboxPage = pageResult(InboxDto);
export const ThreadItemDto = z.object({
  kind: z.enum(['sent', 'received']),
  id: Id,
  at: Timestamp,
  subject: z.string().nullable(),
  text: z.string().nullable(),
  status: z.string().nullable(),
  connectionId: Id.nullable(),
  stepKey: z.string().nullable(),
  classification: z.string().nullable(),
});
export const ThreadDto = z.object({ profileId: Id.nullable(), items: z.array(ThreadItemDto) });
export const ClassifierAccuracyRow = z.object({ source: z.string(), total: z.number().int(), corrected: z.number().int(), accuracy: z.number() });
export const ReferralResult = z.object({ profileId: Id, enroll: EnrollProspectsResult.nullable() });

// ---- meetings & analytics -------------------------------------------------------------------------------------
export const MeetingBody = z.object({ profileId: Id, at: DateTimeIn().optional(), ref: z.string().max(300).optional() });
export const MeetingDto = z.object({ id: Id, profileId: Id, source: z.enum(['calendar_link', 'reply_detected', 'manual']), at: Timestamp, ref: z.string().nullable(), sequenceId: Id.nullable(), createdAt: Timestamp, completedAt: Timestamp.nullable().optional(), outcome: z.string().nullable().optional() });
export const OutboundStatsQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), sequenceId: Id.optional(), group: z.enum(['sequence', 'step', 'mailbox']).default('sequence') });
export const OutboundStatsRow = z.object({
  key: z.string(), sent: z.number().int(), bounced: z.number().int(), replied: z.number().int(), positive: z.number().int(), negative: z.number().int(),
  optOuts: z.number().int(), meetings: z.number().int(), positiveRate: z.number(), replyRate: z.number(), bounceRate: z.number(),
});
export const OutboundStats = z.object({ items: z.array(OutboundStatsRow) });

// ---- mailboxes ------------------------------------------------------------------------------------------------
export const RampSchedule = z.object({
  startDaily: z.number().int().min(1).max(100_000), targetDaily: z.number().int().min(1).max(100_000),
  incrementPerDay: z.number().int().min(1).max(10_000), startedOn: z.iso.date(),
});
export type RampSchedule = z.infer<typeof RampSchedule>;
export const MailboxSettingsBody = z.object({
  dailyCap: z.number().int().min(1).max(100_000).nullable().optional(),
  hourlyCap: z.number().int().min(1).max(10_000).nullable().optional(),
  ramp: RampSchedule.nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  sendingWindow: z.object({ startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440), weekdays: z.array(z.number().int().min(1).max(7)).optional() }).nullable().optional(),
  pacing: z.object({ minGapSec: z.number().int().min(0).max(3600), jitterSec: z.number().int().min(0).max(3600) }).nullable().optional(),
});
export const HealthFactor = z.object({ key: z.string(), ok: z.boolean(), value: z.union([z.number(), z.string()]).nullable(), limit: z.union([z.number(), z.string()]).optional() });
export const MailboxDay = z.object({ day: z.string(), sent: z.number().int(), bounced: z.number().int(), replied: z.number().int(), complaints: z.number().int(), opens: z.number().int(), clicks: z.number().int() });
/** A sending mailbox: health with explicit factors plus its caps, ramp, pacing and sending window (the same shapes PATCH accepts). */
export const MailboxHealthDto = z.object({
  connectionId: Id,
  name: z.string(),
  status: z.string(),
  health: z.string(),
  dailyCap: z.number().int().nullable(),
  hourlyCap: z.number().int().nullable(),
  ramp: RampSchedule.nullable(),
  timezone: z.string().nullable(),
  sendingWindow: MailboxSettingsBody.shape.sendingWindow.unwrap().unwrap().nullable(),
  pacing: z.object({ minGapSec: z.number().int(), jitterSec: z.number().int() }).nullable(),
  /** Campaign plus warmup sends today (the mailbox's own day): one daily cap covers both. */
  sentToday: z.number().int(),
  /** The warmup share of `sentToday`. */
  warmupToday: z.number().int().optional(),
  bounceRate7d: z.number(),
  replyRate7d: z.number(),
  totals: z.object({ sent: z.number().int(), bounced: z.number().int(), complaints: z.number().int(), replied: z.number().int() }),
  factors: z.array(HealthFactor),
  /** Why the mailbox would be auto-paused (`bounce_rate`, `complaint_rate`), or null. */
  pause: z.string().nullable(),
  history: z.array(MailboxDay),
});

export type ImportProspectsBody = z.infer<typeof ImportProspectsBody>;
export type ImportProspectsResult = z.infer<typeof ImportProspectsResult>;
export type EnrollProspectsResult = z.infer<typeof EnrollProspectsResult>;
export type OutboundStatsRow = z.infer<typeof OutboundStatsRow>;
export type CreateTaskBody = z.infer<typeof CreateTaskBody>;
export type MailboxSettingsBody = z.infer<typeof MailboxSettingsBody>;
