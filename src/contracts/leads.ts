import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';
import { EnrollProspectsResult, ProspectInput } from './outbound.ts';

export const FinderKind = z.enum(['apollo', 'hunter', 'pdl', 'dropcontact', 'findymail']);
export const VerifierKind = z.enum(['zerobounce', 'neverbounce', 'kickbox', 'millionverifier', 'smtp']);
export const PhoneProviderKind = z.enum(['twilio_lookup', 'telnyx_lookup']);
export const LeadProviderKind = z.enum([...FinderKind.options, ...VerifierKind.options, ...PhoneProviderKind.options]);
export type LeadProviderKind = z.infer<typeof LeadProviderKind>;

export const ConnectLeadProviderBody = z.object({
  kind: LeadProviderKind,
  name: z.string().trim().min(1).max(100),
  /** Not needed for the built-in `smtp` probe. */
  apiKey: z.string().min(1).max(500).optional(),
  priority: z.number().int().min(0).max(1000).default(100),
  creditLimit: z.number().int().min(0).nullish(),
});
export const LeadProviderDto = z.object({
  id: Id, kind: LeadProviderKind, role: z.enum(['finder', 'verifier', 'phone']), name: z.string(), priority: z.number().int(), enabled: z.boolean(),
  creditsUsed: z.number().int(), creditLimit: z.number().int().nullable(), createdAt: Timestamp,
  keyVerified: z.boolean().nullable().describe('true: the provider accepted the key at the last check (on connect or POST /v1/leads/providers/{id}/test). false: rejected, or not checked yet (keyCheckedAt null). null: no key (smtp)'),
  keyCheckedAt: Timestamp.nullable().optional(), keyError: z.string().nullable().optional(),
});
export const UpdateLeadProviderBody = z.object({ enabled: z.boolean().optional(), priority: z.number().int().min(0).max(1000).optional(), creditLimit: z.number().int().min(0).nullable().optional() });

export const LeadCriteria = z.object({
  titles: z.array(z.string().max(100)).max(20).default([]),
  seniorities: z.array(z.string().max(50)).max(10).default([]),
  industries: z.array(z.string().max(100)).max(20).default([]),
  companySizes: z.array(z.string().max(30)).max(10).default([]),
  locations: z.array(z.string().max(100)).max(20).default([]),
  technologies: z.array(z.string().max(100)).max(20).default([]),
  domains: z.array(z.string().max(253)).max(50).default([]),
});
export type LeadCriteria = z.infer<typeof LeadCriteria>;

export const LeadSearchBody = z.object({ providerId: Id, criteria: LeadCriteria, limit: z.number().int().min(1).max(100).default(25) });
export const SaveSearchBody = z.object({ name: z.string().trim().min(1).max(200), providerId: Id, criteria: LeadCriteria });
export const LeadSearchSchedule = z.enum(['daily', 'weekly']);
export const SavedSearchDto = z.object({
  id: Id, name: z.string(), providerId: Id, criteria: LeadCriteria, createdAt: Timestamp,
  runEvery: LeadSearchSchedule.nullable(), autoEnrich: z.boolean(), maxResults: z.number().int(),
  lastRunAt: Timestamp.nullable(), lastRunCount: z.number().int().nullable(), lastError: z.string().nullable(),
});

export const LeadStatus = z.enum(['preview', 'revealed', 'pushed']);
export const EmailStatus = z.enum(['valid', 'invalid', 'risky', 'catch_all', 'unknown', 'disposable']);
export type EmailStatus = z.infer<typeof EmailStatus>;
export const LeadDto = z.object({
  id: Id, providerKind: z.string(), firstName: z.string().nullable(), lastName: z.string().nullable(), title: z.string().nullable(), company: z.string().nullable(),
  domain: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), linkedinUrl: z.string().nullable(), country: z.string().nullable(),
  hasEmail: z.boolean(), emailStatus: EmailStatus.nullable(), status: LeadStatus, profileId: Id.nullable(),
  provenance: z.record(z.string(), z.object({ provider: z.string(), confidence: z.number().nullable(), at: z.string() })),
  createdAt: Timestamp,
});
export const LeadListQuery = PageQuery.extend({ status: LeadStatus.optional() });
export const LeadPage = pageResult(LeadDto);
export const LeadSearchResult = z.object({ items: z.array(LeadDto), cached: z.boolean() });

export const LeadIdsBody = z.object({ leadIds: z.array(Id).min(1).max(100) });
export const RevealResult = z.object({ items: z.array(LeadDto), creditsSpent: z.number().int(), errors: z.array(z.object({ leadId: Id, error: z.string() })) });

export const VerifyPolicy = z.object({
  skipInvalid: z.boolean().default(true),
  skipRisky: z.boolean().default(true),
  skipCatchAll: z.boolean().default(true),
  skipUnknown: z.boolean().default(false),
  skipRole: z.boolean().default(false),
});
export type VerifyPolicy = z.infer<typeof VerifyPolicy>;
export const DEFAULT_VERIFY_POLICY: VerifyPolicy = VerifyPolicy.parse({});

export const PushBody = z.object({
  leadIds: z.array(Id).min(1).max(100),
  sequenceId: Id.optional(),
  policy: VerifyPolicy.default(DEFAULT_VERIFY_POLICY),
});
export const CsvLeadImportBody = z.object({
  rows: z.array(ProspectInput).min(1).max(5000),
  sequenceId: Id.optional(),
  policy: VerifyPolicy.default(DEFAULT_VERIFY_POLICY),
});
export const PushResult = z.object({
  imported: z.number().int(),
  skipped: z.array(z.object({ ref: z.string(), reason: z.string() })),
  enroll: EnrollProspectsResult.nullable(),
});

export const VerificationDto = z.object({
  email: z.string(), status: EmailStatus, risk: z.number().int(), flags: z.array(z.string()), provider: z.string(), checkedAt: Timestamp,
});
export const VerifyBody = z.object({ email: z.string().max(320), force: z.boolean().default(false) });

export const LeadJobKind = z.enum(['clean', 'enrich']);
export const StartCleanBody = z.object({ emails: z.array(z.string().max(320)).min(1).max(10_000), maxBounceRate: z.number().min(0).max(1).default(0.05) });
export const StartEnrichBody = z.object({ leadIds: z.array(Id).min(1).max(500), waterfallId: Id.optional() });
export const CleanReportRow = z.object({ email: z.string(), status: EmailStatus, risk: z.number().int(), flags: z.array(z.string()) });
export const LeadJobDto = z.object({
  id: Id, kind: LeadJobKind, status: z.enum(['queued', 'running', 'done', 'failed']), total: z.number().int(), processed: z.number().int(),
  summary: z.record(z.string(), z.unknown()), error: z.string().nullable(), createdAt: Timestamp,
});
export const LeadJobReport = LeadJobDto.extend({ rows: z.array(CleanReportRow) });
export const LeadJobPage = pageResult(LeadJobDto);

export const CreditsDto = z.object({ providers: z.array(z.object({ id: Id, name: z.string(), kind: LeadProviderKind, used: z.number().int(), limit: z.number().int().nullable() })), totalUsed: z.number().int() });
export const DisposableBody = z.object({ domains: z.array(z.string().max(253)).min(1).max(100_000) });
export const DisposableResult = z.object({ added: z.number().int() });

// ---- companies (accounts) and phone line type
export const CompanyDto = z.object({
  id: Id, domain: z.string(), name: z.string(), industry: z.string().nullable(), sizeBand: z.string().nullable(), country: z.string().nullable(),
  suppressed: z.boolean(), suppressionReason: z.string().nullable(), leadCount: z.number().int(), contactCount: z.number().int(), createdAt: Timestamp,
  stage: z.string().optional(), ownerUserId: Id.nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(), score: z.number().int().optional(),
});
export const CompanyListQuery = PageQuery.extend({ q: z.string().max(100).optional(), suppressed: z.coerce.boolean().optional() });
export const CompanyPage = pageResult(CompanyDto);
export const CompanyLinkFields = z.object({ isPrimary: z.boolean(), jobTitle: z.string().nullable(), role: z.string().nullable() });
/** Every company the contact is linked to, primary first; `link` carries the link fields. */
export const M3ProfileCompanies = z.object({ items: z.array(CompanyDto.extend({ link: CompanyLinkFields.optional() })) });
export const CompanyDetail = CompanyDto.extend({ leads: z.array(LeadDto), profileIds: z.array(Id), contacts: z.array(CompanyLinkFields.extend({ profileId: Id })).optional() });
export const CreateCompanyBody = z.object({
  domain: z.string().trim().min(3).max(253), name: z.string().trim().min(1).max(200).optional(), industry: z.string().max(100).optional(),
  sizeBand: z.string().max(30).optional(), country: z.string().length(2).optional(),
  /** Values for the workspace's company fields (`GET /v1/leads/company-fields`); validated against that registry. */
  customFields: z.record(z.string().max(64), z.unknown()).optional(),
});
export const ImportCompaniesBody = z.object({ rows: z.array(CreateCompanyBody).min(1).max(1000) });
export const ImportCompaniesResult = z.object({ imported: z.number().int(), skipped: z.array(z.object({ row: z.number().int(), domain: z.string(), reason: z.string() })) });
export const UpdateCompanyBody = CreateCompanyBody.omit({ domain: true }).partial();
export const SuppressCompanyBody = z.object({ reason: z.string().trim().max(200).optional() });
export const LinkCompanyBody = z.object({
  profileId: Id,
  /** true: make this the contact's primary company; false: an extra link; omitted: primary only if the contact has none. */
  primary: z.boolean().optional(),
  jobTitle: z.string().trim().max(200).nullish(), role: z.string().trim().max(100).nullish(),
});

export const LineType = z.enum(['mobile', 'landline', 'voip', 'toll_free', 'other', 'unknown']);
export const PhoneLookupBody = z.object({ phone: z.string().max(40), country: z.string().length(2).optional(), force: z.boolean().default(false) });
export const PhoneLookupDto = z.object({ phone: z.string(), lineType: LineType, carrier: z.string().nullable(), landline: z.boolean(), provider: z.string(), checkedAt: Timestamp });
