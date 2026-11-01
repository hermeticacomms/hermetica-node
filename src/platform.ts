import type { z } from 'zod';
import type {
  AccountExportDto, AuthorizedAppDto, ClientInfoDto, ClientQuotaBody, InvoiceDto, OAuthClientBody, OAuthClientCreated, OAuthClientDto, UsagePeriodDto,
  WebhookDeliveryDto, WebhookTopicDto,
} from './contracts/index.ts';
import type { createTransport, Query } from './http.ts';

type In<S extends z.ZodType> = z.input<S>;
type Out<S extends z.ZodType> = z.infer<S>;
const enc = encodeURIComponent;

/** Platform/admin resources: webhook topic catalog, billing history, account export, OAuth clients, authorized apps, agency client lifecycle. */
export function platformResources(http: ReturnType<typeof createTransport>) {
  return {
    webhookTopics: {
      list: () => http<{ items: Out<typeof WebhookTopicDto>[] }>('GET', '/v1/webhooks/topics'),
      get: (topic: string) => http<Out<typeof WebhookTopicDto>>('GET', `/v1/webhooks/topics/${enc(topic)}`),
      /** Sends the topic's example payload to one endpoint (signed, logged, never retried). */
      testFire: (endpointId: string, topic: string) => http<Out<typeof WebhookDeliveryDto>>('POST', `/v1/webhooks/endpoints/${enc(endpointId)}/test-topic`, { body: { topic } }),
    },
    billingHistory: {
      usage: (months = 12) => http<{ items: Out<typeof UsagePeriodDto>[] }>('GET', '/v1/billing/usage', { query: { months } as Query }),
      usageForPeriod: (period: string) => http<Out<typeof UsagePeriodDto>>('GET', `/v1/billing/usage/${enc(period)}`),
      invoices: () => http<{ items: Out<typeof InvoiceDto>[] }>('GET', '/v1/billing/invoices'),
    },
    accountExports: {
      request: () => http<Out<typeof AccountExportDto>>('POST', '/v1/account-exports'),
      list: () => http<{ items: Out<typeof AccountExportDto>[] }>('GET', '/v1/account-exports'),
      get: (id: string) => http<Out<typeof AccountExportDto>>('GET', `/v1/account-exports/${enc(id)}`),
    },
    oauthClients: {
      list: () => http<{ items: Out<typeof OAuthClientDto>[] }>('GET', '/v1/oauth/clients'),
      /** The client secret is returned once. */
      create: (body: In<typeof OAuthClientBody>) => http<Out<typeof OAuthClientCreated>>('POST', '/v1/oauth/clients', { body }),
      revoke: (id: string) => http<{ ok: true }>('DELETE', `/v1/oauth/clients/${enc(id)}`),
    },
    authorizedApps: {
      list: () => http<{ items: Out<typeof AuthorizedAppDto>[] }>('GET', '/v1/authorized-apps'),
      get: (clientId: string) => http<Out<typeof AuthorizedAppDto>>('GET', `/v1/authorized-apps/${enc(clientId)}`),
      revoke: (clientId: string) => http<{ ok: true }>('DELETE', `/v1/authorized-apps/${enc(clientId)}`),
    },
    agencyClients: {
      get: (workspaceId: string) => http<Out<typeof ClientInfoDto>>('GET', `/v1/agency/clients/${enc(workspaceId)}`),
      pause: (workspaceId: string, reason?: string) => http<{ ok: true }>('POST', `/v1/agency/clients/${enc(workspaceId)}/pause`, { body: { reason } }),
      resume: (workspaceId: string) => http<{ ok: true }>('POST', `/v1/agency/clients/${enc(workspaceId)}/resume`),
      scheduleDeletion: (workspaceId: string, graceDays = 30) => http<{ deleteAfter: string }>('POST', `/v1/agency/clients/${enc(workspaceId)}/delete`, { body: { graceDays } }),
      setQuota: (workspaceId: string, body: In<typeof ClientQuotaBody>) => http<Out<typeof ClientQuotaBody>>('PUT', `/v1/agency/clients/${enc(workspaceId)}/quota`, { body }),
    },
  };
}
