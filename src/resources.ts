import type { z } from 'zod';
import type {
  BlocklistDto, BlocklistInput, CampaignDto, CampaignListQuery, CampaignPage, ConsentInputBody, ConsentOutcome, ConsentStateDto, CreateCampaignBody, CreateListBody,
  CreateTemplateBody, CreateWorkflowBody, ListDto, ListMembersBody, ListMembersResult, ListWithCount, ListTemplatesQuery, SuppressionDto, SuppressionInput,
  SuppressionListQuery, TemplateDto, TemplatePage, TemplateWithVersion, UpdateCampaignBody, UpdateListBody, UpdateTemplateBody, UpdateWorkflowBody,
  WorkflowDto, WorkflowListQuery, WorkflowPage, EnrollBody, EnrollResult,
} from './contracts/index.ts';
import type { createTransport, Query, RequestOptions } from './http.ts';

type In<S extends z.ZodType> = z.input<S>;
type Out<S extends z.ZodType> = z.infer<S>;
type Http = ReturnType<typeof createTransport>;
const enc = encodeURIComponent;

/** Typed methods for the remaining first-class resources. Same retry/idempotency behaviour as the rest of the client. */
export function resources(http: Http) {
  const q = (v: unknown) => v as Query;
  return {
    campaigns: {
      list: (query: In<typeof CampaignListQuery> = {}) => http<Out<typeof CampaignPage>>('GET', '/v1/campaigns', { query: q(query) }),
      get: (id: string) => http<Out<typeof CampaignDto>>('GET', `/v1/campaigns/${enc(id)}`),
      create: (body: In<typeof CreateCampaignBody>) => http<Out<typeof CampaignDto>>('POST', '/v1/campaigns', { body }),
      update: (id: string, body: In<typeof UpdateCampaignBody>) => http<Out<typeof CampaignDto>>('PATCH', `/v1/campaigns/${enc(id)}`, { body }),
      /** Schedule (or, with no body, send now per the campaign's stored schedule). Consent and suppression are enforced server-side at send time. */
      schedule: (id: string, body: { schedule?: unknown } = {}, o?: RequestOptions) => http<Out<typeof CampaignDto>>('POST', `/v1/campaigns/${enc(id)}/schedule`, { body, ...o }),
      pause: (id: string) => http<Out<typeof CampaignDto>>('POST', `/v1/campaigns/${enc(id)}/pause`),
      resume: (id: string) => http<Out<typeof CampaignDto>>('POST', `/v1/campaigns/${enc(id)}/resume`),
      cancel: (id: string) => http<Out<typeof CampaignDto>>('DELETE', `/v1/campaigns/${enc(id)}`),
      report: (id: string) => http<unknown>('GET', `/v1/campaigns/${enc(id)}/report`),
    },
    lists: {
      list: () => http<{ items: Out<typeof ListWithCount>[] }>('GET', '/v1/lists'),
      get: (id: string) => http<Out<typeof ListDto>>('GET', `/v1/lists/${enc(id)}`),
      create: (body: In<typeof CreateListBody>) => http<Out<typeof ListDto>>('POST', '/v1/lists', { body }),
      update: (id: string, body: In<typeof UpdateListBody>) => http<Out<typeof ListDto>>('PATCH', `/v1/lists/${enc(id)}`, { body }),
      delete: (id: string) => http<{ ok: true }>('DELETE', `/v1/lists/${enc(id)}`),
      addMembers: (id: string, body: In<typeof ListMembersBody>) => http<Out<typeof ListMembersResult>>('POST', `/v1/lists/${enc(id)}/members`, { body }),
      removeMember: (id: string, profileId: string) => http<Out<typeof ListMembersResult>>('DELETE', `/v1/lists/${enc(id)}/members/${enc(profileId)}`),
    },
    templates: {
      list: (query: In<typeof ListTemplatesQuery> = {}) => http<Out<typeof TemplatePage>>('GET', '/v1/templates', { query: q(query) }),
      get: (id: string) => http<Out<typeof TemplateWithVersion>>('GET', `/v1/templates/${enc(id)}`),
      create: (body: In<typeof CreateTemplateBody>) => http<Out<typeof TemplateDto>>('POST', '/v1/templates', { body }),
      update: (id: string, body: In<typeof UpdateTemplateBody>) => http<Out<typeof TemplateDto>>('PATCH', `/v1/templates/${enc(id)}`, { body }),
      preview: (id: string, body: unknown) => http<unknown>('POST', `/v1/templates/${enc(id)}/preview`, { body }),
    },
    workflows: {
      list: (query: In<typeof WorkflowListQuery> = {}) => http<Out<typeof WorkflowPage>>('GET', '/v1/workflows', { query: q(query) }),
      get: (id: string) => http<Out<typeof WorkflowDto>>('GET', `/v1/workflows/${enc(id)}`),
      create: (body: In<typeof CreateWorkflowBody>) => http<Out<typeof WorkflowDto>>('POST', '/v1/workflows', { body }),
      update: (id: string, body: In<typeof UpdateWorkflowBody>) => http<Out<typeof WorkflowDto>>('PATCH', `/v1/workflows/${enc(id)}`, { body }),
      publish: (id: string) => http<unknown>('POST', `/v1/workflows/${enc(id)}/publish`),
      pause: (id: string) => http<Out<typeof WorkflowDto>>('POST', `/v1/workflows/${enc(id)}/pause`),
      enroll: (id: string, body: In<typeof EnrollBody>, o?: RequestOptions) => http<Out<typeof EnrollResult>>('POST', `/v1/workflows/${enc(id)}/enroll`, { body, ...o }),
    },
    consent: {
      get: (profileId: string) => http<{ items: Out<typeof ConsentStateDto>[] }>('GET', `/v1/profiles/${enc(profileId)}/consent`),
      /** Records a consent change. Grants need a lawful source; the server rejects the ones it cannot accept. */
      record: (profileId: string, body: In<typeof ConsentInputBody>) => http<Out<typeof ConsentOutcome>>('POST', `/v1/profiles/${enc(profileId)}/consent`, { body }),
    },
    suppressions: {
      list: (query: In<typeof SuppressionListQuery> = {}) => http<{ items: Out<typeof SuppressionDto>[]; nextCursor?: string | null }>('GET', '/v1/suppressions', { query: q(query) }),
      add: (body: In<typeof SuppressionInput>) => http<Out<typeof SuppressionDto>>('POST', '/v1/suppressions', { body }),
      lift: (id: string, body: unknown) => http<Out<typeof SuppressionDto>>('POST', `/v1/suppressions/${enc(id)}/lift`, { body }),
      blocklist: () => http<{ items: Out<typeof BlocklistDto>[] }>('GET', '/v1/blocklist'),
      block: (body: In<typeof BlocklistInput>) => http<Out<typeof BlocklistDto>>('POST', '/v1/blocklist', { body }),
    },
  };
}
