import { z } from 'zod';
import { Id, Timestamp } from './common.ts';

export const Role = z.enum(['owner', 'admin', 'marketer', 'sales', 'analyst', 'viewer']);
export const ApiKeyKind = z.enum(['secret', 'site']);
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const SignupBody = z.object({
  email: z.email().max(254),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(120),
  workspaceName: z.string().min(1).max(120),
  timezone: z.string().max(64).optional(),
});
export const AuthForgotBody = z.object({ email: z.email().max(254) });
export const AuthResetBody = z.object({ token: z.string().min(10).max(200), password: SignupBody.shape.password });
export const AuthChangePasswordBody = z.object({ current: z.string().min(1).max(200), password: SignupBody.shape.password });
export const MemberListsBody = z.object({ listIds: z.array(z.uuid()).max(500).nullable() });
export const SignupDomainRulesDto = z.object({ allow: z.array(z.string().max(255)).max(500), block: z.array(z.string().max(255)).max(500) });
export const LoginBody = z.object({ email: z.email().max(254), password: z.string().min(1).max(200), totp: z.string().max(32).optional() });
export const TotpCodeBody = z.object({ code: z.string().min(6).max(32) });

export const UserDto = z.object({ id: Id, email: z.string(), name: z.string(), mfaEnabled: z.boolean(), avatarUrl: z.string().nullable().optional() });
export const MeProfileBody = z.object({ name: z.string().trim().min(1).max(120).optional(), avatarUrl: z.url({ protocol: /^https$/ }).max(500).nullable().optional() });
export const WorkspaceDto = z.object({
  id: Id,
  organizationId: Id,
  name: z.string(),
  timezone: z.string(),
  locale: z.string(),
  postalAddress: z.string().nullable(),
  adminEmail: z.string().nullable(),
  unsubscribeRedirectUrl: z.string().nullable(),
  quietHours: z.object({ start: Hhmm, end: Hhmm }),
  displayCurrency: z.string(),
  fxRates: z.record(z.string(), z.number()),
  sessionDays: z.number().int().nullable(),
  campaignNotifyEmails: z.array(z.string()),
});
export const Currency = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as USD');
export const WorkspacePatch = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().max(64).optional(),
  locale: z.string().min(2).max(16).optional(),
  postalAddress: z.string().max(500).nullable().optional(),
  adminEmail: z.email().nullable().optional(),
  unsubscribeRedirectUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  quietHours: z.object({ start: Hhmm, end: Hhmm }).optional(),
  displayCurrency: Currency.optional(),
  fxRates: z.record(Currency, z.number().positive().max(1_000_000)).optional(),
  sessionDays: z.number().int().min(1).max(365).nullable().optional(),
  campaignNotifyEmails: z.array(z.email()).max(10).optional(),
});

export const AuthResult = z.object({ user: UserDto, workspace: WorkspaceDto.nullable(), mfaRequired: z.boolean(), expiresAt: Timestamp.nullable() });
export const MeResult = z.object({
  actor: z.object({ type: z.string(), id: z.string(), workspaceId: Id, role: Role.optional(), scopes: z.array(z.string()) }),
  user: UserDto.nullable(),
  workspaces: z.array(z.object({ id: Id, name: z.string(), role: Role })),
  /** Set while an owner is viewing the app as this user. */
  impersonatedBy: z.object({ id: Id, name: z.string() }).nullable().optional(),
});
export const SessionDto = z.object({ id: Id, ip: z.string().nullable(), userAgent: z.string().nullable(), createdAt: Timestamp, expiresAt: Timestamp });

export const ApiKeyCreate = z.object({
  name: z.string().min(1).max(120),
  kind: ApiKeyKind,
  scopes: z.array(z.string().max(64)).max(64).default([]),
  allowedOrigins: z.array(z.string().max(255)).max(50).optional(),
  /** Secret keys: restrict sends to these from-domains / connection ids. Empty = unrestricted. */
  allowedDomains: z.array(z.string().max(255)).max(50).optional(),
  allowedConnectionIds: z.array(z.uuid()).max(50).optional(),
  /** Secret keys: limit the outbound API to these campaigns (sequences). Empty = every campaign. */
  allowedSequenceIds: z.array(z.uuid()).max(50).optional(),
  /** Optional cap on requests per minute for this key; over it the API answers 429. */
  rateLimitPerMin: z.number().int().min(1).max(100_000).optional(),
});
export const ApiKeyDto = z.object({
  id: Id,
  name: z.string(),
  kind: ApiKeyKind,
  prefix: z.string(),
  scopes: z.array(z.string()),
  allowedOrigins: z.array(z.string()),
  allowedDomains: z.array(z.string()).optional(),
  allowedConnectionIds: z.array(z.string()).optional(),
  allowedSequenceIds: z.array(z.string()).optional(),
  rateLimitPerMin: z.number().int().nullable().optional(),
  lastUsedAt: Timestamp.nullable(),
  revokedAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export const ApiKeyCreated = ApiKeyDto.extend({ plaintext: z.string() });

export const MemberDto = z.object({ userId: Id, email: z.string(), name: z.string(), role: Role, listIds: z.array(z.string()).nullable().optional() });
export const InviteBody = z.object({ email: z.email().max(254), role: Role });
export const InvitationResult = z.object({ id: Id, email: z.string(), role: Role, token: z.string(), expiresAt: Timestamp, emailed: z.boolean().optional() });
export const RoleBody = z.object({ role: Role });
export const AcceptInvitationBody = z.object({ token: z.string().min(10).max(200) });

export const AuditDto = z.object({
  id: Id,
  actorType: z.string(),
  actorId: z.string(),
  impersonatedBy: z.string().nullable().optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  at: Timestamp,
});

export const AuditFilter = z.object({ action: z.string().optional(), targetType: z.string().optional(), from: Timestamp.optional(), to: Timestamp.optional() });
export const AuditExportQuery = AuditFilter.extend({ format: z.enum(['csv', 'ndjson']).default('csv'), order: z.enum(['asc', 'desc']).default('desc') });
export const AuditExport = z.object({ filename: z.string(), format: z.enum(['csv', 'ndjson']), rowCount: z.number().int(), truncated: z.boolean(), content: z.string() });
