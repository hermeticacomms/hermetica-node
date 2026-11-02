import { z } from 'zod';
import { Channel, Id, PageQuery, Purpose, Timestamp, pageResult } from './common.ts';
import { PropertyCondition } from './metrics.ts';
import { SegmentDefinition } from './segments.ts';
import { SequenceSettings } from './outbound.ts';
import { Duration, GoalMatch, NodeId, WorkflowNode } from './workflow-nodes.ts';

export * from './workflow-nodes.ts';

export const MAX_NODES = 500;
export const MAX_SYNC_STEPS = 50;

export const WorkflowMode = z.enum(['journey', 'sequence']);
export const WorkflowStatus = z.enum(['draft', 'live', 'paused', 'archived']);
export type WorkflowStatus = z.infer<typeof WorkflowStatus>;
export const EnrollmentState = z.enum(['active', 'waiting', 'completed', 'exited', 'failed', 'paused']);
export type EnrollmentState = z.infer<typeof EnrollmentState>;

export const Edge = z.object({ id: z.string().min(1).max(64), source: NodeId, sourceHandle: z.string().min(1).max(64), target: NodeId });
export type Edge = z.infer<typeof Edge>;

/** Re-entry is per trigger (a workflow may have several). `never` and `once` both mean one enrollment per profile, ever. */
export const ReentryPolicy = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('never') }),
  z.object({ mode: z.literal('once') }),
  z.object({ mode: z.literal('after_completion') }),
  z.object({ mode: z.literal('after_cooldown'), cooldown: Duration }),
  z.object({ mode: z.literal('concurrent'), dedupeKeyTemplate: z.string().min(1).max(200) }),
]);
export type ReentryPolicy = z.infer<typeof ReentryPolicy>;

const re = { reentry: ReentryPolicy.default({ mode: 'after_completion' }) };
const t = <K extends string, S extends z.ZodRawShape>(type: K, shape: S) => z.object({ type: z.literal(type), ...shape, ...re });
export const Trigger = z.discriminatedUnion('type', [
  t('profile_created', {}),
  /** `where` is checked against the profile's current value after the change; `from` is the recorded previous value of the `where` field. */
  t('profile_updated', { keys: z.array(z.string()).optional(), from: z.unknown().optional(), where: z.object({ field: z.string().min(1).max(128), op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists', 'not_exists']), value: z.unknown().optional() }).optional() }),
  t('list_added', { listId: Id }),
  t('list_removed', { listId: Id }),
  /** `enrollExisting`: when this trigger is first published, also enroll everyone already in the segment (batched, honours re-entry rules). */
  t('segment_entered', { segmentId: Id, enrollExisting: z.boolean().optional() }),
  t('segment_exited', { segmentId: Id }),
  t('tag_added', { name: z.string().min(1).max(64) }),
  t('tag_removed', { name: z.string().min(1).max(64) }),
  t('consent_changed', { channel: Channel, status: z.enum(['granted', 'revoked']) }),
  /** `filter` is equality only; `conditions` add operators (neq, gt, lt, contains, exists, ...) over the event properties. */
  t('event', { name: z.string().min(1).max(128), filter: z.record(z.string(), z.unknown()).optional(), conditions: z.array(PropertyCondition).max(10).optional() }),
  /** Custom-object records: fires for every profile linked to the record. `object_updated` can require property conditions on the record. */
  t('object_created', { objectType: z.string().min(1).max(64) }),
  t('object_updated', { objectType: z.string().min(1).max(64), conditions: z.array(PropertyCondition).max(10).optional() }),
  t('object_linked', { objectType: z.string().min(1).max(64) }),
  /** A relationship between two records was added; fires for profiles linked to either side. */
  t('relationship_added', { objectType: z.string().max(64).optional(), kind: z.string().max(64).optional() }),
  /** A score model's value crossed `threshold` upwards. */
  /** `enrollExisting`: when first published, also enroll everyone already at or above the threshold (batched, honours re-entry rules). */
  t('score_reached', { modelId: Id, threshold: z.number(), enrollExisting: z.boolean().optional() }),
  /** Catalog events `back_in_stock` / `price_drop` (properties: sku, dropPercent) emitted by the catalog feed diff. */
  t('back_in_stock', { sku: z.string().max(128).optional() }),
  t('price_drop', { sku: z.string().max(128).optional(), minPercent: z.number().min(0).max(100).optional() }),
  /** `offsetDays`: negative = before the date, positive = after. `yearly`: match the date's month and day every year (birthdays, renewals). */
  t('date_property', { attribute: z.string().min(1).max(128), offsetDays: z.number().int(), time: z.string().regex(/^\d{2}:\d{2}$/), tz: z.string(), yearly: z.boolean().optional() }),
  /** Catalog event `catalog.low_inventory` (stock fell through 10, 5, 3 or 1); `below` narrows to a lower stock level. */
  t('low_inventory', { sku: z.string().max(128).optional(), below: z.number().int().min(1).max(10).optional() }),
  t('form_submitted', { formId: Id }),
  /** `endsAt` (ISO date-time) and `maxRuns` stop the recurrence; leave both empty to repeat until unpublished. `maxEntriesPerRun` caps how many enter at each occurrence.
   * `localTime`: the cron runs on each person's own wall clock (their profile zone, else `tz`), so "9:00" is 9:00 where they are. */
  t('schedule', {
    cron: z.string().min(1).max(100), tz: z.string(), audience: z.object({ segmentId: Id.optional(), listId: Id.optional() }), endsAt: z.iso.datetime({ offset: true }).optional(), maxRuns: z.number().int().min(1).max(100_000).optional(),
    maxEntriesPerRun: z.number().int().min(1).max(100_000).optional(), localTime: z.boolean().optional(),
  }),
  /** A new item (published within the last poll window) appeared in the feed; starts the audience, with the item as the trigger event. */
  t('rss_item', { url: z.url(), audience: z.object({ segmentId: Id.optional(), listId: Id.optional() }) }),
  t('webhook', { inboundKey: z.string().min(1).max(64) }),
  t('api', {}),
  t('prospect_enrolled', {}),
  /** `url`: for clicks, only this link (substring match). */
  t('message_event', { kind: z.string().min(1).max(32), url: z.string().max(500).optional() }),
  /** `keyword`: for SMS replies, the first word of the reply (case-insensitive), e.g. STOP-style opt-ins like JOIN. */
  t('reply_received', { classification: z.string().optional(), keyword: z.string().max(64).optional() }),
  t('meeting_booked', {}),
  /** The person's device entered an in-app geofence (the SDK hit is recorded as a `geofence_entered` event, so the app sends nothing custom). Empty `geofenceId` = any geofence. */
  t('geofence_entered', { geofenceId: z.string().max(128).optional() }),
  /** A workspace-registered trigger type (Settings > Custom actions and triggers): fires on its event when every `values` entry equals the event property. */
  t('custom', { typeKey: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/), values: z.record(z.string(), z.unknown()).default({}) }),
  t('mailbox_disconnected', {}),
  t('campaign_paused', {}),
  /** Loyalty ledger (packages/loyalty). `direction`: earned = points added, spent = points removed. */
  t('loyalty_points_changed', { programId: Id.optional(), direction: z.enum(['earned', 'spent', 'any']).optional() }),
  t('loyalty_tier_changed', { programId: Id.optional(), toTierId: Id.optional() }),
  t('loyalty_reward_available', { programId: Id.optional(), rewardId: Id.optional() }),
]);
export type Trigger = z.infer<typeof Trigger>;
export type TriggerType = Trigger['type'];

export const Goal = z.object({
  kind: z.enum(['event', 'segment']),
  eventName: z.string().max(128).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  definition: SegmentDefinition.optional(),
  windowDays: z.number().int().min(1).max(365).default(30),
  /** `exit` ends the enrollment with goal_reached; `continue` only records the conversion. */
  /** `jump` moves the contact to the first goal node (skip-ahead) and keeps going. */
  onReach: z.enum(['exit', 'continue', 'jump']).default('exit'),
});
export type Goal = z.infer<typeof Goal>;

const Minutes = z.number().int().min(0).max(1440);
export const WorkflowSettings = z.object({
  purpose: Purpose.default('marketing'),
  mode: WorkflowMode.default('journey'),
  filterCheck: z.enum(['entry', 'every_step', 'before_send']).default('before_send'),
  /** When the profile filter fails after entry: `exit` ends the journey, `skip` passes over just that step (or message) and carries on, so someone who qualifies later is still reached. */
  filterFailAction: z.enum(['exit', 'skip']).default('exit'),
  profileFilter: SegmentDefinition.optional(),
  goal: Goal.optional(),
  /** Quiet hours / frequency caps are enforced by delivery; this only chooses whether the workflow overrides workspace defaults. */
  quietHours: z.union([z.literal('inherit'), z.object({ startMin: Minutes, endMin: Minutes })]).default('inherit'),
  /** What a send does when per-flow quiet hours are closed: hold until they end (default), skip that step, or end the journey. Consented sends are never silently dropped without this explicit choice. */
  quietHoursAction: z.enum(['wait', 'skip', 'exit']).optional(),
  sendWindow: z.object({ startMin: Minutes, endMin: Minutes, weekdays: z.array(z.number().int().min(1).max(7)).optional() }).optional(),
  /** Per-flow smart sending, applied through delivery's workflow-scoped frequency settings on publish. */
  smartSending: z.object({
    skipIfMessagedWithinHours: z.number().int().min(1).max(24 * 14).optional(),
    frequencyCap: z.object({ maxSends: z.number().int().min(1).max(1000), windowHours: z.number().int().min(1).max(24 * 30) }).optional(),
  }).optional(),
  /** Journey caps: total enrollments ever, and enrollments in flight at once. Entrants over a cap are skipped (`cap_reached`). */
  enrollmentCap: z.object({ maxTotal: z.number().int().min(1).optional(), maxConcurrent: z.number().int().min(1).optional() }).optional(),
  /** Publish up / down dates: outside this window nobody enters and steps are held (like a pause); inside it the journey runs as published. */
  activeWindow: z.object({ from: z.iso.datetime({ offset: true }).optional(), until: z.iso.datetime({ offset: true }).optional() }).optional(),
  /** Who is told (in-app always, plus email) when an enrollment fails. */
  failureAlert: z.object({ userIds: z.array(Id).max(20).default([]), emails: z.array(z.email()).max(20).default([]) }).optional(),
  timezoneSource: z.enum(['profile', 'workspace']).default('profile'),
  timezone: z.string().default('UTC'),
  exitOn: SegmentDefinition.optional(),
  /** Present on mode=sequence workflows (stop rules, mailbox, schedule, dedupe, the step list the graph was compiled from). */
  sequence: SequenceSettings.optional(),
});
export type WorkflowSettings = z.infer<typeof WorkflowSettings>;

export const WorkflowGraph = z.object({ start: NodeId.nullable().default(null), nodes: z.array(WorkflowNode).max(MAX_NODES + 1), edges: z.array(Edge).max(MAX_NODES * 30) });
export type WorkflowGraph = z.infer<typeof WorkflowGraph>;

/** Everything a version freezes. */
export const WorkflowDefinition = z.object({ graph: WorkflowGraph, triggers: z.array(Trigger).max(20), settings: WorkflowSettings });
export type WorkflowDefinition = z.infer<typeof WorkflowDefinition>;
export type WorkflowDefinitionInput = z.input<typeof WorkflowDefinition>;

export const ValidationIssue = z.object({ severity: z.enum(['error', 'warning']), code: z.string(), message: z.string(), nodeId: z.string().optional(), /** The exact change that clears this issue, in plain words. */ fix: z.string().optional() });
export type ValidationIssue = z.infer<typeof ValidationIssue>;
export const ValidationResult = z.object({ ok: z.boolean(), errors: z.array(ValidationIssue), warnings: z.array(ValidationIssue) });
export type ValidationResult = z.infer<typeof ValidationResult>;
/** Validate an unsaved draft; omit `definition` to validate the stored draft. */
export const ValidateBody = z.object({ definition: WorkflowDefinition.optional() });

export const CreateWorkflowBody = z.object({
  name: z.string().trim().min(1).max(200),
  purpose: Purpose.default('marketing'),
  mode: WorkflowMode.default('journey'),
  folder: z.string().max(100).nullish(),
  tags: z.array(z.string().max(64)).max(50).default([]),
  definition: WorkflowDefinition.partial().optional(),
});
export const WorkflowColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour');
export const UpdateWorkflowBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  color: WorkflowColor.nullable().optional(),
  folder: z.string().max(100).nullish(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  definition: WorkflowDefinition.optional(),
});
/** `started*` is when the first version went live. Sorts other than the default (newest id first) still page by cursor. */
export const WorkflowListQuery = PageQuery.extend({
  status: WorkflowStatus.optional(), folder: z.string().optional(), mode: WorkflowMode.optional(),
  q: z.string().trim().max(200).optional(), archived: z.enum(['true', 'false']).optional(), triggerType: z.string().max(32).optional(),
  createdFrom: z.coerce.date().optional(), createdTo: z.coerce.date().optional(), updatedFrom: z.coerce.date().optional(), updatedTo: z.coerce.date().optional(),
  startedFrom: z.coerce.date().optional(), startedTo: z.coerce.date().optional(),
  sort: z.enum(['created', '-created', 'updated', '-updated', 'name', '-name']).optional(),
});
export type WorkflowListQuery = z.infer<typeof WorkflowListQuery>;
const Row = z.looseObject({ id: Id });
export const AbState = z.object({ variants: z.array(z.object({ versionId: Id, weight: z.number().int() })), startedAt: Timestamp }).nullable();
/** Draft graph / triggers / settings are jsonb validated on write (WorkflowDefinition); they are passed through unparsed to keep list responses cheap. */
export const WorkflowDto = z.object({
  id: Id,
  name: z.string(),
  purpose: Purpose,
  mode: WorkflowMode,
  status: WorkflowStatus,
  publishedVersionId: Id.nullable(),
  folder: z.string().nullable(),
  tags: z.array(z.string()),
  color: z.string().nullable().optional(),
  draftGraph: z.unknown(),
  draftTriggers: z.unknown(),
  draftSettings: z.unknown(),
  /** Flow-level A/B: entrants are split across these published versions. */
  ab: AbState.optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const WorkflowPage = pageResult(WorkflowDto);
export const VersionDto = z.object({
  id: Id, workflowId: Id, n: z.number().int(), graph: z.unknown(), trigger: z.unknown(), settings: z.unknown(), checksum: z.string(), publishedAt: Timestamp, publishedBy: z.string(),
});
export const StuckReason = z.enum(['schedule_lost', 'overdue', 'failed', 'paused', 'awaiting_signal']);
export type StuckReason = z.infer<typeof StuckReason>;
export const EnrollmentDto = Row.extend({ stuckReason: StuckReason.nullable().optional(), profileEmail: z.string().nullable().optional(), lastError: z.string().nullable().optional() });
export const EnrollmentPage = pageResult(EnrollmentDto);
export const EnrollmentListQuery = PageQuery.extend({ state: EnrollmentState.optional(), profileId: Id.optional(),
  nodeId: NodeId.optional(), /** Exact email address of the profile. */ email: z.string().max(320).optional(), stuck: z.literal('true').optional(), /** Only subscribers an admin removed from the journey. */ removed: z.literal('true').optional() });
export const ResumeBody = z.object({ policy: z.enum(['run_now', 'skip_missed_sends']).default('run_now') });
/** `data` is exposed to the journey as the trigger event (`trigger` conditions, `{{ trigger.x }}` / `{{ event.x }}` liquid). */
export const EnrollBody = z.object({ profileIds: z.array(Id).min(1).max(1000), triggerType: z.string().max(32).default('api'), data: z.record(z.string(), z.unknown()).optional() });
export const EnrollResult = z.object({ enrolled: z.number().int(), skipped: z.array(z.object({ profileId: Id, reason: z.string() })), /** The rest of an object segment is enrolled by the worker. */ queued: z.boolean().optional() });
export const JumpBody = z.object({ nodeId: NodeId });
/** New wake-up time for a waiting person; must be in the future. */
export const RescheduleBody = z.object({ runAt: z.coerce.date() });
export const MigrateBody = z.object({ fromVersionId: Id, toVersionId: Id, nodeMap: z.record(z.string(), z.string()).default({}) });
export const MigrateResult = z.object({ moved: z.number().int(), exitedUnmapped: z.number().int() });

export const SampleProfile = z.object({
  id: z.string().min(1).max(64),
  fields: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  listIds: z.array(z.string()).default([]),
  segmentIds: z.array(z.string()).default([]),
  timezone: z.string().default('UTC'),
  /** "channel:purpose" -> true when granted, e.g. "email:marketing". */
  consents: z.array(z.string()).default([]),
});
export type SampleProfile = z.infer<typeof SampleProfile>;
export const TimedEvent = z.object({ profileId: z.string(), name: z.string(), at: z.coerce.date(), properties: z.record(z.string(), z.unknown()).default({}) });
export type TimedEvent = z.infer<typeof TimedEvent>;
export const SimulateBody = z.object({
  profiles: z.array(SampleProfile).min(1).max(100),
  events: z.array(TimedEvent).max(1000).default([]),
  start: z.coerce.date(),
  until: z.coerce.date().optional(),
  /** Inline definition to simulate an unsaved draft; defaults to the stored draft. */
  definition: WorkflowDefinition.optional(),
  /** Segment ids / definitions can't be evaluated in memory; profiles list matching segments in `segmentIds`. */
  matchDefinitions: z.boolean().default(false),
  /** The event that starts the journey as `{ name, properties }`: what `trigger` conditions, `for_each_item` and `{{ trigger.properties.x }}` read. */
  triggerEvent: z.record(z.string(), z.unknown()).optional(),
  /** Per "wait until they open / click / reply..." step: does it happen (`happens`) or not (`never`, the wait times out). Steps not listed use the person's real history when known, else do not happen. */
  waitOutcomes: z.record(NodeId, z.enum(['happens', 'never'])).default({}),
});
export type SimulateBody = z.input<typeof SimulateBody>;
export const TraceEntry = z.object({ at: Timestamp, nodeId: z.string(), kind: z.string(), handle: z.string().optional(), note: z.string().optional() });
export const SimulateResult = z.object({
  traces: z.record(z.string(), z.array(TraceEntry)),
  nodeCounts: z.record(z.string(), z.number().int()),
  pathCounts: z.record(z.string(), z.number().int()),
  warnings: z.array(ValidationIssue),
});

export type SimulateResult = z.infer<typeof SimulateResult>;

export const NodeReportRow = z.object({ nodeId: z.string(), entered: z.number().int(), completed: z.number().int(), exited: z.number().int(), errors: z.number().int(), waiting: z.number().int(), /** Enrollments that passed through this node and reached the goal. */ converted: z.number().int().default(0) });
export const WorkflowReport = z.object({
  workflowId: Id,
  nodes: z.array(NodeReportRow),
  paths: z.record(z.string(), z.number().int()),
  states: z.record(z.string(), z.number().int()),
  goal: z.object({ conversions: z.number().int(), timeToConvertP50Sec: z.number().nullable(), timeToConvertP90Sec: z.number().nullable() }),
  messages: z.record(z.string(), z.number().int()),
});
export const ReportQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const WorkflowTemplateDto = z.object({
  key: z.string(), name: z.string(), description: z.string(), definition: WorkflowDefinition,
  category: z.string().default('lifecycle'),
  /** Events the flow relies on; `missing` lists those this workspace has never received (filled by the API). */
  requires: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
});
export const InstallReport = z.object({
  templatesCreated: z.number().int(), missingEvents: z.array(z.string()),
  /** Things the user must still do before publishing. */
  todo: z.array(z.string()),
});
export type InstallReport = z.infer<typeof InstallReport>;
export const ExportDto = z.object({ name: z.string(), purpose: Purpose, mode: WorkflowMode, definition: WorkflowDefinition });
export const ImportBody = ExportDto.extend({ name: z.string().trim().min(1).max(200) });

/** What happens to enrollments already inside when a new version goes live. */
export const PublishBody = z.object({
  inFlight: z.enum(['stay', 'migrate', 'exit']).default('stay'),
  /** old node id -> new node id, for removed (or deliberately re-targeted) nodes that still hold enrollments. */
  nodeMap: z.record(z.string(), z.string()).default({}),
});
export type PublishBody = z.infer<typeof PublishBody>;
export const PublishImpact = z.object({
  inFlight: z.number().int(),
  /** Nodes present in the live version, absent (or changed type) in the draft, with the enrollments they hold. */
  removed: z.array(z.object({ nodeId: z.string(), holding: z.number().int() })),
});

export const AbBody = z.object({ variants: z.array(z.object({ versionId: Id, weight: z.number().int().min(1).max(100) })).min(2).max(5) });
export const AbReport = z.object({
  variants: z.array(z.object({ versionId: Id, n: z.number().int(), weight: z.number().int(), entered: z.number().int(), completed: z.number().int(), converted: z.number().int(), conversionRate: z.number() })),
});
export const PromoteBody = z.object({ versionId: Id });

// ---- per-step controls (Mailchimp automation emails / Klaviyo flow actions) -------------------------------------
export const WorkflowNodeDto = z.object({
  nodeId: z.string(), type: z.string(), config: z.unknown(), status: z.enum(['live', 'paused']), pauseMode: z.enum(['wait', 'skip', 'review']).nullable(),
  entered: z.number().int(), completed: z.number().int(), errors: z.number().int(), queued: z.number().int(),
});
export const WorkflowNodeList = z.object({ items: z.array(WorkflowNodeDto) });
export const NodeParams = z.object({ id: Id, nodeId: NodeId });
export const NodeProfileParams = NodeParams.extend({ profileId: Id });
export const WorkflowProfileParams = z.object({ id: Id, profileId: Id });
/** `wait` holds everyone, `skip` is Draft, `review` is Manual: each person's message waits for approval. */
export const PauseNodeBody = z.object({ mode: z.enum(['wait', 'skip', 'review']).default('wait') });
/** Klaviyo-style status write: `live` resumes, `paused` pauses (mode as above). */
export const PatchNodeBody = z.object({ status: z.enum(['live', 'paused']), mode: z.enum(['wait', 'skip', 'review']).default('wait') });
export const QueueAddBody = z.object({ profileIds: z.array(Id).min(1).max(1000) });
export const RemoveSubscriberBody = z.object({ profileId: Id });

// ---- live edit of a running journey (Mailchimp: edit or delete a step of a live automation) ---------------------------
/** `new_entrants`: only people who enter later get the change. `waiting`: people already inside move to the new version too. */
export const LiveEditApply = z.enum(['new_entrants', 'waiting']);
export const LiveEditBody = z.object({ config: z.record(z.string(), z.unknown()), apply: LiveEditApply.default('new_entrants') });
/** Deleting a step: those waiting at it either continue to the step after it or leave. */
export const LiveDeleteQuery = z.object({ apply: LiveEditApply.default('new_entrants'), waiting: z.enum(['move_on', 'exit']).default('move_on') });
/** Add one action to the draft (optionally spliced after a step's exit). */
export const AddDraftNodeBody = z.object({
  id: NodeId.optional(), type: z.string().min(1).max(64), config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(), after: z.object({ nodeId: NodeId, handle: z.string().min(1).max(64).default('next') }).optional(),
});
export const DraftNodeResult = z.object({ nodeId: NodeId, validation: ValidationResult });
export const LiveEditResult = z.object({ version: VersionDto, moved: z.number().int(), exited: z.number().int() });

// ---- per-profile and per-enrollment reads --------------------------------------------------------------------------
export const ProfileJourneyDto = z.object({
  enrollmentId: Id, workflowId: Id, workflowName: z.string(), workflowStatus: WorkflowStatus, state: EnrollmentState, currentNodeId: z.string().nullable(),
  enteredAt: Timestamp, exitedAt: Timestamp.nullable(), exitedReason: z.string().nullable(), goalReachedAt: Timestamp.nullable(), triggerType: z.string(),
});
export const ProfileJourneyPage = pageResult(ProfileJourneyDto);
export const ProfileJourneysQuery = PageQuery.extend({ state: EnrollmentState.optional(), live: z.literal('true').optional() });
export const EnrollmentStepDto = z.object({ id: Id, nodeId: z.string(), stepSeq: z.number().int(), kind: z.string(), handle: z.string().nullable(), note: z.string().nullable(), at: Timestamp });
export const EnrollmentStepPage = pageResult(EnrollmentStepDto);
export const BatchReadBody = z.object({ ids: z.array(Id).min(1).max(100) });

// ---- goals (flow goal in settings + goal steps) and per-enrollment hold ----------------------------------------------------
export const GoalNodeDto = z.object({ nodeId: NodeId, name: z.string(), skipAhead: z.boolean(), match: GoalMatch.nullable() });
export const WorkflowGoalsDto = z.object({
  flowGoal: Goal.nullable(),
  nodes: z.array(GoalNodeDto),
  /** `converted` = enrollments that reached the flow goal or any goal step. */
  conversions: z.object({ enrolled: z.number().int(), converted: z.number().int(), rate: z.number() }),
});
export const GoalNodeParams = z.object({ id: Id, nodeId: NodeId });
export const GoalNodeBody = z.object({ name: z.string().max(64).optional(), skipAhead: z.boolean().optional(), match: GoalMatch.nullable().optional() });
export const PauseEnrollmentBody = z.object({ reason: z.string().trim().min(1).max(100).default('manual') });
