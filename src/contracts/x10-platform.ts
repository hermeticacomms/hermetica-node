import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';
import { NoteDto } from './identity.ts';
import { LeadCriteria } from './leads.ts';
import { ClientQuotaBody } from './platform-admin.ts';
import { SequenceSettings } from './outbound.ts';

// ---- agency client groups + bulk operations ---------------------------------------------------------------------
export const X10ClientGroupDto = z.object({ id: Id, name: z.string(), workspaceIds: z.array(Id), createdAt: Timestamp });
export const X10ClientGroupBody = z.object({ name: z.string().trim().min(1).max(120), workspaceIds: z.array(Id).max(500).default([]) });
export const X10ClientGroupPatch = z.object({ name: z.string().trim().min(1).max(120).optional(), workspaceIds: z.array(Id).max(500).optional() });
export const X10GroupParams = z.object({ groupId: Id });
export const X10GroupUnlinkBody = z.object({ workspaceIds: z.array(Id).min(1).max(500) });
export const X10BulkQuotaBody = ClientQuotaBody.extend({ workspaceIds: z.array(Id).max(500).optional(), groupId: Id.optional() });
export const X10BulkQuotaResult = z.object({ updated: z.number().int(), workspaceIds: z.array(Id) });

// ---- permission matrix --------------------------------------------------------------------------------------------
export const X10MatrixCell = z.object({ read: z.boolean(), write: z.boolean() });
export const X10Matrix = z.record(z.string(), X10MatrixCell);
export const X10MatrixBody = z.object({ matrix: X10Matrix });
export const X10MatrixDto = z.object({
  modules: z.array(z.string()),
  baseRoles: z.record(z.string(), X10Matrix),
  roles: z.array(z.object({ id: Id, name: z.string(), baseRole: z.string(), matrix: X10Matrix })),
});

export const X10EmailParams = z.object({ email: z.string().min(3).max(320) });
export const X10MemberPermissions = z.object({ userId: Id, email: z.string(), name: z.string(), role: z.string(), modules: z.array(z.string()), matrix: X10Matrix });

// ---- generic job lookup -------------------------------------------------------------------------------------------
export const X10JobKind = z.enum(['bulk', 'export', 'import', 'catalog_bulk', 'lead', 'ai', 'account_export', 'estimate']);
export const X10JobDto = z.object({
  id: Id, kind: X10JobKind, status: z.string(), total: z.number().int().nullable(), processed: z.number().int().nullable(), error: z.string().nullable(),
  createdAt: Timestamp, detailPath: z.string(),
});

// ---- budgets ------------------------------------------------------------------------------------------------------
// Patch schemas are built from default-free fields: a zod default inside .partial() would silently reset omitted fields.
const BudgetFields = z.object({
  name: z.string().trim().min(1).max(200), campaignRef: z.string().max(100).nullable().optional(), currency: z.string().length(3).toUpperCase(),
  amountMinor: z.number().int().nonnegative(), startsOn: z.iso.date().nullable().optional(), endsOn: z.iso.date().nullable().optional(), notes: z.string().max(2000).nullable().optional(),
});
export const X10BudgetBody = BudgetFields.extend({ currency: BudgetFields.shape.currency.default('USD') });
export const X10BudgetPatch = BudgetFields.partial();
export const X10BudgetDto = z.object({
  id: Id, name: z.string(), campaignRef: z.string().nullable(), currency: z.string(), amountMinor: z.number().int(), startsOn: z.string().nullable(), endsOn: z.string().nullable(),
  notes: z.string().nullable(), spentMinor: z.number().int(), remainingMinor: z.number().int(), overBudget: z.boolean(), createdAt: Timestamp,
});
export const X10BudgetQuery = z.object({ campaignRef: z.string().max(100).optional() });
export const X10SpendBody = z.object({ amountMinor: z.number().int(), spentOn: z.iso.date(), description: z.string().max(500).nullable().optional(), idempotencyKey: z.string().min(1).max(200) });
export const X10SpendDto = z.object({ id: Id, budgetId: Id, amountMinor: z.number().int(), spentOn: z.string(), description: z.string().nullable(), createdAt: Timestamp });
export const X10SpendParams = z.object({ id: Id, spendId: Id });

// ---- company notes, lists, merge, sourcing -----------------------------------------------------------------------
export const X10NoteBody = z.object({ body: z.string().trim().min(1).max(5000) });
export const X10NoteDto = z.object({ id: Id, companyId: Id, body: z.string(), authorId: z.string(), createdAt: Timestamp });
/** `/v1/notes/:id`: a contact note or a company note, told apart by `resource`. */
export const NoteByIdDto = z.discriminatedUnion('resource', [NoteDto.extend({ resource: z.literal('contact') }), X10NoteDto.extend({ resource: z.literal('company') })]);
export const X10AllNotesQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: Id.optional() });
export const X10AllNotesDto = z.object({ items: z.array(z.object({ id: Id, resource: z.enum(['contact', 'company']), resourceId: Id, body: z.string(), authorId: z.string(), at: Timestamp })), nextBefore: Id.nullable() });
export const X10NoteParams = z.object({ id: Id, noteId: Id });
export const X10CompanyListBody = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(1000).nullable().optional() });
export const X10CompanyListDto = z.object({ id: Id, name: z.string(), description: z.string().nullable(), companyCount: z.number().int(), createdAt: Timestamp });
export const X10CompanyIdsBody = z.object({ companyIds: z.array(Id).min(1).max(1000) });
export const X10MergeCompaniesBody = z.object({ mergeIds: z.array(Id).min(1).max(50) });
export const X10CompanyStageBody = z.object({
  stage: z.enum(['new', 'engaged', 'opportunity', 'customer', 'not_a_fit', 'do_not_contact']).optional(), ownerUserId: Id.nullable().optional(),
});
export const X10SourceContactsBody = z.object({
  providerId: Id, titles: z.array(z.string().max(100)).max(20).default([]), seniorities: z.array(z.string().max(50)).max(10).default([]), limit: z.number().int().min(1).max(50).default(10),
  /** With no titles given, ask the AI assistant for the buyer titles of this account. */
  offer: z.string().max(500).optional(),
});
export const X10UnifyResult = z.object({ linked: z.number().int(), created: z.number().int() });
export const X10SavedSearchPatch = z.object({
  name: z.string().trim().min(1).max(200).optional(), criteria: LeadCriteria.optional(),
  runEvery: z.enum(['daily', 'weekly']).nullable().optional(), autoEnrich: z.boolean().optional(), maxResults: z.number().int().min(1).max(100).optional(),
});

// ---- marketing events / webinars ----------------------------------------------------------------------------------
const EventKind = z.enum(['webinar', 'event', 'conference', 'workshop']);
const EventStatus = z.enum(['scheduled', 'live', 'completed', 'cancelled']);
const EventFields = z.object({
  name: z.string().trim().min(1).max(200), kind: EventKind, startsAt: Timestamp.nullable().optional(), endsAt: Timestamp.nullable().optional(),
  url: z.url().max(2000).nullable().optional(), organizer: z.string().max(200).nullable().optional(), capacity: z.number().int().positive().nullable().optional(),
  status: EventStatus, externalRef: z.string().max(200).nullable().optional(),
});
export const X10EventBody = EventFields.extend({ kind: EventKind.default('webinar'), status: EventStatus.default('scheduled') });
export const X10EventPatch = EventFields.partial();
export const X10EventDto = z.object({
  id: Id, name: z.string(), kind: EventKind, startsAt: Timestamp.nullable(), endsAt: Timestamp.nullable(), url: z.string().nullable(), organizer: z.string().nullable(),
  capacity: z.number().int().nullable(), status: EventStatus, externalRef: z.string().nullable(), registered: z.number().int().default(0), attended: z.number().int().default(0), createdAt: Timestamp,
});
export const X10EventQuery = PageQuery.extend({ status: EventStatus.optional() });
export const X10EventPage = pageResult(X10EventDto);
export const X10RegisterBody = z.object({ emails: z.array(z.string().max(320)).min(1).max(1000) });
export const X10RegisterResult = z.object({ registered: z.number().int(), skipped: z.array(z.object({ email: z.string(), reason: z.string() })) });
export const X10AttendanceBody = z.object({ rows: z.array(z.object({ email: z.string().max(320), durationSec: z.number().int().nonnegative().optional() })).min(1).max(5000), markNoShows: z.boolean().default(false) });
export const X10AttendanceResult = z.object({ attended: z.number().int(), noShows: z.number().int() });
export const X10RegistrationDto = z.object({
  id: Id, eventId: Id, email: z.string(), profileId: Id.nullable(), status: z.enum(['registered', 'attended', 'no_show', 'cancelled']), attendedAt: Timestamp.nullable(), durationSec: z.number().int().nullable(), createdAt: Timestamp,
});
export const X10RegistrationQuery = PageQuery.extend({ status: z.enum(['registered', 'attended', 'no_show', 'cancelled']).optional() });
export const X10RegistrationPage = pageResult(X10RegistrationDto);
export const X10CancelRegistrationBody = z.object({ email: z.string().max(320) });

// ---- AI: bulk jobs, sequence drafting, prompt templates ----------------------------------------------------------
const AiRow = z.object({
  key: z.string().min(1).max(200),
  prospect: z.object({ firstName: z.string().max(100).optional(), company: z.string().max(200).optional(), title: z.string().max(200).optional() }).default({}),
  research: z.string().max(4000).default(''),
  fields: z.record(z.string().max(100), z.string().max(1000)).optional(),
});
export const X10AiFirstLinesBody = z.object({ rows: z.array(AiRow).min(1).max(500), offer: z.string().max(500).optional() });
export const X10AiCustomBody = z.object({ rows: z.array(AiRow).min(1).max(500), prompt: z.string().trim().min(1).max(2000) });
export const X10AiJobDto = z.object({
  id: Id, kind: z.enum(['first_line', 'custom']), status: z.enum(['queued', 'running', 'done', 'failed']), total: z.number().int(), processed: z.number().int(),
  results: z.array(z.object({ key: z.string(), text: z.string().nullable(), error: z.string().optional() })), model: z.string().nullable(), error: z.string().nullable(), createdAt: Timestamp,
});
export const X10AiJobPage = pageResult(X10AiJobDto);
export const X10SequenceDraftBody = z.object({
  brief: z.string().trim().min(1).max(3000), steps: z.number().int().min(1).max(8).default(4), audience: z.string().max(300).optional(), tone: z.string().max(60).optional(),
  name: z.string().trim().min(1).max(200).optional(),
});
export const X10SequenceDraftResult = z.object({
  name: z.string(), settings: SequenceSettings, templates: z.array(z.object({ id: Id, subject: z.string() })), draft: z.literal(true), model: z.string(),
});
export const X10PromptTemplateBody = z.object({ name: z.string().trim().min(1).max(200), prompt: z.string().trim().min(1).max(4000), resourceRef: z.string().max(100).nullable().optional() });
export const X10PromptTemplateDto = z.object({ id: Id, name: z.string(), prompt: z.string(), resourceRef: z.string().nullable(), createdAt: Timestamp });
export const X10PromptTemplateQuery = z.object({ resourceRef: z.string().max(100).optional() });

// ---- user groups, invitations, ownership --------------------------------------------------------------------------
export const X10UserGroupBody = z.object({ name: z.string().trim().min(1).max(120), customRoleId: Id, userIds: z.array(Id).max(1000).default([]) });
export const X10UserGroupPatch = z.object({ name: z.string().trim().min(1).max(120).optional(), customRoleId: Id.optional(), userIds: z.array(Id).max(1000).optional() });
export const X10UserGroupDto = z.object({ id: Id, name: z.string(), customRoleId: Id, userIds: z.array(Id), createdAt: Timestamp });
export const X10InvitationDto = z.object({ id: Id, email: z.string(), role: z.string(), expiresAt: Timestamp, createdAt: Timestamp });
export const X10TransferOwnerBody = z.object({ userId: Id });

export const X10SpendPatch = X10SpendBody.omit({ idempotencyKey: true }).partial();
