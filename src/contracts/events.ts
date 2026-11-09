import { z } from 'zod';
import { AppSlug, Id, PageQuery, Timestamp, pageResult } from './common.ts';

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
const EventLocation = z.object({
  city: z.string().max(128).optional(), region: z.string().max(128).optional(), country: z.string().max(64).optional(), zip: z.string().max(32).optional(),
  address1: z.string().max(256).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), timezone: z.string().max(64).optional(),
});
/** The event's person: identifiers plus profile data written inline (names, location, custom properties). */
export const EventProfileData = EventProfile.extend({
  firstName: z.string().max(128).optional(), lastName: z.string().max(128).optional(), locale: z.string().max(32).optional(),
  location: EventLocation.optional(),
  /** Custom profile properties, stored as profile attributes. */
  attributes: z.record(z.string().max(128), z.unknown()).optional(),
});

export const IngestEvent = z.object({
  name: EventName,
  /** Optional product dimension: journey event triggers and segment event conditions can require it. */
  app: AppSlug.optional(),
  occurredAt: Timestamp.optional(),
  properties: z.record(z.string().max(128), z.unknown()).optional(),
  /** Minor currency units (cents). */
  value: z.number().int().nonnegative().optional(),
  /** Decimal value in major units (9.99), the alternative to `value`; stored in the currency's minor units. */
  amount: z.number().nonnegative().max(1e12).optional(),
  currency: z.string().length(3).optional(),
  dedupeKey: z.string().min(1).max(256).optional(),
  profile: EventProfileData.optional(),
  /** Match the person on this key instead: email, phone, externalId, or a custom field declared unique. */
  correlationKey: z.string().min(1).max(64).optional(),
  correlationValue: z.union([z.string().min(1).max(256), z.number()]).optional(),
  anonymousId: z.string().min(1).max(128).optional(),
  context: EventContext.optional(),
});
export type IngestEvent = z.infer<typeof IngestEvent>;
export const IngestEventChecked = IngestEvent
  .refine((e) => e.value === undefined || e.amount === undefined, { message: 'Send value (cents) or amount (decimal), not both', path: ['amount'] })
  .refine((e) => (e.correlationKey === undefined) === (e.correlationValue === undefined), { message: 'correlationKey and correlationValue go together', path: ['correlationKey'] });

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
  /** Signed identify: hex HMAC-SHA256 of the identity (externalId, else email, else phone) with the site's identity secret, made on your server. */
  signature: z.string().regex(/^[0-9a-f]{64}$/).optional(),
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
  /** With `include=metric`: the event's definition. */
  metric: z.object({ name: z.string(), category: z.string(), goal: z.boolean() }).nullable().optional(),
  /** With `include=profile`: who did it. */
  profile: z.object({ id: Id, email: z.string().nullable(), firstName: z.string().nullable(), lastName: z.string().nullable() }).nullable().optional(),
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

export const SdkConsentMode = z.enum(['require-consent', 'opt-out', 'none']);
const CountryCode = z.string().regex(/^[A-Z]{2}$/, 'Two-letter country codes, for example FR');
/**
 * Per-site browser SDK settings, served to the snippet by GET /ingest/v1/config (`remoteConfig: true`). Options passed in code still
 * win. Defaults are the SDK's own defaults; consent mode, region rules and identify rules are also enforced at ingest.
 */
export const SiteSdkSettings = z.object({
  consentMode: SdkConsentMode.default('require-consent'),
  /** First matching rule wins for a visitor from one of these countries (CDN country header); others use `consentMode`. */
  regions: z.array(z.object({ countries: z.array(CountryCode).min(1).max(60), consentMode: SdkConsentMode })).max(20).default([]),
  /** require-consent only: keep up to 50 pre-decision events in memory and send them once analytics is granted. */
  bufferUntilConsent: z.boolean().default(false),
  autoPageViews: z.boolean().default(true),
  /** Automatic page views only on these paths: `/shop` (the page and below) or `/blog/*` (prefix). Empty = every page. */
  pageViewRoutes: z.array(z.string().regex(/^\/[^\s?#]*$/, 'A path starting with /').max(200)).max(50).default([]),
  stripQuery: z.boolean().default(false),
  /** Query parameters kept in page URLs and referrers; every other one is dropped. Empty = keep all (unless stripQuery). */
  allowParams: z.array(z.string().regex(/^[\w.[\]-]{1,64}$/)).max(50).default([]),
  /** Which identifiers a browser identify may carry. A disallowed one is dropped by the SDK and refused by the server. */
  identify: z.object({ email: z.boolean().default(true), phone: z.boolean().default(true), externalId: z.boolean().default(true) }).default({ email: true, phone: true, externalId: true }),
  /** Signed identify: browser identify needs a `signature` from your server (POST /v1/sites/:id/identity-secret), and browser events carry no profile. */
  requireSignedIdentify: z.boolean().default(false),
  batchSize: z.number().int().min(1).max(50).default(20),
  flushMs: z.number().int().min(250).max(60_000).default(2000),
  maxQueue: z.number().int().min(10).max(1000).default(200),
  autocapture: z.boolean().default(false),
  trackVideo: z.boolean().default(false),
});
export type SiteSdkSettings = z.infer<typeof SiteSdkSettings>;
/** GET/PUT /v1/sites/:id/settings: the SDK settings plus the server-side ingest switches of the site. */
export const SiteSettingsDto = SiteSdkSettings.extend({ botFilter: z.boolean(), trustBrowserRevenue: z.boolean(), identitySecretSet: z.boolean() });
export const SiteSettingsBody = SiteSdkSettings.extend({ botFilter: z.boolean().default(true), trustBrowserRevenue: z.boolean().default(false) });
/** GET /ingest/v1/config: what the snippet applies; `consentMode` is already resolved for the visitor's region. */
export const SdkRemoteConfig = SiteSdkSettings.omit({ regions: true });
/** The identity secret, shown once; signing identities with it is done on the site's server, never in the browser. */
export const SiteIdentitySecret = z.object({ secret: z.string(), createdAt: z.string() });
/** POST /ingest/v1/test: each event checked as the batch endpoint would, nothing stored. */
export const IngestTestResult = z.object({
  consent: z.object({ ok: z.boolean(), reason: z.string().optional(), consentMode: SdkConsentMode }),
  items: z.array(z.object({ index: z.number().int(), name: z.string().nullable(), ok: z.boolean(), issues: z.array(z.string()) })),
});

/** Workspace-wide ingest settings: the server ingest switch and the custom field used as each person's primary key. */
export const EventSettingsDto = z.object({
  serverIngestEnabled: z.boolean(),
  /** A custom field declared unique; an event whose profile carries it in `attributes` is matched on it. */
  primaryKeyAttribute: z.string().nullable(),
});
export const UpdateEventSettingsBody = z.object({
  serverIngestEnabled: z.boolean().optional(),
  primaryKeyAttribute: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).nullable().optional(),
});
