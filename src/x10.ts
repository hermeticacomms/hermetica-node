import type { z } from 'zod';
import type {
  X10AiJobDto, X10AiFirstLinesBody, X10AttendanceBody, X10AttendanceResult, X10BudgetBody, X10BudgetDto, X10BudgetPatch, X10BulkQuotaBody, X10BulkQuotaResult, X10ClientGroupBody,
  X10ClientGroupDto, X10CompanyListBody, X10CompanyListDto, X10EventBody, X10EventDto, X10EventPage, X10EventPatch, X10InvitationDto, X10JobDto, X10MatrixDto, X10NoteBody, X10NoteDto,
  X10RegisterResult, X10RegistrationPage, X10SequenceDraftBody, X10SequenceDraftResult, X10SpendBody, X10SpendDto, X10UnifyResult, X10UserGroupBody, X10UserGroupDto, ApiKeyCreate, ApiKeyCreated,
} from './contracts/index.ts';
import type { createTransport, Query, RequestOptions } from './http.ts';

type In<S extends z.ZodType> = z.input<S>;
type Out<S extends z.ZodType> = z.infer<S>;
const enc = encodeURIComponent;

/** Agency groups, permission matrix, jobs, budgets, marketing events, company notes/lists and AI bulk jobs. Mutations take `idempotencyKey` through the usual RequestOptions. */
export function x10Resources(http: ReturnType<typeof createTransport>) {
  const q = (v: unknown) => v as Query;
  return {
    agencyGroups: {
      list: () => http<Out<typeof X10ClientGroupDto>[]>('GET', '/v1/agency/groups'),
      create: (body: In<typeof X10ClientGroupBody>) => http<Out<typeof X10ClientGroupDto>>('POST', '/v1/agency/groups', { body }),
      update: (id: string, body: { name?: string; workspaceIds?: string[] }) => http<Out<typeof X10ClientGroupDto>>('PUT', `/v1/agency/groups/${enc(id)}`, { body }),
      unlink: (id: string, workspaceIds: string[]) => http<Out<typeof X10ClientGroupDto>>('POST', `/v1/agency/groups/${enc(id)}/unlink`, { body: { workspaceIds } }),
      remove: (id: string) => http<{ ok: true }>('DELETE', `/v1/agency/groups/${enc(id)}`),
      setQuota: (body: In<typeof X10BulkQuotaBody>) => http<Out<typeof X10BulkQuotaResult>>('PUT', '/v1/agency/quota', { body }),
      /** Mints a key inside a client workspace. Plaintext is returned once. */
      createClientApiKey: (workspaceId: string, body: In<typeof ApiKeyCreate>) => http<Out<typeof ApiKeyCreated>>('POST', `/v1/agency/clients/${enc(workspaceId)}/api-keys`, { body }),
    },
    permissions: {
      matrix: () => http<Out<typeof X10MatrixDto>>('GET', '/v1/roles/matrix'),
      setRoleMatrix: (roleId: string, matrix: Record<string, { read: boolean; write: boolean }>) => http<Out<typeof X10MatrixDto>['roles'][number]>('PUT', `/v1/roles/${enc(roleId)}/matrix`, { body: { matrix } }),
      userGroups: {
        list: () => http<{ items: Out<typeof X10UserGroupDto>[] }>('GET', '/v1/user-groups'),
        create: (body: In<typeof X10UserGroupBody>) => http<Out<typeof X10UserGroupDto>>('POST', '/v1/user-groups', { body }),
        remove: (id: string) => http<{ ok: true }>('DELETE', `/v1/user-groups/${enc(id)}`),
      },
      invitations: {
        list: () => http<{ items: Out<typeof X10InvitationDto>[] }>('GET', '/v1/invitations'),
        cancel: (id: string) => http<{ ok: true }>('DELETE', `/v1/invitations/${enc(id)}`),
      },
    },
    /** Any async job (bulk, export, import, catalog, lead, AI, account export, estimate) by id. */
    jobs: { get: (id: string) => http<Out<typeof X10JobDto>>('GET', `/v1/jobs/${enc(id)}`) },
    budgets: {
      list: (campaignRef?: string) => http<{ items: Out<typeof X10BudgetDto>[] }>('GET', '/v1/budgets', { query: q({ campaignRef }) }),
      get: (id: string) => http<Out<typeof X10BudgetDto>>('GET', `/v1/budgets/${enc(id)}`),
      create: (body: In<typeof X10BudgetBody>) => http<Out<typeof X10BudgetDto>>('POST', '/v1/budgets', { body }),
      update: (id: string, body: In<typeof X10BudgetPatch>) => http<Out<typeof X10BudgetDto>>('PATCH', `/v1/budgets/${enc(id)}`, { body }),
      spend: (id: string) => http<{ items: Out<typeof X10SpendDto>[] }>('GET', `/v1/budgets/${enc(id)}/spend`),
      addSpend: (id: string, body: In<typeof X10SpendBody>, o?: RequestOptions) => http<Out<typeof X10SpendDto>>('POST', `/v1/budgets/${enc(id)}/spend`, { body, ...o }),
    },
    marketingEvents: {
      list: (query: { limit?: number; cursor?: string; status?: string } = {}) => http<Out<typeof X10EventPage>>('GET', '/v1/marketing-events', { query: q(query) }),
      get: (id: string) => http<Out<typeof X10EventDto>>('GET', `/v1/marketing-events/${enc(id)}`),
      create: (body: In<typeof X10EventBody>) => http<Out<typeof X10EventDto>>('POST', '/v1/marketing-events', { body }),
      update: (id: string, body: In<typeof X10EventPatch>) => http<Out<typeof X10EventDto>>('PATCH', `/v1/marketing-events/${enc(id)}`, { body }),
      registrations: (id: string, query: { limit?: number; cursor?: string; status?: string } = {}) => http<Out<typeof X10RegistrationPage>>('GET', `/v1/marketing-events/${enc(id)}/registrations`, { query: q(query) }),
      register: (id: string, emails: string[]) => http<Out<typeof X10RegisterResult>>('POST', `/v1/marketing-events/${enc(id)}/registrations`, { body: { emails } }),
      attendance: (id: string, body: In<typeof X10AttendanceBody>) => http<Out<typeof X10AttendanceResult>>('POST', `/v1/marketing-events/${enc(id)}/attendance`, { body }),
    },
    companies: {
      notes: (id: string, query: { limit?: number; cursor?: string } = {}) => http<{ items: Out<typeof X10NoteDto>[]; nextCursor: string | null }>('GET', `/v1/leads/companies/${enc(id)}/notes`, { query: q(query) }),
      addNote: (id: string, body: In<typeof X10NoteBody>) => http<Out<typeof X10NoteDto>>('POST', `/v1/leads/companies/${enc(id)}/notes`, { body }),
      merge: (id: string, mergeIds: string[]) => http<unknown>('POST', `/v1/leads/companies/${enc(id)}/merge`, { body: { mergeIds } }),
      sourceContacts: (id: string, body: { providerId: string; titles?: string[]; seniorities?: string[]; limit?: number; offer?: string }) => http<unknown>('POST', `/v1/leads/companies/${enc(id)}/source-contacts`, { body }),
      unifyAccounts: () => http<Out<typeof X10UnifyResult>>('POST', '/v1/leads/companies/unify-accounts'),
      lists: {
        list: () => http<{ items: Out<typeof X10CompanyListDto>[] }>('GET', '/v1/leads/company-lists'),
        create: (body: In<typeof X10CompanyListBody>) => http<Out<typeof X10CompanyListDto>>('POST', '/v1/leads/company-lists', { body }),
        add: (id: string, companyIds: string[]) => http<{ added: number }>('POST', `/v1/leads/company-lists/${enc(id)}/companies`, { body: { companyIds } }),
      },
    },
    ai: {
      firstLines: (body: In<typeof X10AiFirstLinesBody>) => http<Out<typeof X10AiJobDto>>('POST', '/v1/ai/bulk/first-lines', { body }),
      job: (id: string) => http<Out<typeof X10AiJobDto>>('GET', `/v1/ai/jobs/${enc(id)}`),
      draftSequence: (body: In<typeof X10SequenceDraftBody>) => http<Out<typeof X10SequenceDraftResult>>('POST', '/v1/ai/sequence-draft', { body }),
    },
  };
}
