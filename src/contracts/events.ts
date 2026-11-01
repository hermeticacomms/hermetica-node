import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';

export const STANDARD_EVENTS = [
  'page_view', 'page_exit', 'form_view', 'form_submit', 'product_view', 'search',
  'add_to_cart', 'remove_from_cart', 'checkout_started', 'purchase', 'identify',
] as const;

export const EventSource = z.enum(['browser', 'server', 'integration', 'system']);
export type EventSource = z.infer<typeof EventSource>;

/** The only `$` names a client may send: reported by the mobile/web SDKs (push opens, geofences). Everything else with `$` is reserved for the system. */
export const CLIENT_RESERVED_EVENTS = ['$opened_push', '$geofence_enter', '$geofence_exit', '$geofence_dwell'] as const;
const EventName = z.string().min(1).max(128).refine((n) => !n.startsWith('$') || (CLIENT_RESERVED_EVENTS as readonly string[]).includes(n), 'names must not start with $');

export const EventContext = z.object({
  page: z.object({ url: z.string().max(2048).optional(), referrer: z.string().max(2048).optional(), title: z.string().max(512).optional() }).optional(),
  userAgent: z.string().max(512).optional(),
  ip: z.string().max(64).optional(),
  utm: z.record(z.string().max(64), z.string().max(256)).optional(),
});

export const EventProfile = z.object({ email: z.string().optional(), phone: z.string().optional(), externalId: z.string().max(256).optional() });

export const IngestEvent = z.object({
  name: EventName,
  occurredAt: Timestamp.optional(),
  properties: z.record(z.string().max(128), z.unknown()).optional(),
  /** Minor currency units (cents). */
  value: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  dedupeKey: z.string().min(1).max(256).optional(),
  profile: EventProfile.optional(),
  anonymousId: z.string().min(1).max(128).optional(),
  context: EventContext.optional(),
});
export type IngestEvent = z.infer<typeof IngestEvent>;

/** Batch bodies keep items opaque so one bad event is rejected individually, not the whole request. */
export const BatchConsent = z.object({ analytics: z.boolean().optional(), marketing: z.boolean().optional() });
export type BatchConsent = z.infer<typeof BatchConsent>;
export const IngestBatchBody = z.object({ events: z.array(z.unknown()).min(1).max(1000), consent: BatchConsent.optional() });
export const IngestResult = z.object({
  accepted: z.number().int(),
  duplicates: z.number().int(),
  rejected: z.array(z.object({ index: z.number().int(), reason: z.string() })),
});

export const IdentifyBody = z.object({
  anonymousId: z.string().min(1).max(128),
  identifiers: EventProfile,
  traits: z.record(z.string().max(128), z.unknown()).optional(),
  consent: BatchConsent.optional(),
});
export const IdentifyResult = z.object({ profileId: Id, created: z.boolean() });

export const EventRecord = z.object({
  id: Id,
  name: z.string(),
  profileId: Id.nullable(),
  anonymousId: z.string().nullable(),
  occurredAt: Timestamp,
  source: EventSource,
  properties: z.record(z.string(), z.unknown()),
  value: z.number().int().nullable(),
  currency: z.string().nullable(),
});
export const ProfileEventsQuery = PageQuery.extend({ name: z.string().optional(), goal: z.enum(['true', 'false']).transform((v) => v === 'true').optional() });
export const EventPage = pageResult(EventRecord);

export const EventDefinitionRecord = z.object({
  id: Id,
  name: z.string(),
  category: z.enum(['standard', 'custom']),
  schema: z.record(z.string(), z.string()).nullable(),
  enforce: z.boolean(),
  /** Marks conversion-style events (purchases, form conversions) for the goal view. */
  goal: z.boolean(),
  firstSeenAt: Timestamp,
  lastSeenAt: Timestamp,
});
export const EventDefinitionList = z.object({ items: z.array(EventDefinitionRecord) });
export const EventPropertyType = z.enum(['string', 'number', 'boolean', 'object', 'array']);
export const EventDefinitionName = z.object({ name: z.string().min(1).max(128) });
export const EventPropertyParams = EventDefinitionName.extend({ prop: z.string().min(1).max(128) });
export const CreateEventDefinition = z.object({ name: z.string().trim().min(1).max(128), schema: z.record(z.string().max(128), EventPropertyType).optional() });
export const SetEventProperty = z.object({ type: EventPropertyType });
export const UpdateEventDefinition = z.object({
  schema: z.record(z.string().max(128), z.enum(['string', 'number', 'boolean', 'object', 'array'])).nullable().optional(),
  enforce: z.boolean().optional(),
  goal: z.boolean().optional(),
});

/** Segment/RudderStack-compatible single-call payload (`/ingest/v1/segment`). */
export const SegmentCall = z.object({
  type: z.enum(['track', 'identify', 'page', 'screen']),
  event: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
  userId: z.string().max(256).nullish(),
  anonymousId: z.string().max(128).nullish(),
  messageId: z.string().max(256).optional(),
  timestamp: z.string().optional(),
  properties: z.record(z.string().max(128), z.unknown()).optional(),
  traits: z.record(z.string().max(128), z.unknown()).optional(),
  context: z.object({ traits: z.record(z.string(), z.unknown()).optional(), userAgent: z.string().optional(), ip: z.string().optional(), page: z.record(z.string(), z.unknown()).optional() }).loose().optional(),
  consent: BatchConsent.optional(),
});
export type SegmentCall = z.infer<typeof SegmentCall>;

export const CreateSiteConfig = z.object({
  siteKeyId: z.string().min(1),
  consentMode: z.enum(['open', 'require_consent']).default('open'),
  botFilter: z.boolean().default(true),
  domains: z.array(z.string()).default([]),
  trustBrowserRevenue: z.boolean().default(false),
  retentionDays: z.number().int().positive().optional(),
});
export type CreateSiteConfig = z.input<typeof CreateSiteConfig>;
