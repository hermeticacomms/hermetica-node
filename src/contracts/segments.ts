import { z } from 'zod';
import { Channel, Id, PageQuery, Timestamp } from './common.ts';
import { ProfileDto } from './identity.ts';

export const MAX_SEGMENT_DEPTH = 5;
export const MAX_SEGMENT_CONDITIONS = 100;

export const PROPERTY_PATH_RE = /^[a-zA-Z0-9_]{1,64}(\.[a-zA-Z0-9_]{1,64}){0,4}$/;
const PropertyPath = z.string().regex(PROPERTY_PATH_RE, 'Invalid property path');

/** Standard profile fields (camelCase like the profile DTO) and their value type. */
export const STANDARD_FIELDS = {
  email: 'string', phone: 'string', firstName: 'string', lastName: 'string', timezone: 'string', locale: 'string',
  country: 'string', city: 'string', region: 'string', source: 'string', lifecycleStage: 'string', ownerUserId: 'string',
  kind: 'string', createdAt: 'date',
  /** When the profile last changed (date_modified) and when it first got an email, phone or external id (date_identified). */
  updatedAt: 'date', identifiedAt: 'date',
} as const;
export type StandardField = keyof typeof STANDARD_FIELDS;
export const ProfileField = z.union([
  z.enum(Object.keys(STANDARD_FIELDS) as [StandardField, ...StandardField[]]),
  z.string().startsWith('attributes.').refine((s) => PROPERTY_PATH_RE.test(s.slice('attributes.'.length)), 'Invalid attribute path'),
]);

// ---- operators per value type -------------------------------------------------------------------------------------
const str = z.string().max(512);
const DateValue = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const days = z.number().int().min(0).max(3650);
/** Calendar date tokens, in the workspace zone: weeks start on Monday. */
export const CALENDAR_PERIODS = ['today', 'yesterday', 'tomorrow', 'this_week', 'last_week', 'next_week', 'this_month', 'last_month', 'next_month', 'this_year', 'last_year', 'next_year'] as const;
export type CalendarPeriod = (typeof CALENDAR_PERIODS)[number];

const REPEAT_COUNT = /\{(\d+)(?:,(\d*))?\}/y;

/** A repeated group that holds a repeat, or a count above 255 (Postgres's own limit). Skips escapes and character classes. */
function repeatProblem(p: string): string | null {
  const open: boolean[] = [];
  let closedHasRepeat = false; // the atom just before this position is a group with a repeat inside
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    let repeat = c === '*' || c === '+' || c === '?';
    if (c === '{') {
      REPEAT_COUNT.lastIndex = i;
      const m = REPEAT_COUNT.exec(p);
      if (m) {
        if (Number(m[1]) > 255 || Number(m[2] || 0) > 255) return 'Repeat counts above 255 are not allowed';
        repeat = true;
        i += m[0].length - 1;
      }
    }
    if (repeat) {
      if (closedHasRepeat) return 'A repeat inside a repeated group is not allowed';
      if (open.length) open[open.length - 1] = true;
      closedHasRepeat = false;
    } else if (c === ')') {
      closedHasRepeat = open.pop() ?? false;
      if (closedHasRepeat && open.length) open[open.length - 1] = true;
    } else {
      closedHasRepeat = false;
      if (c === '(') { open.push(false); if (p[i + 1] === '?') i++; }
      else if (c === '\\') i++;
      else if (c === '[') {
        i += p[i + 1] === '^' ? 2 : 1;
        if (p[i] === ']') i++;
        while (i < p.length && p[i] !== ']') i += p[i] === '\\' ? 2 : 1;
      }
    }
  }
  return null;
}

/**
 * A pattern is run by Postgres on every profile, so it must be small, valid, and free of the shapes that can blow up its matcher.
 * These checks only remove the obvious ones (ambiguous alternation can still be slow): statement_timeout around every segment query is the real bound.
 */
export function regexProblem(p: string): string | null {
  if (p.length > 200) return 'Pattern is longer than 200 characters';
  if (/\\[1-9]|\(\?[=!<]/.test(p)) return 'Back-references and look-around are not allowed';
  try { RegExp(p); } catch { return 'Pattern is not a valid regular expression'; }
  return repeatProblem(p);
}

const StringPredicate = z.discriminatedUnion('op', [
  z.object({ valueType: z.literal('string'), op: z.enum(['matches_regex', 'not_matches_regex']), value: z.string().min(1) }).refine((p) => !regexProblem(p.value), { message: 'Not a valid, safe pattern (max 200 characters, no back-references, look-around, repeats inside repeated groups or counts above 255)', path: ['value'] }),
  z.object({ valueType: z.literal('string'), op: z.enum(['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'not_starts_with', 'ends_with', 'not_ends_with']), value: str }),
  z.object({ valueType: z.literal('string'), op: z.enum(['in', 'not_in']), values: z.array(str).min(1).max(500) }),
  z.object({ valueType: z.literal('string'), op: z.enum(['exists', 'not_exists']) }),
]);
const NumberPredicate = z.discriminatedUnion('op', [
  z.object({ valueType: z.literal('number'), op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']), value: z.number() }),
  z.object({ valueType: z.literal('number'), op: z.enum(['between', 'not_between']), from: z.number(), to: z.number() }),
]);
const DatePredicate = z.discriminatedUnion('op', [
  z.object({ valueType: z.literal('date'), op: z.enum(['before', 'after']), value: DateValue }),
  z.object({ valueType: z.literal('date'), op: z.enum(['between', 'not_between']), from: DateValue, to: DateValue }),
  z.object({ valueType: z.literal('date'), op: z.enum(['within_last', 'not_within_last', 'within_next', 'is_anniversary_within', 'anniversary_in_last']), days }),
  /** Month and day only, ignoring the year (birthdays, anniversaries): this calendar month, or a named month 1-12. */
  z.object({ valueType: z.literal('date'), op: z.literal('anniversary_this_month') }),
  z.object({ valueType: z.literal('date'), op: z.literal('anniversary_in_month'), month: z.number().int().min(1).max(12) }),
  /** Falls in a calendar period: today, this/last/next week, month or year. */
  z.object({ valueType: z.literal('date'), op: z.literal('in_period'), period: z.enum(CALENDAR_PERIODS) }),
]);
/** "Is set" / "is not set" for every non-text type (text has its own exists/not_exists above). */
const SetPredicate = z.object({ valueType: z.enum(['number', 'date', 'boolean', 'list']), op: z.enum(['exists', 'not_exists']) });
const BooleanPredicate = z.object({ valueType: z.literal('boolean'), op: z.enum(['is_true', 'is_false']) });
const ListPredicate = z.object({ valueType: z.literal('list'), op: z.enum(['contains_any', 'contains_all', 'not_contains_any', 'not_contains_all']), values: z.array(str).min(1).max(100) });
const ListTextPredicate = z.object({ valueType: z.literal('list'), op: z.enum(['contains_text', 'not_contains_text']), value: str });
const ListEmptyPredicate = z.object({ valueType: z.literal('list'), op: z.enum(['is_empty', 'is_not_empty']) });
/** Number of items in a list-valued property. */
const ListLengthPredicate = z.object({ valueType: z.literal('list'), op: z.enum(['length_eq', 'length_gt', 'length_gte', 'length_lt', 'length_lte']), value: z.number().int().min(0) });

export const Predicate = z.union([SetPredicate, StringPredicate, NumberPredicate, DatePredicate, BooleanPredicate, ListPredicate, ListTextPredicate, ListEmptyPredicate, ListLengthPredicate]);
export type Predicate = z.infer<typeof Predicate>;
export type DatePredicate = z.infer<typeof DatePredicate>;
export type NumberPredicate = z.infer<typeof NumberPredicate>;

// ---- conditions ---------------------------------------------------------------------------------------------------
/** Top-level attribute key as stored (history is keyed by it). */
const AttrKey = z.string().min(1).max(128);
const neg = { negate: z.boolean().optional() };
/** Event property path; `[]` after a segment steps into every item of an array (e.g. `Items[].Categories[]`). */
export const EVENT_PATH_RE = /^[a-zA-Z0-9_]{1,64}(\[\])?(\.[a-zA-Z0-9_]{1,64}(\[\])?){0,4}$/;
const EventPropertyPath = z.string().regex(EVENT_PATH_RE, 'Invalid property path');
/** Predictive values the nightly job stores under `attributes.predictive` (see analytics predict), with their type. */
export const PREDICTIVE_METRICS = {
  churn_risk: 'number', predicted_clv: 'number', historic_clv: 'number', total_clv: 'number', avg_order_value: 'number',
  avg_order_interval_days: 'number', order_count: 'number', predicted_orders: 'number', expected_next_order_at: 'date', p_alive: 'number',
  /** Inferred from the first name (analytics `profile_gender_predictions`, not an attribute): likely_female | likely_male | uncertain. */
  predicted_gender: 'string',
} as const;
export type PredictiveMetric = keyof typeof PREDICTIVE_METRICS;
export const SEGMENT_SUPPRESSION_REASONS = ['unsubscribe', 'hard_bounce', 'complaint', 'stop_keyword', 'manual', 'invalid', 'dnc'] as const;
/** Countries where distance from a postal code can be judged: US, UK, Canada, Australia, New Zealand and most EU countries (not CY, EE, GR, MT). */
export const PROXIMITY_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'NZ', 'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'FI', 'FR', 'DE', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'] as const;
export const ProximityCountry = z.string().trim().length(2).toUpperCase().transform((c) => (c === 'UK' ? 'GB' : c)).refine((c) => (PROXIMITY_COUNTRIES as readonly string[]).includes(c), 'Distance searches work for the US, UK, Canada, Australia, New Zealand and most EU countries');
const Cmp = z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
/** Fixed company columns and their type. */
export const COMPANY_FIELDS = { name: 'string', domain: 'string', industry: 'string', sizeBand: 'string', country: 'string', stage: 'string', createdAt: 'date' } as const;
export type CompanyFixedField = keyof typeof COMPANY_FIELDS;
const CompanyField = z.union([
  z.enum(Object.keys(COMPANY_FIELDS) as [CompanyFixedField, ...CompanyFixedField[]]),
  z.string().startsWith('fields.').refine((s) => PROPERTY_PATH_RE.test(s.slice('fields.'.length)), 'Invalid company field'),
]);

export const EventWindow = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ever') }),
  z.object({ kind: z.literal('last_days'), days: z.number().int().min(1).max(3650) }),
  z.object({ kind: z.literal('between'), from: DateValue, to: DateValue }),
  /** From a date until now ("since"), or up to a date ("before"). */
  z.object({ kind: z.literal('since'), from: DateValue }),
  z.object({ kind: z.literal('before'), to: DateValue }),
  /** Upcoming days (future-dated events, e.g. a booking). */
  /** At least N days ago (everything older than that). */
  z.object({ kind: z.literal('older_than_days'), days: z.number().int().min(1).max(3650) }),
  z.object({ kind: z.literal('next_days'), days: z.number().int().min(1).max(3650) }),
  /** The current, previous or next calendar day/week/month/quarter/year (workspace zone). */
  z.object({ kind: z.literal('calendar'), unit: z.enum(['day', 'week', 'month', 'quarter', 'year']), which: z.enum(['this', 'last', 'next']) }),
]);
export type EventWindow = z.infer<typeof EventWindow>;

/** Extra tests on the consent record behind a status: how it was given (form, api, double_opt_in, import...), when, and double opt-in. */
const consentExtras = {
  method: z.string().trim().min(1).max(64).optional(),
  window: EventWindow.optional(),
  doubleOptIn: z.boolean().optional(),
};

export const EventMeasure = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('count'), op: Cmp, value: z.number().int().min(0) }),
  z.object({ kind: z.enum(['first', 'last']), when: DatePredicate }),
  /** Total of the event's recorded value (revenue) across matching events, in major currency units. */
  z.object({ kind: z.literal('value_sum'), predicate: NumberPredicate }),
  /** Number of distinct values of a property across matching events (e.g. distinct product ids). */
  z.object({ kind: z.literal('distinct_count'), property: PropertyPath, op: Cmp, value: z.number().int().min(0) }),
  /** LastPerformed: take the most recent matching event, then require its properties to satisfy every `has` test. */
  z.object({ kind: z.literal('last_has'), has: z.array(z.object({ path: PropertyPath, predicate: Predicate })).min(1).max(10) }),
  /** KeyedPerformed: one instance per distinct `key` value (its latest event); count the instances whose latest event satisfies every `has` test (none = all). */
  z.object({
    kind: z.literal('keyed_count'), key: PropertyPath, op: Cmp, value: z.number().int().min(0),
    has: z.array(z.object({ path: PropertyPath, predicate: Predicate })).max(10).optional(),
  }),
  z.object({ kind: z.literal('aggregate'), fn: z.enum(['sum', 'avg', 'min', 'max']), property: PropertyPath, predicate: NumberPredicate }),
]);
export type EventMeasure = z.infer<typeof EventMeasure>;

export const SegmentCondition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('profile_property'), field: ProfileField, predicate: Predicate, ...neg }),
  z.object({ type: z.literal('identifier_exists'), identifierType: z.enum(['email', 'phone', 'external_id', 'anonymous_id', 'crm_id']), verified: z.boolean().optional(),
    /** Exact identifier values (emails lower-cased; phones in E.164): matches a profile holding any of them. */
    values: z.array(z.string().trim().min(1).max(256)).min(1).max(500).optional(), ...neg }),
  z.object({ type: z.literal('tag'), name: z.string().min(1).max(64), ...neg }),
  /** `window` limits to people added to the list in that period. */
  /** `meta` tests the data stored on the membership itself (Mailchimp list-member meta) with a text predicate. */
  z.object({ type: z.literal('list_membership'), listId: Id, window: EventWindow.optional(), meta: z.object({ key: PropertyPath, predicate: Predicate }).optional(), ...neg }),
  z.object({
    type: z.literal('event'),
    name: z.string().min(1).max(128),
    properties: z.array(z.object({ path: EventPropertyPath, predicate: Predicate })).max(10).optional(),
    window: EventWindow.default({ kind: 'ever' }),
    measure: EventMeasure.default({ kind: 'count', op: 'gte', value: 1 }),
    ...neg,
  }),
  z.object({
    type: z.literal('consent_status'),
    channel: Channel,
    purpose: z.string().min(1).max(64).optional(),
    topic: z.string().min(1).max(64).optional(),
    status: z.enum(['granted', 'revoked', 'pending_confirmation', 'none']),
    ...consentExtras,
    ...neg,
  }),
  /** `reason` narrows to one cause: hard bounce, invalid address, manual, unsubscribe... */
  z.object({ type: z.literal('suppressed'), channel: Channel, reason: z.enum(SEGMENT_SUPPRESSION_REASONS).optional(), ...neg }),
  /** Country is in the European Union (UK excluded) or the United States, from the profile's two-letter country. */
  z.object({ type: z.literal('in_region'), region: z.enum(['eu', 'us']), ...neg }),
  /** Opted out of tracking (contact preference). Negate for "can be tracked". */
  z.object({ type: z.literal('tracking_opted_out'), ...neg }),
  /** Spend tier from total lifetime value; the tier boundaries are the workspace's segment settings. */
  z.object({ type: z.literal('spend_tier'), tier: z.enum(['low', 'medium', 'high', 'top']), ...neg }),
  /** Can be sent marketing now: unexpired marketing consent granted and not suppressed on the channel. Negate for "cannot". */
  z.object({ type: z.literal('can_receive_marketing'), channel: Channel, ...consentExtras, ...neg }),
  /** A predicted value (CLV, churn risk, next order date...) tested with a number or date operator. */
  z.object({ type: z.literal('predictive'), metric: z.enum(Object.keys(PREDICTIVE_METRICS) as [PredictiveMetric, ...PredictiveMetric[]]), predicate: z.union([NumberPredicate, DatePredicate, SetPredicate, StringPredicate]), ...neg }),
  /** Within a distance of a point or postal code, from the profile's `latitude`/`longitude` attributes. */
  z.object({
    type: z.literal('location_radius'),
    center: z.union([
      z.object({ kind: z.literal('point'), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
      z.object({ kind: z.literal('postal'), postalCode: z.string().trim().min(2).max(16), country: ProximityCountry }),
    ]),
    radius: z.number().positive().max(20_000),
    unit: z.enum(['km', 'mi']),
    ...neg,
  }),
  z.object({
    type: z.literal('object_link'),
    objectType: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
    properties: z.array(z.object({ path: PropertyPath, predicate: Predicate })).max(10).optional(),
    ...neg,
  }),
  z.object({ type: z.literal('segment_membership'), segmentId: Id, ...neg }),
  z.object({ type: z.literal('location'), field: z.enum(['country', 'region', 'city']), op: z.enum(['eq', 'in']), values: z.array(str).min(1).max(200), ...neg }),
  z.object({
    type: z.literal('message_engagement'),
    /** `sent` = handed to the provider; `dropped` = blocked before sending (consent, suppression, limits). */
    engagement: z.enum(['sent', 'received', 'opened', 'clicked', 'replied', 'bounced', 'complained', 'dropped']),
    /** Only messages on this channel (SMS clicks, push receipts...). */
    channel: Channel.optional(),
    /** Only messages rendered from a template carrying this tag. */
    templateTag: z.string().trim().min(1).max(64).optional(),
    /** Only messages rendered from this template (any version). */
    templateId: Id.optional(),
    /** Omitted = any source (campaign, journey, sequence, transactional). */
    sourceKind: z.string().min(1).max(32).optional(),
    sourceId: Id.optional(),
    /** Clicked link (only for `clicked`): the URL contains or equals the text. */
    url: z.object({ op: z.enum(['contains', 'equals']), value: z.string().min(1).max(500) }).optional(),
    /** The message subject contains this text. */
    subjectContains: z.string().min(1).max(200).optional(),
    /** Only campaigns whose name contains or equals the text. */
    campaignName: z.object({ op: z.enum(['contains', 'equals']), value: z.string().min(1).max(200) }).optional(),
    window: EventWindow.default({ kind: 'ever' }),
    /** At least this many engagement events (default 1). */
    minCount: z.number().int().min(1).max(10_000).optional(),
    ...neg,
  }),
  /** The attribute currently holds `value` and has held it for at least `atLeastDays` (from attribute change history). */
  /** `comparator: 'under'` flips it: holds the value now, but for less than `atLeastDays` days. */
  z.object({ type: z.literal('attribute_has_been'), key: AttrKey, value: z.union([z.string().max(512), z.number(), z.boolean()]), atLeastDays: days, comparator: z.enum(['at_least', 'under']).optional(), ...neg }),
  /** The attribute changed (optionally from/to a value) within the window. */
  z.object({
    type: z.literal('attribute_changed'),
    key: AttrKey,
    to: z.union([z.string().max(512), z.number(), z.boolean()]).optional(),
    from: z.union([z.string().max(512), z.number(), z.boolean()]).optional(),
    window: EventWindow.default({ kind: 'ever' }),
    ...neg,
  }),
  /** Last activity = latest event or engagement of the profile. */
  z.object({ type: z.literal('last_active'), when: DatePredicate, ...neg }),
  z.object({ type: z.literal('workflow_membership'), workflowId: Id, activeOnly: z.boolean().optional(), ...neg }),
  /** Stable pseudo-random slice of all profiles (same profile always lands in the same bucket for a given salt). */
  z.object({ type: z.literal('random_percent'), percent: z.number().int().min(0).max(100), salt: z.string().max(64).default(''), ...neg }),
  /** The profile's company: a fixed company field, or `fields.<key>` for a company custom field. */
  z.object({ type: z.literal('company_property'), field: CompanyField, predicate: Predicate, ...neg }),
  /** Member of a list or campaign in a connected CRM (inbound membership sync). Omit `connectionId` for any connection. */
  z.object({ type: z.literal('crm_list_membership'), connectionId: Id.optional(), crmListId: z.string().trim().min(1).max(256), ...neg }),
  /** Object segments only: a property of the object itself. */
  z.object({ type: z.literal('object_property'), path: PropertyPath, predicate: Predicate, ...neg }),
  /** Object segments only: how many people are linked to the object, optionally only people in a segment. */
  z.object({ type: z.literal('object_linked_profiles'), op: Cmp, value: z.number().int().min(0), segmentId: Id.optional(), ...neg }),
]);
/** Conditions that test an object instead of a person; only object segments use them, and object segments use only them. */
export const OBJECT_CONDITIONS = ['object_property', 'object_linked_profiles'] as const;
export type SegmentCondition = z.infer<typeof SegmentCondition>;

export interface SegmentGroup {
  type: 'group';
  op: 'and' | 'or';
  negate?: boolean | undefined;
  children: SegmentNode[];
}
export type SegmentNode = SegmentGroup | SegmentCondition;

/** Input side (before window/measure defaults): what callers may hand to services. */
export interface SegmentGroupInput {
  type: 'group';
  op: 'and' | 'or';
  negate?: boolean | undefined;
  children: SegmentNodeInput[];
}
export type SegmentNodeInput = SegmentGroupInput | z.input<typeof SegmentCondition>;

const SegmentNodeSchema: z.ZodType<SegmentNode, SegmentNodeInput> = z.lazy(() => z.union([SegmentGroupSchema, SegmentCondition]));
const SegmentGroupSchema: z.ZodType<SegmentGroup, SegmentGroupInput> = z.lazy(() =>
  z.object({ type: z.literal('group'), op: z.enum(['and', 'or']), negate: z.boolean().optional(), children: z.array(SegmentNodeSchema).max(MAX_SEGMENT_CONDITIONS) }),
);

export const walkConditions = (n: SegmentNode, fn: (c: SegmentCondition) => void): void =>
  n.type === 'group' ? n.children.forEach((c) => walkConditions(c, fn)) : fn(n);
const depthOf = (n: SegmentNode): number => (n.type === 'group' ? 1 + Math.max(0, ...n.children.map(depthOf)) : 0);

/** Root is always a group; an empty `and` group matches every profile. */
export const SegmentDefinition = SegmentGroupSchema.superRefine((def, ctx) => {
  let count = 0;
  walkConditions(def, () => count++);
  if (count > MAX_SEGMENT_CONDITIONS) ctx.addIssue({ code: 'custom', message: `At most ${MAX_SEGMENT_CONDITIONS} conditions` });
  if (depthOf(def) > MAX_SEGMENT_DEPTH) ctx.addIssue({ code: 'custom', message: `Groups nest at most ${MAX_SEGMENT_DEPTH} deep` });
});
export type SegmentDefinition = z.output<typeof SegmentDefinition>;
/** Before defaults (window/measure) are applied: what callers may pass to services. */
export type SegmentDefinitionInput = SegmentGroupInput;

// ---- DTOs ---------------------------------------------------------------------------------------------------------
export const SegmentDto = z.object({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  folder: z.string().nullable(),
  definition: SegmentDefinition,
  status: z.enum(['active', 'archived']),
  evalStatus: z.enum(['pending', 'ready', 'failed']),
  lastEvaluatedAt: Timestamp.nullable(),
  memberCount: z.number().int(),
  dependencyKeys: z.array(z.string()),
  version: z.number().int(),
  /** `profile`, or the custom object type key the segment selects (an object segment). */
  subject: z.string(),
  starred: z.boolean(),
  tags: z.array(z.string()).optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const SegmentPage = z.object({ items: z.array(SegmentDto), nextCursor: z.uuid().nullable() });
/** `profile` (default) or a custom object type key (segments the objects themselves). */
export const SegmentSubject = z.string().regex(/^(profile|[a-z][a-z0-9_]{0,62})$/, 'profile or an object type key');
export const CreateSegmentBody = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().max(2000).nullish(), folder: z.string().trim().min(1).max(80).nullish(), definition: SegmentDefinition,
  tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(), subject: SegmentSubject.optional(), starred: z.boolean().optional(),
});
export const UpdateSegmentBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  folder: z.string().trim().min(1).max(80).nullish(),
  definition: SegmentDefinition.optional(),
  status: z.enum(['active', 'archived']).optional(),
  starred: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});
export const SegmentPreviewBody = z.object({ definition: SegmentDefinition, subject: SegmentSubject.optional() });
export const SegmentPreviewResult = z.object({
  count: z.number().int(),
  sample: z.array(ProfileDto),
  explanation: z.array(z.string()),
  evaluatedAt: Timestamp,
});
export const SegmentVersionDto = z.object({ id: Id, segmentId: Id, n: z.number().int(), definition: SegmentDefinition, createdBy: z.string(), createdAt: Timestamp });
export const SegmentVersionList = z.object({ items: z.array(SegmentVersionDto) });
export const SnapshotDto = z.object({ id: Id, segmentId: Id.nullable(), takenAt: Timestamp, count: z.number().int() });
const Csv = (max: number) => z.string().max(max * 40).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.uuid()).max(max));
const Bool = z.enum(['true', 'false']).transform((v) => v === 'true');
export const SEGMENT_SORTS = ['name', '-name', 'created_at', '-created_at', 'updated_at', '-updated_at', 'member_count', '-member_count'] as const;
/** Members of a segment: filter by email, phone and joined-at; `sort` by joined-at (default: by profile id). */
export const MembersQuery = PageQuery.extend({
  email: z.string().trim().min(1).max(320).optional(), phone: z.string().trim().min(1).max(32).optional(),
  joinedFrom: Timestamp.optional(), joinedTo: Timestamp.optional(), sort: z.enum(['joined_at', '-joined_at']).optional(),
});
/** Segment list: name search (case-insensitive substring), ids, created/updated ranges, active or archived, starred, sort. */
export const SegmentListQuery = PageQuery.extend({
  q: z.string().max(200).optional(), ids: Csv(100).optional(),
  createdFrom: Timestamp.optional(), createdTo: Timestamp.optional(), updatedFrom: Timestamp.optional(), updatedTo: Timestamp.optional(),
  active: Bool.optional(), starred: Bool.optional(), sort: z.enum(SEGMENT_SORTS).optional(),
});
export const EvaluateResult = z.object({ queued: z.literal(true) });

export const SegmentDiffQuery = z.object({ from: z.iso.datetime({ offset: true }).or(z.iso.date()), to: z.iso.datetime({ offset: true }).or(z.iso.date()) });
const DiffSide = z.object({
  count: z.number().int(),
  sample: z.array(z.object({ profileId: Id, email: z.string().nullable(), firstName: z.string().nullable(), lastName: z.string().nullable(), at: Timestamp })),
});
export const SegmentDiff = z.object({ segmentId: Id, from: Timestamp, to: Timestamp, joined: DiffSide, left: DiffSide });

// ---- explain match ------------------------------------------------------------------------------------------------
export const SegmentExplainMatchBody = z.object({ definition: SegmentDefinition, profileId: Id });
export interface SegmentMatchNode {
  kind: 'group' | 'condition';
  label: string;
  matched: boolean;
  /** Group operator, for groups. */
  op?: 'and' | 'or' | undefined;
  negated?: boolean | undefined;
  children?: SegmentMatchNode[] | undefined;
}
const SegmentMatchNodeSchema: z.ZodType<SegmentMatchNode> = z.lazy(() =>
  z.object({ kind: z.enum(['group', 'condition']), label: z.string(), matched: z.boolean(), op: z.enum(['and', 'or']).optional(), negated: z.boolean().optional(), children: z.array(SegmentMatchNodeSchema).optional() }),
);
export const SegmentExplainMatch = z.object({ segmentId: Id.nullable(), profileId: Id, matched: z.boolean(), member: z.boolean().nullable(), tree: SegmentMatchNodeSchema, evaluatedAt: Timestamp });

// ---- builder helpers: suggestions, export -------------------------------------------------------------------------
export const SegmentSuggestQuery = z.object({
  source: z.enum(['event', 'profile', 'consent']),
  /** Event name for source=event. */
  name: z.string().max(128).optional(),
  /** Property path (`Items[].Name`), or a profile field / `attributes.x`. */
  path: z.string().min(1).max(300),
  /** source=consent only: limit to one channel. */
  channel: Channel.optional(),
});
export const SegmentSuggestResult = z.object({ values: z.array(z.object({ value: z.string(), count: z.number().int() })) });
export const SegmentExportResult = z.object({ filename: z.string(), csv: z.string(), count: z.number().int(), truncated: z.boolean() });

// ---- settings: spend tiers, geocoding ------------------------------------------------------------------------------
export const SegmentSpendTiers = z.object({ mid: z.number().min(0), high: z.number().min(0), top: z.number().min(0) })
  .refine((t) => t.mid < t.high && t.high < t.top, 'Each tier boundary must be higher than the one before');
export const SegmentSettingsDto = z.object({ spendTiers: SegmentSpendTiers, geocoder: z.enum(['none', 'opencage']), geocoderKeySet: z.boolean() });
export const UpdateSegmentSettingsBody = z.object({
  spendTiers: SegmentSpendTiers.optional(),
  geocoder: z.enum(['none', 'opencage']).optional(),
  /** Write-only; an empty string removes the stored key. */
  geocoderKey: z.string().max(200).optional(),
});
const PlaceKey = z.object({ country: ProximityCountry, postalCode: z.string().trim().min(2).max(16) });
export const SegmentPlaceCheckBody = PlaceKey;
export const SegmentPlaceBody = PlaceKey.extend({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const SegmentPlaceStatus = z.object({
  placed: z.boolean(), lat: z.number().nullable(), lng: z.number().nullable(), source: z.string().nullable(),
  /** Profiles whose position is known (own coordinates, or a placed postal code). */
  profilesPositioned: z.number().int(), profilesTotal: z.number().int(), geocoder: z.enum(['none', 'opencage']),
});
export const SegmentGeocodeResult = z.object({ placed: z.number().int(), failed: z.number().int(), remaining: z.number().int() });
