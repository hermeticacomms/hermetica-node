import { z } from 'zod';
import { Id, Timestamp } from './common.ts';

export const ConnectorKind = z.enum(['hubspot', 'shopify', 'salesforce', 'pipedrive', 'dynamics', 'zendesk', 'segment', 'posthog', 'woocommerce', 'bigcommerce', 'stripe', 's3', 'bigquery', 'snowflake']);
/** Credentials are validated per kind in the integrations module and are never echoed back. */
export const CreateConnectorBody = z.object({
  kind: ConnectorKind,
  name: z.string().min(1).max(120),
  credentials: z.record(z.string(), z.string().max(4096)),
  /** shopify: `{ shop: "<name>.myshopify.com" }` */
  config: z.record(z.string(), z.unknown()).optional(),
});
export const ConnectorDto = z.object({
  id: Id, kind: z.union([ConnectorKind, z.string().regex(/^x:[a-z0-9-]+$/)]), name: z.string(), config: z.record(z.string(), z.unknown()), status: z.enum(['active', 'error', 'disabled']),
  lastSyncAt: Timestamp.nullable(), lastError: z.string().nullable(), createdAt: Timestamp,
});
export const ConnectorTestResult = z.object({ ok: z.boolean(), message: z.string() });
export const ConnectorWebhookUrl = z.object({ url: z.url() });
export const ConnectorList = z.object({ items: z.array(ConnectorDto) });

export const ShopifyInstallQuery = z.object({ shop: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/, 'Use <name>.myshopify.com') });
export const ShopifyInstallResult = z.object({ url: z.url() });
/** One-click WooCommerce connect: the store site (https) and, from the WordPress plugin, where WooCommerce should send the merchant back. */
export const WooConnectQuery = z.object({ site: z.url().max(512), returnUrl: z.url().max(1024).optional() });
/** What WooCommerce POSTs to the callback after the merchant approves (`user_id` carries our signed state). */
export const WooConnectCallbackBody = z.object({ key_id: z.number().int().optional(), user_id: z.string().min(1).max(2048), consumer_key: z.string().min(1).max(256), consumer_secret: z.string().min(1).max(256), key_permissions: z.string().max(32).optional() });

export const ShopifyDiscountBody = z.object({
  poolId: Id, count: z.number().int().min(1).max(2000), percentOff: z.number().min(1).max(100),
  prefix: z.string().max(12).optional(), endsAt: Timestamp.optional(),
});
export const ShopifyDiscountResult = z.object({ created: z.number().int(), addedToPool: z.number().int() });

const RowIdentity = { email: z.string().max(320).optional(), phone: z.string().max(32).optional(), externalId: z.string().max(200).optional() };
/** Reverse-ETL rows. Events need a `dedupeKey` so a re-run of the warehouse sync is a no-op. */
export const WarehouseRowsBody = z.object({
  rows: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('profile'), ...RowIdentity, firstName: z.string().max(200).optional(), lastName: z.string().max(200).optional(), attributes: z.record(z.string(), z.unknown()).optional() }),
    z.object({ type: z.literal('event'), ...RowIdentity, name: z.string().min(1).max(128), occurredAt: Timestamp.optional(), properties: z.record(z.string(), z.unknown()).optional(), dedupeKey: z.string().min(1).max(256) }),
  ])).min(1).max(1000),
});
export const WarehouseRowsResult = z.object({ applied: z.number().int(), failed: z.array(z.object({ index: z.number().int(), reason: z.string() })) });

/** HubSpot install: each workspace brings its own HubSpot app, so its credentials come with the request (sealed, never echoed). */
export const HubSpotInstallBody = z.object({
  name: z.string().min(1).max(120), clientId: z.string().min(1).max(200), clientSecret: z.string().min(1).max(200),
  /** With both, Hermeticor registers the contact webhook subscriptions on the app after the install. */
  appId: z.string().min(1).max(40).optional(), developerApiKey: z.string().min(1).max(200).optional(),
});
export const HubSpotInstallResult = z.object({ connectionId: Id, url: z.url() });
export const HubSpotWebhooksResult = z.object({ registered: z.boolean() });
