import { z } from 'zod';
import { Channel, Id, Purpose } from './common.ts';
import { PushExtras } from './push.ts';
import { SegmentDefinition } from './segments.ts';

export const NodeId = z.string().min(1).max(64);
const Pos = z.object({ x: z.number(), y: z.number() }).optional();
const Route = z.object({ connectionId: Id.optional(), poolId: Id.optional(), routePolicyId: Id.optional() });

export const Duration = z.object({ amount: z.number().int().min(0).max(3650 * 24 * 60), unit: z.enum(['minutes', 'hours', 'days', 'weeks']) });
export type Duration = z.infer<typeof Duration>;

const Cmp = { op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists', 'not_exists']), value: z.unknown().optional() };
export const Condition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('field'), field: z.string().min(1).max(128), ...Cmp }),
  z.object({ kind: z.literal('tag'), name: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('in_list'), listId: Id }),
  z.object({ kind: z.literal('in_segment'), segmentId: Id }),
  z.object({ kind: z.literal('consent'), channel: Channel, purpose: Purpose.default('marketing') }),
  z.object({ kind: z.literal('trigger'), path: z.string().min(1).max(128), ...Cmp }),
  z.object({ kind: z.literal('var'), key: z.string().min(1).max(64), ...Cmp }),
  z.object({ kind: z.literal('definition'), definition: SegmentDefinition }),
  /** The triggering profile update touched `field` (and, with `from` / `to`, the recorded old / new value of that field equal them). Only meaningful for profile_updated entries. */
  z.object({ kind: z.literal('field_changed'), field: z.string().min(1).max(128), from: z.unknown().optional(), to: z.unknown().optional() }),
  /** Is (or was) the profile inside another journey? `ever` = any enrollment, `completed` = finished it. */
  z.object({ kind: z.literal('in_workflow'), workflowId: Id, state: z.enum(['active', 'completed', 'ever']).default('active') }),
  /** Weekday (1 = Monday .. 7 = Sunday) and/or time-of-day window in `tz` (default: the flow zone). Window may wrap midnight. */
  z.object({ kind: z.literal('time'), weekdays: z.array(z.number().int().min(1).max(7)).optional(), startMin: z.number().int().min(0).max(1440).optional(), endMin: z.number().int().min(0).max(1440).optional(), tz: z.string().max(64).optional() }),
  /** Compare a date (profile field, trigger path or var) with now: before/after/today, within N days either way, or an anniversary (month and day) within N days. */
  z.object({
    kind: z.literal('date'), source: z.enum(['field', 'trigger', 'var']).default('field'), path: z.string().min(1).max(128),
    op: z.enum(['before', 'after', 'today', 'within_next_days', 'within_past_days', 'anniversary_within_days']), days: z.number().int().min(0).max(3660).default(0),
  }),
]);
export type Condition = z.infer<typeof Condition>;

const Send = {
  templateId: Id,
  versionId: Id.optional(),
  route: Route,
  topicId: Id.optional(),
  /** Sequences: continue the thread of this earlier email step. */
  replyToStep: NodeId.optional(),
  /** What to do when delivery blocks the send (no consent, suppressed, ...). `continue` follows `on_blocked` if wired, else `next`. */
  onBlocked: z.enum(['continue', 'exit']).default('continue'),
  /** When the send itself errors (render failure, provider rejection raised synchronously) carry on to `next` instead of failing the enrollment. */
  skipOnFailure: z.boolean().optional(),
  /** Per-message smart sending: skip this message (continue to `next`) when the person already got any message from this flow's sender inside this many hours. */
  skipIfMessagedWithinHours: z.number().int().min(1).max(24 * 30).optional(),
  /** Additional message filter: people who do not match skip just this message and carry on. Same conditions as the segment builder. */
  filter: SegmentDefinition.optional(),
};
const Empty = z.object({}).default({});
/** What reaching a goal means: an event (with property filter) or a segment definition. */
export const GoalMatch = z.object({ kind: z.enum(['event', 'segment']), eventName: z.string().max(128).optional(), filter: z.record(z.string(), z.unknown()).optional(), definition: SegmentDefinition.optional() });
export type GoalMatch = z.infer<typeof GoalMatch>;
/** Targeted notification: in-app always, plus email to members/addresses, Slack incoming webhook, or any webhook. Title, subject and body are liquid. */
const Notify = z.object({
  title: z.string().max(200).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  to: z.object({
    userIds: z.array(Id).max(20).default([]), emails: z.array(z.email()).max(20).default([]),
    slackWebhookUrl: z.url().optional(), webhookUrl: z.url().optional(),
  }).default({ userIds: [], emails: [] }),
  params: z.record(z.string(), z.unknown()).default({}),
}).default({ to: { userIds: [], emails: [] }, params: {} });
const OnExceed = z.enum(['hold', 'branch', 'exit']).default('hold');
const Weight = z.number().int().min(0).max(1000);
/** `onClosed: exit` ends the journey when the window is closed instead of waiting for it to open. */
const Hours = z.object({ startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440), weekdays: z.array(z.number().int().min(1).max(7)).optional(), tz: z.string().optional(), onClosed: z.enum(['wait', 'exit']).optional() });
const Action = z.object({ title: z.string().max(200).optional(), params: z.record(z.string(), z.unknown()).default({}) }).default({ params: {} });

const node = <T extends string, C extends z.ZodType>(type: T, config: C) =>
  z.object({ id: NodeId, type: z.literal(type), config, position: Pos });

export const WorkflowNode = z.discriminatedUnion('type', [
  // messaging
  node('send_email', z.object(Send)),
  /** `purpose` lets a prospecting sequence send SMS under the consent-based `marketing` purpose; otherwise SMS stays blocked for prospecting. */
  node('send_sms', z.object({ ...Send, purpose: Purpose.optional() })),
  /** Approved WhatsApp template (a content template of channel whatsapp). Needs explicit WhatsApp consent; free text is never sent from a flow. */
  node('send_whatsapp', z.object({ ...Send, purpose: Purpose.optional() })),
  /** Mobile or web push (a content template of channel push: title = subject, body = text). Needs push consent; fans out to every valid device token. */
  node('send_push', z.object({ ...Send, purpose: Purpose.optional(), push: PushExtras.optional() })),
  node('send_transactional_email', z.object(Send)),
  node('notify_internal', Notify),
  node('create_task', Action),
  node('send_webhook', z.object({
    /** Saved call (Settings > Webhooks > Call templates): its url, method, headers, body and secrets are the defaults; fields set here win. */
    webhookTemplateId: Id.optional(),
    url: z.url().optional(),
    method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE', 'GET']).optional(),
    /** Extra headers whose values come from named integration secrets (Settings > Integrations), opened at send time. */
    authHeaders: z.array(z.object({ header: z.string().regex(/^[A-Za-z0-9-]{1,64}$/), secretName: z.string().min(1).max(100), prefix: z.string().max(40).optional() })).max(10).optional(),
    body: z.record(z.string(), z.unknown()).optional(), headers: z.record(z.string(), z.string()).optional(),
    /** Total attempts including the first; transient failures (network, 5xx, 429) are retried with backoff. */
    maxAttempts: z.number().int().min(1).max(8).default(5),
    /** When set, the body is signed: `x-hermetica-signature: t=<unix>,v1=<hmac-sha256 of "t.body">`. */
    /** Write-only: the API seals it into `signingSecretSealed` and never returns either (reads show `signingSecretSet`). */
    signingSecret: z.string().min(8).max(200).optional(),
    signingSecretSealed: z.string().max(2000).optional(),
    signingSecretSet: z.boolean().optional(),
    /** Copy values out of a JSON response onto the profile: `path` is a dot path into the response. */
    responseMap: z.array(z.object({ path: z.string().min(1).max(200), field: z.string().min(1).max(128) })).max(20).default([]),
    /** Values for the inputs a custom-action call template declares; liquid, so `{{ profile.email }}` maps a profile field in. */
    inputFields: z.record(z.string(), z.string().max(2000)).default({}),
    /** Hold the contact until the call finishes so later steps see the mapped attributes; `failed` (optional edge) is followed on give-up or timeout. */
    awaitResponse: z.boolean().default(false),
    /** Hold the contact until the outside system calls back (POST /v1/workflow-actions/callbacks/{callbackId}/complete) with its output values; the body carries `callbackId`. */
    awaitCallback: z.boolean().default(false),
    responseTimeout: Duration.default({ amount: 10, unit: 'minutes' }),
  }).refine((c) => c.url || c.webhookTemplateId, { message: 'Give a url or choose a call template', path: ['url'] })),
  node('add_note', z.object({ body: z.string().min(1).max(5000) })),
  /** Queue an in-app message for the contact: shown on their next app/site visit (the app asks for messages) unless it expires first. */
  node('show_in_app', z.object({ messageId: Id, expiresInHours: z.number().int().min(1).max(24 * 30).default(24) })),
  // logic
  node('if_else', z.object({ condition: Condition })),
  /** `first`: first matching path wins. `weighted`: among all matching paths pick one by weight (persisted per profile); none match -> else. */
  node('multi_branch', z.object({
    branches: z.array(z.object({ key: z.string().min(1).max(32), condition: Condition, weight: Weight.default(1) })).min(1).max(25),
    pick: z.enum(['first', 'weighted']).default('first'),
  })),
  node('random_split', z.object({ splits: z.array(z.object({ key: z.string().min(1).max(32), weight: Weight })).min(2).max(26) })),
  node('ab_test', z.object({
    experimentId: Id.optional(),
    variants: z.array(z.object({ key: z.string().min(1).max(32), weight: Weight })).min(2).max(26),
    /** Pick the winner by `metric` once `afterHours` have passed, each variant has `minRecipients` sends and the best one is ahead with confidence `pBest`; later entrants then all take the winner. Applies when the test first runs. */
    autoWinner: z.object({
      metric: z.enum(['clicks', 'opens', 'conversions', 'revenue', 'replies']).default('clicks'),
      afterHours: z.number().int().min(1).max(24 * 30).default(48),
      minRecipients: z.number().int().min(1).max(1_000_000).default(100),
      minConversions: z.number().int().min(1).max(1_000_000).default(20),
      pBest: z.number().min(0.5).max(0.999).default(0.95),
      /** End the test at this moment; the variant ahead wins even without a clear result. */
      stopAt: z.iso.datetime({ offset: true }).optional(),
      /** Gradually send more new people to the better-looking variants while the test runs. */
      shift: z.boolean().optional(),
    }).optional(),
  })),
  /** Loop over a list in the trigger event (e.g. `properties.items` of an order): each pass exits `item` with `vars.item` set; wire the body back to this step. `done` runs after the last one. */
  node('for_each_item', z.object({ path: z.string().min(1).max(128), max: z.number().int().min(1).max(25).default(10) })),
  /** Look up one row in an uploaded collection (a table of rows) by a column value; `found` / `not_found` branch. The row is kept as `vars.lookup_<saveAs>` for later conditions and messages. */
  node('query_collection', z.object({
    collectionId: Id,
    column: z.string().min(1).max(128),
    /** Liquid, compared as text without regard to case, for example `{{ profile.country }}`. */
    value: z.string().min(1).max(500).default('{{ profile.emailPrimary }}'),
    saveAs: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'lowercase letters, digits, underscore').default('row'),
  })),
  node('switch', z.object({ field: z.string().min(1).max(128), cases: z.array(z.string().max(128)).min(1).max(25) })),
  node('merge', Empty),
  /** With `condition`: jump only when it holds, otherwise continue on `next` (optional edge). */
  node('goto', z.object({ target: NodeId, condition: Condition.optional() })),
  /** Remove the profile from another journey (the mirror of enroll_workflow). */
  node('exit_workflow', z.object({ workflowId: Id, reason: z.string().max(64).default('exited_by_journey') })),
  node('exit', z.object({ reason: z.string().max(64).default('exit_node') }).default({ reason: 'exit_node' })),
  node('enroll_workflow', z.object({ workflowId: Id })),
  // timing
  /** After the wait, optionally move on to a time of day (`atTime`, 24-hour) and/or the next allowed weekday (1 = Monday .. 7 = Sunday), in the recipient's zone. */
  node('delay', z.object({
    duration: Duration, mode: z.enum(['calendar', 'exact']).default('calendar'),
    atTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM').optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    /** Time zone for the time of day and the days; empty = the recipient's own (falling back to the journey's zone). */
    tz: z.string().max(64).optional(),
  })),
  /** `yearly`: wait for the next occurrence of the date's month and day (birthdays, renewals). */
  node('wait_until_date', z.object({ attribute: z.string().max(128).optional(), at: z.coerce.date().optional(), offsetDays: z.number().int().default(0), yearly: z.boolean().default(false) })),
  /** Collect contacts into shared release windows (aligned to the clock) and let each window go together. */
  node('batch', z.object({ window: Duration })),
  /** Hold until the hour this person most often engages (campaign send-time optimisation), within the next 24 h. */
  node('wait_best_send_time', Empty),
  node('wait_for_event', z.object({ eventName: z.string().min(1).max(128), filter: z.record(z.string(), z.unknown()).optional(), timeout: Duration })),
  /** Resume on whichever listed event arrives first (path `event:<key>`), or `timeout`. */
  node('wait_for_any_event', z.object({
    events: z.array(z.object({ key: z.string().min(1).max(32), eventName: z.string().min(1).max(128), filter: z.record(z.string(), z.unknown()).optional() })).min(2).max(10),
    timeout: Duration,
  })),
  node('wait_until_condition', z.object({ definition: SegmentDefinition, timeout: Duration })),
  /** Race of 2-10 segment definitions: the first the profile enters wins and its `key` edge is followed; else `timeout`. */
  node('wait_for_segments', z.object({
    branches: z.array(z.object({ key: z.string().min(1).max(32), definition: SegmentDefinition })).min(2).max(10), timeout: Duration,
  })),
  /** Wait until the profile's `field` changes (optionally from / to a value, compared with the recorded old / new values); else `timeout`. Only changes made after the wait begins count. */
  node('wait_for_attribute_change', z.object({ field: z.string().min(1).max(128), from: z.unknown().optional(), to: z.unknown().optional(), timeout: Duration })),
  /** Hold until the next listed weekday (1 = Monday .. 7 = Sunday) at `time` in `tz` (default: the recipient's / flow zone). */
  node('wait_until_weekday', z.object({ weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM'), tz: z.string().max(64).optional() })),
  /** Wait until this person is predicted to need the product again: the product's typical gap between orders (a per-product number set here wins, else measured from this product's order history, else from all products' repeat orders, else `fallbackDays`), minus `bufferDays`. */
  node('wait_until_reorder', z.object({
    overrides: z.array(z.object({ productId: z.string().min(1).max(128), days: z.number().int().min(1).max(3650) })).max(100).default([]),
    fallbackDays: z.number().int().min(1).max(3650).default(30),
    minOrders: z.number().int().min(2).max(50).default(3),
    bufferDays: z.number().int().min(0).max(365).default(0),
  })),
  node('random_delay', z.object({ min: Duration, max: Duration })),
  /** Wait until the profile opens/clicks/replies to a message from this journey (optionally one specific send step). */
  node('wait_for_engagement', z.object({ kind: z.enum(['open', 'click', 'reply', 'delivered', 'bounced', 'complained']), stepKey: NodeId.optional(), timeout: Duration })),
  node('business_hours', Hours),
  node('send_window', Hours),
  /** Only let people through between two dates: before `from` hold (or exit), after `to` exit. */
  node('date_window', z.object({ from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), beforeStart: z.enum(['wait', 'exit']).default('wait') })
    .refine((c) => c.from || c.to, { message: 'Give a start date, an end date, or both', path: ['from'] })
    .refine((c) => !c.from || !c.to || c.from < c.to, { message: 'The end must be after the start', path: ['to'] })),
  // state
  node('add_tag', z.object({ name: z.string().min(1).max(64) })),
  node('remove_tag', z.object({ name: z.string().min(1).max(64) })),
  /** `set` is the simple form; `ops` adds increment / append / unset. String values are liquid (`{{ event.properties.plan }}`). */
  node('update_profile', z.object({
    set: z.record(z.string(), z.unknown()).default({}),
    ops: z.array(z.object({ op: z.enum(['set', 'increment', 'append', 'unset']), field: z.string().min(1).max(128), value: z.unknown().optional() })).max(30).default([]),
  })),
  node('add_to_list', z.object({ listId: Id })),
  node('remove_from_list', z.object({ listId: Id })),
  /** Copy a value from the trigger event (dot path into the event, e.g. `properties.plan`) onto a profile field. */
  node('update_by_event', z.object({ field: z.string().min(1).max(128), path: z.string().min(1).max(128) })),
  node('set_field', z.object({ field: z.string().min(1).max(128), value: z.unknown() })),
  node('score', z.object({ delta: z.number().int().min(-1000).max(1000), field: z.string().default('score') })),
  /** Move the contact's score in a published score model by `delta` (history reason `journey`). */
  node('adjust_score', z.object({ modelId: Id, delta: z.number().int().min(-1000).max(1000) })),
  /** Company of the contact (leads module); skipped when the contact has none. */
  node('update_company', z.object({ set: z.object({ name: z.string().max(200).optional(), industry: z.string().max(100).optional(), sizeBand: z.string().max(50).optional(), country: z.string().length(2).optional() }) })),
  /** Put the contact at an existing company (replaces its current link). */
  node('add_to_company', z.object({ companyId: Id })),
  /** Push the contact to a connected CRM now (same upsert the sync uses); skipped when unchanged. */
  node('push_integration', z.object({ integrationId: Id })),
  /** Syntax, disposable-domain and MX check on the primary address (no paid lookup). `rejectRole` also sends info@/sales@ style addresses down `invalid`. */
  node('validate_email', z.object({ rejectRole: z.boolean().default(false) })),
  /** Erases the contact for good (the DSAR erase: address stays suppressed). Runs after this step commits; `confirm` must be ticked so a journey never deletes people by accident. */
  node('delete_contact', z.object({ confirm: z.boolean().default(false).refine((v) => v, 'Tick to confirm this journey may permanently delete contacts') })),
  node('company_branch', z.object({ field: z.enum(['name', 'domain', 'industry', 'sizeBand', 'country', 'stage', 'suppressed']), ...Cmp })),
  node('set_lifecycle', z.object({ stage: z.string().min(1).max(64) })),
  node('update_consent', z.object({ channel: Channel, purpose: Purpose.default('marketing'), status: z.enum(['granted', 'revoked']), proofSource: z.enum(['trigger_event', 'form']).optional() })),
  // control
  /** `skipAhead`: a contact who meets `match` (or the flow goal) anywhere earlier in the journey jumps straight here. */
  node('goal', z.object({ name: z.string().max(64).default('goal'), skipAhead: z.boolean().default(false), match: GoalMatch.optional() })),
  /** Counts this profile's sends (delivery data) in the window. Over the cap: `hold` waits until room opens, `branch` follows the `limited` edge, `exit` ends the enrollment. */
  node('frequency_cap', z.object({ maxSends: z.number().int().min(1), windowHours: z.number().int().min(1), channel: Channel.optional(), onExceed: OnExceed })),
  node('suppression_check', z.object({ channel: Channel, purpose: Purpose.default('marketing') })),
  /** At most `perHour` enrollments through this node per clock-aligned window (`windowMinutes`, default an hour). */
  node('rate_limit', z.object({ perHour: z.number().int().min(1), windowMinutes: z.number().int().min(1).max(10080).default(60), onExceed: OnExceed })),
  node('add_suppression', z.object({ channel: Channel, reason: z.string().max(64).default('workflow') })),
  /** Lifts only manual suppressions; bounces, complaints and STOPs stay. */
  node('remove_suppression', z.object({ channel: Channel })),
  node('approval_gate', Empty),
  node('pause', Empty),
  node('end', Empty),
  // outbound (P7 consumes the requested actions)
  node('stop_on_reply', Empty),
  node('stop_on_bounce', Empty),
  node('stop_on_unsubscribe', Empty),
  node('classify_reply', Action),
  node('assign_owner', Action),
  node('rotate_mailbox', Action),
  node('follow_up_task', Action),
]);
export type WorkflowNode = z.infer<typeof WorkflowNode>;
export type NodeType = WorkflowNode['type'];
export type NodeOf<T extends NodeType> = Extract<WorkflowNode, { type: T }>;
