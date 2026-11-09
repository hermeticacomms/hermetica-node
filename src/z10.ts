import type { z } from 'zod';
import type {
  BillingSummary, InvitationResult, MemberDto, PlanDto, ShopifyDiscountBody, ShopifyDiscountResult, UrlResult, WarehouseRowsBody, WarehouseRowsResult, WebhookEndpointDto,
  WebhookJournalBounds, WebhookJournalPage, WebhookRetriggerResult, WebhookSummary, X10AiCustomBody, X10AiJobDto, X10PromptTemplateBody, X10PromptTemplateDto,
} from './contracts/index.ts';
import type { createTransport, Query, RequestOptions } from './http.ts';

type In<S extends z.ZodType> = z.input<S>;
type Out<S extends z.ZodType> = z.infer<S>;
const enc = encodeURIComponent;

/** Team, ownership, billing plans, test mode, AI prompt templates, webhook operations and connector actions. */
export function z10Resources(http: ReturnType<typeof createTransport>) {
  const q = (v: unknown) => v as Query;
  return {
    members: {
      list: () => http<{ items: Out<typeof MemberDto>[]; nextCursor: string | null }>('GET', '/v1/members'),
      get: (userId: string) => http<Out<typeof MemberDto>>('GET', `/v1/members/${enc(userId)}`),
      /** Emails the invitee when the server has a platform mailer; the one-time token is returned either way. */
      invite: (email: string, role: Out<typeof MemberDto>['role']) => http<Out<typeof InvitationResult>>('POST', '/v1/members', { body: { email, role } }),
      resendInvitation: (id: string) => http<Out<typeof InvitationResult>>('POST', `/v1/invitations/${enc(id)}/resend`),
      transferOwnership: (userId: string) => http<{ ok: true }>('POST', '/v1/workspace/transfer-ownership', { body: { userId } }),
    },
    testMode: {
      get: () => http<{ enabled: boolean }>('GET', '/v1/workspace/test-mode'),
      set: (enabled: boolean) => http<{ enabled: boolean }>('PUT', '/v1/workspace/test-mode', { body: { enabled } }),
    },
    billingPlans: {
      list: () => http<{ items: Out<typeof PlanDto>[] }>('GET', '/v1/billing/plans'),
      summary: () => http<Out<typeof BillingSummary>>('GET', '/v1/billing'),
      /** Self-hosted servers only; with a billing provider use `checkout`. */
      setPlan: (planId: string) => http<Out<typeof BillingSummary>>('PUT', '/v1/billing/plan', { body: { planId } }),
      checkout: (planId: string, successUrl: string, cancelUrl: string) => http<Out<typeof UrlResult>>('POST', '/v1/billing/checkout', { body: { planId, successUrl, cancelUrl } }),
    },
    aiPrompts: {
      list: (resourceRef?: string) => http<{ items: Out<typeof X10PromptTemplateDto>[] }>('GET', '/v1/ai/prompt-templates', { query: q({ resourceRef }) }),
      save: (body: In<typeof X10PromptTemplateBody>, id?: string) => http<Out<typeof X10PromptTemplateDto>>(id ? 'PUT' : 'POST', id ? `/v1/ai/prompt-templates/${enc(id)}` : '/v1/ai/prompt-templates', { body }),
      remove: (id: string) => http<{ ok: true }>('DELETE', `/v1/ai/prompt-templates/${enc(id)}`),
      /** Runs your prompt over each row as a background job; poll with `ai.job`. */
      runCustom: (body: In<typeof X10AiCustomBody>) => http<Out<typeof X10AiJobDto>>('POST', '/v1/ai/bulk/custom', { body }),
    },
    webhookOps: {
      resume: (id: string) => http<Out<typeof WebhookEndpointDto>>('POST', `/v1/webhooks/endpoints/${enc(id)}/resume`),
      retriggerFailed: (id: string) => http<Out<typeof WebhookRetriggerResult>>('POST', `/v1/webhooks/endpoints/${enc(id)}/retrigger-failed`),
      journal: (query: { after?: number; limit?: number; endpointId?: string } = {}) => http<Out<typeof WebhookJournalPage>>('GET', '/v1/webhooks/journal', { query: q(query) }),
      journalBounds: () => http<Out<typeof WebhookJournalBounds>>('GET', '/v1/webhooks/journal/bounds'),
      summary: (query: { from?: string; to?: string } = {}) => http<Out<typeof WebhookSummary>>('GET', '/v1/webhooks/summary', { query: q(query) }),
    },
    connectorActions: {
      registerHubspotWebhooks: (connectionId: string) => http<{ registered: boolean }>('POST', `/v1/integrations/connections/${enc(connectionId)}/hubspot/webhooks`),
      createShopifyDiscountCodes: (connectionId: string, body: In<typeof ShopifyDiscountBody>, o?: RequestOptions) =>
        http<Out<typeof ShopifyDiscountResult>>('POST', `/v1/integrations/connections/${enc(connectionId)}/shopify/discount-codes`, { body, ...o }),
      /** Reverse-ETL: upsert profiles and events from warehouse rows. */
      warehouseRows: (body: In<typeof WarehouseRowsBody>, o?: RequestOptions) => http<Out<typeof WarehouseRowsResult>>('POST', '/v1/integrations/warehouse/rows', { body, ...o }),
    },
  };
}
