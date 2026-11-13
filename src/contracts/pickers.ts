import { z } from 'zod';

/**
 * What a config value refers to, so a form generated from the schema shows a live picker (lists, events seen, field registry...) instead
 * of a text box. Stored as `x-picker` metadata: a valid OpenAPI extension, so API clients see it too.
 */
export const PICKER_KINDS = [
  'template', 'list', 'segment', 'tag', 'topic', 'field', 'event', 'connection', 'sender', 'webhook_template', 'user', 'product', 'form',
  'sequence', 'workflow', 'node', 'object_type', 'score', 'integration', 'company', 'collection', 'in_app', 'site_message', 'wa_flow',
  'slack_install', 'slack_template', 'ad_account', 'timezone', 'lifecycle_stage', 'experiment', 'secret', 'message_event', 'reply_class',
  'custom_trigger', 'custom_action', 'loyalty_program', 'sender_pool', 'route_policy', 'geofence',
  'loyalty_tier', 'loyalty_reward', 'event_path', 'collection_column', 'field_value', 'social_account',
] as const;
export type PickerKind = (typeof PICKER_KINDS)[number];
export const PICKER_KEY = 'x-picker';

/** Marks `schema` as a reference to `kind` (keeps any description already on it; never copies a registry `id`, which must stay unique). */
export const pick = <T extends z.ZodType>(schema: T, kind: PickerKind): T => {
  const { id: _id, ...rest } = schema.meta() ?? {};
  return schema.meta({ ...rest, [PICKER_KEY]: kind }) as T;
};

/** Message activity / delivery states a `message_event` trigger can start on. */
export const MESSAGE_EVENT_KINDS = ['open', 'click', 'reply', 'unsubscribe', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'deferred', 'blocked'] as const;
