import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';

export const PushPlatform = z.enum(['ios', 'android', 'web']);
export type PushPlatform = z.infer<typeof PushPlatform>;
export const PushVendor = z.enum(['apns', 'fcm', 'expo', 'web_push']);
export type PushVendor = z.infer<typeof PushVendor>;
export const PushEnvironment = z.enum(['sandbox', 'production']);
export type PushEnvironment = z.infer<typeof PushEnvironment>;
export const PushEnablement = z.enum(['AUTHORIZED', 'DENIED', 'UNAUTHORIZED', 'PROVISIONAL', 'NOT_DETERMINED']);
export type PushEnablement = z.infer<typeof PushEnablement>;
export const PushBackground = z.enum(['AVAILABLE', 'DENIED', 'RESTRICTED']);
export type PushBackground = z.infer<typeof PushBackground>;

/** Klaviyo SDKs send these in either case ("APNS", "ios"); we store lower-case vendor/platform and upper-case statuses. */
const lower = <T extends z.ZodType>(e: T) => z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() : v), e);
const upper = <T extends z.ZodType>(e: T) => z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), e);
const str = (n = 200) => z.string().max(n).optional();
/** Klaviyo's SDKs (and ours) send device environment as debug/release; the API also takes sandbox/production. */
const DEVICE_ENV: Record<string, PushEnvironment> = { debug: 'sandbox', release: 'production' };
const deviceEnv = z.preprocess((v) => (typeof v === 'string' ? DEVICE_ENV[v.toLowerCase()] ?? v.toLowerCase() : v), PushEnvironment);

export const PushDeviceMetadata = z.looseObject({
  device_id: str(), klaviyo_sdk: str(), sdk_version: str(), device_model: str(), os_name: str(), os_version: str(),
  app_name: str(), app_version: str(), app_build: str(), app_id: str(), environment: deviceEnv.optional(),
});
export type PushDeviceMetadata = z.infer<typeof PushDeviceMetadata>;

/** Who the device belongs to; at least one key is needed. Several may be sent: they all resolve to one profile. */
export const PushProfileRef = z.object({
  data: z.object({
    type: z.literal('profile').optional(),
    attributes: z.object({
      email: z.string().max(320).optional(), phone_number: z.string().max(40).optional(), external_id: z.string().max(200).optional(), anonymous_id: z.string().max(200).optional(),
    }),
  }),
});

/** POST /client/push-tokens (Klaviyo's JSON:API shape). Web push: vendor web_push, token = the JSON-serialised PushSubscription. */
export const ClientPushTokenBody = z.object({
  data: z.object({
    type: z.literal('push-token').optional(),
    attributes: z.object({
      token: z.string().min(1).max(4096),
      platform: lower(PushPlatform),
      vendor: lower(PushVendor),
      enablement_status: upper(PushEnablement).default('AUTHORIZED'),
      background: upper(PushBackground).default('AVAILABLE'),
      device_metadata: PushDeviceMetadata.default({}),
      profile: PushProfileRef,
    }),
  }),
});
export type ClientPushTokenBody = z.infer<typeof ClientPushTokenBody>;

/** POST /client/push-token-unregister: same envelope, only token + vendor + profile matter. */
export const ClientPushUnregisterBody = z.object({
  data: z.object({
    type: z.enum(['push-token-unregister', 'push-token']).optional(), // older SDK builds sent push-token
    attributes: z.object({ token: z.string().min(1).max(4096), platform: lower(PushPlatform).optional(), vendor: lower(PushVendor), profile: PushProfileRef.optional() }),
  }),
});
export type ClientPushUnregisterBody = z.infer<typeof ClientPushUnregisterBody>;

export const ClientPushConfigQuery = z.object({ company_id: z.string().max(200).optional(), k: z.string().max(200).optional() });
export const PushConfigDto = z.object({ vapidPublicKey: z.string().nullable() });

export const PushTokenDto = z.object({
  id: Id, profileId: Id, token: z.string(), platform: PushPlatform, vendor: PushVendor, appId: z.string().nullable(), environment: PushEnvironment,
  enablementStatus: PushEnablement, background: PushBackground, deviceMetadata: z.record(z.string(), z.unknown()),
  lastSeenAt: Timestamp, invalidatedAt: Timestamp.nullable(), invalidReason: z.string().nullable(), createdAt: Timestamp,
});
export type PushTokenDto = z.infer<typeof PushTokenDto>;
export const PushTokenPage = pageResult(PushTokenDto);
export const PushTokenListQuery = PageQuery.extend({ profileId: Id.optional(), vendor: PushVendor.optional(), valid: z.enum(['true', 'false']).optional() });

/** Admin registration: the profile is named by id. */
export const PushTokenCreateBody = z.object({
  profileId: Id, token: z.string().min(1).max(4096), platform: PushPlatform, vendor: PushVendor, appId: z.string().max(200).optional(),
  environment: PushEnvironment.default('production'), enablementStatus: PushEnablement.default('AUTHORIZED'), background: PushBackground.default('AVAILABLE'),
  deviceMetadata: z.record(z.string(), z.unknown()).default({}),
});

const Str = z.string().max(500);
/** Overrides for one platform; anything unset falls back to the message. */
export const PushPlatformOverride = z.object({ title: Str.optional(), body: z.string().max(2000).optional(), imageUrl: z.url().optional(), url: z.string().max(2000).optional(), sound: z.string().max(100).optional(), badge: z.number().int().min(0).max(99999).optional() });

/** What a push carries beyond title (the template subject) and body (the template text). Strings are Liquid. */
export const PushExtras = z.object({
  imageUrl: z.string().max(2000).optional(),
  /** Deep link (myapp://...) or https URL opened when the notification is tapped. */
  url: z.string().max(2000).optional(),
  data: z.record(z.string().max(64), z.string().max(1000)).refine((m) => Object.keys(m).length <= 20, { message: 'At most 20 data keys' }).optional(),
  badge: z.number().int().min(0).max(99999).optional(),
  sound: z.string().max(100).optional(),
  ttlSeconds: z.number().int().min(0).max(28 * 86400).optional(),
  priority: z.enum(['high', 'normal']).optional(),
  collapseKey: z.string().max(64).optional(),
  ios: PushPlatformOverride.optional(),
  android: PushPlatformOverride.optional(),
  web: PushPlatformOverride.optional(),
});
export type PushExtras = z.infer<typeof PushExtras>;

export const PushStatsQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const PushStatsDto = z.object({
  sent: z.number().int(), delivered: z.number().int(), failed: z.number().int(), blocked: z.number().int(), opened: z.number().int(),
  invalidTokens: z.number().int(), blockReasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
  /** Reported by the mobile SDK (`$received_push` / `$converted_push`), counted once per message. */
  sdkDelivered: z.number().int().optional(), converted: z.number().int().optional(),
});
export type PushStatsDto = z.infer<typeof PushStatsDto>;

export const VapidKeysDto = z.object({ publicKey: z.string(), privateKey: z.string() });

/** A push campaign's content: title and body are the template's subject and text; the rest rides on the message. */
export const CampaignPushBody = z.object({ title: z.string().max(200), body: z.string().min(1).max(4000), extras: PushExtras.default({}) });
export const CampaignPushDto = z.object({ templateId: Id.nullable(), title: z.string(), body: z.string(), extras: PushExtras });

/** Who a push test goes to: a profile's registered devices, or one pasted token. */
export const PushTestTarget = z.object({
  profileId: Id.optional(),
  pushToken: z.object({ token: z.string().min(1).max(4096), vendor: PushVendor, platform: PushPlatform, appId: z.string().max(200).optional() }).optional(),
});
/** Flow step / template test: the saved push template plus the step's extras, through one connection. */
export const PushTestSendBody = PushTestTarget.extend({
  templateId: Id, push: PushExtras.optional(), connectionId: Id.optional(), purpose: z.enum(['marketing', 'transactional', 'operational']).default('marketing'),
}).refine((b) => b.profileId || b.pushToken, 'Choose a test profile or paste a device token');
