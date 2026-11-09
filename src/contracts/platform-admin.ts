import { z } from 'zod';
import { Id, Timestamp } from './common.ts';

// ---- webhook topic catalog ----
export const WebhookTopicDto = z.object({
  topic: z.string(),
  category: z.string(),
  description: z.string(),
  /** JSON Schema of `data` in the delivery envelope, derived from the example. */
  schema: z.record(z.string(), z.unknown()),
  example: z.record(z.string(), z.unknown()),
});
export const WebhookTopicsResult = z.object({ items: z.array(WebhookTopicDto) });
export const WebhookTopicParams = z.object({ topic: z.string().min(1).max(100) });
export const TestFireTopicBody = z.object({ topic: z.string().min(1).max(100) });

// ---- billing usage history ----
export const UsagePeriodDto = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  sends_email: z.number().int(),
  sends_sms: z.number().int(),
  sends_whatsapp: z.number().int(),
  sends_push: z.number().int(),
  sends_postcard: z.number().int(),
  ai_tokens: z.number().int(),
});
export const UsageHistoryQuery = z.object({ months: z.coerce.number().int().min(1).max(36).default(12) });
export const UsagePeriodParams = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-11') });
export const InvoiceDto = z.object({
  id: z.string(), number: z.string().nullable(), status: z.string(), currency: z.string(), amountDueMinor: z.number().int(), amountPaidMinor: z.number().int(),
  createdAt: Timestamp, hostedUrl: z.string().nullable(), pdfUrl: z.string().nullable(),
});

// ---- account export ----
export const AccountExportDto = z.object({
  id: Id, status: z.enum(['queued', 'running', 'completed', 'failed']), error: z.string().nullable(), sizeBytes: z.number().int().nullable(),
  datasets: z.record(z.string(), z.number().int()), createdAt: Timestamp, finishedAt: Timestamp.nullable(),
  /** Authenticated GET that streams the zip; null until completed. */
  downloadPath: z.string().nullable(),
  /** What was asked for: dataset names (absent = all) and the since-date. */
  options: z.object({ datasets: z.array(z.string()).optional(), since: z.string().optional() }).optional(),
});

// ---- OAuth 2.0 (authorization code + PKCE S256) ----
const RedirectUris = z.array(z.url().max(2048)).min(1).max(10);
export const OAuthClientBody = z.object({ name: z.string().trim().min(1).max(100), redirectUris: RedirectUris, scopes: z.array(z.string().min(1).max(60)).min(1).max(60), /** SPA/CLI client: no secret, PKCE only. */ public: z.boolean().default(false) });
export const OAuthClientDto = z.object({
  id: Id, clientId: z.string(), name: z.string(), redirectUris: z.array(z.string()), scopes: z.array(z.string()), isPublic: z.boolean(), revokedAt: Timestamp.nullable(), createdAt: Timestamp,
});
export const OAuthClientCreated = OAuthClientDto.extend({ clientSecret: z.string() });
export const OAuthAuthorizeParams = z.object({
  client_id: z.string().min(1).max(100), redirect_uri: z.url().max(2048), scope: z.string().max(1000).default(''), state: z.string().max(500).optional(),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/), code_challenge_method: z.literal('S256'),
});
export const OAuthAuthorizePreview = z.object({ clientName: z.string(), clientId: z.string(), scopes: z.array(z.string()), redirectUri: z.string() });
export const OAuthAuthorizeResult = z.object({ redirectUrl: z.string() });
// Form-encoded or JSON; RFC 6749 snake_case names.
export const OAuthTokenBody = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  client_id: z.string().min(1).max(100),
  client_secret: z.string().max(200).optional(),
  code: z.string().max(200).optional(),
  redirect_uri: z.string().max(2048).optional(),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).optional(),
  refresh_token: z.string().max(200).optional(),
});
export const OAuthTokenResult = z.object({
  access_token: z.string(), token_type: z.literal('Bearer'), expires_in: z.number().int(), refresh_token: z.string(), scope: z.string(),
});
export const OAuthRevokeBody = z.object({ token: z.string().min(1).max(200), client_id: z.string().min(1).max(100), client_secret: z.string().max(200).optional() });
export const AuthorizedAppDto = z.object({
  clientId: z.string(), name: z.string(), scopes: z.array(z.string()), grantedBy: Id, grantedAt: Timestamp, lastUsedAt: Timestamp.nullable(),
});
export const AuthorizedAppParams = z.object({ clientId: z.string().min(1).max(100) });

// ---- agency workspace lifecycle ----
export const ClientLifecycleBody = z.object({ reason: z.string().trim().max(300).optional() });
export const DeleteClientBody = z.object({ graceDays: z.number().int().min(1).max(90).default(30) });
/** null = no per-client cap beyond the plan. */
export const ClientModulesBody = z.object({ disabled: z.array(z.string().max(40)).max(20) });
export const ClientModulesDto = z.object({ modules: z.array(z.object({ key: z.string(), label: z.string() })), disabled: z.array(z.string()) });
export const ClientQuotaBody = z.object({ sendsEmail: z.number().int().nonnegative().nullable(), sendsSms: z.number().int().nonnegative().nullable() });
export const ClientParams = z.object({ workspaceId: Id });
export const ClientInfoDto = z.object({
  id: Id, name: z.string(), status: z.enum(['active', 'paused', 'pending_deletion']), pausedAt: Timestamp.nullable(), pausedReason: z.string().nullable(), deleteAfter: Timestamp.nullable(),
  quota: ClientQuotaBody, usage: UsagePeriodDto,
  reputation: z.object({ sent30d: z.number().int(), bounceRate: z.number(), complaintRate: z.number(), rating: z.enum(['good', 'watch', 'poor', 'unknown']) }),
});

export type UsagePeriodDto = z.infer<typeof UsagePeriodDto>;
export type InvoiceDto = z.infer<typeof InvoiceDto>;
export type ClientQuota = z.infer<typeof ClientQuotaBody>;
export type WebhookTopicDto = z.infer<typeof WebhookTopicDto>;

export const ACCOUNT_EXPORT_DATASETS = ['profiles', 'segments', 'campaigns', 'templates', 'workflows', 'forms', 'suppressions', 'events', 'lists'] as const;
export const AccountExportBody = z.object({
  /** Empty or absent = every dataset. */
  datasets: z.array(z.enum(ACCOUNT_EXPORT_DATASETS)).max(20).optional(),
  /** Only rows created at or after this time. */
  since: Timestamp.optional(),
});
export const AccountExportListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.uuid().optional() });
