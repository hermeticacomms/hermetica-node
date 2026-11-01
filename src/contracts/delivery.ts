import { z } from 'zod';
import { BlockDoc } from './content-blocks.ts';
import { Channel, Id, PageQuery, Purpose, ReplyToList, Timestamp, pageResult } from './common.ts';
import { PushExtras } from './push.ts';

export const MessageStatus = z.enum([
  'queued', 'deferred', 'blocked', 'sending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled', 'needs_reconcile',
]);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const MessageTag = z.string().min(1).max(50).regex(/^[\w.:-]+$/, 'tags use letters, digits and . _ : -');
export const MessageTags = z.array(MessageTag).max(10);
export const MessageMetadata = z.record(z.string().min(1).max(64), z.string().max(255)).refine((m) => Object.keys(m).length <= 10, { message: 'At most 10 metadata keys' });
/** Attachment already stored (key into object storage); the API converts base64 uploads into these. */
export const StoredAttachment = z.object({ filename: z.string().min(1).max(255), contentType: z.string().max(200), key: z.string().min(1).max(500), size: z.number().int().nonnegative(), cid: z.string().max(200).optional() });
export type StoredAttachment = z.infer<typeof StoredAttachment>;
/** Beyond X-*, only these informational headers may be set; transport, threading, auth and unsubscribe headers stay under the pipeline's control. */
export const ALLOWED_PLAIN_HEADERS = ['list-id', 'list-help', 'list-owner', 'list-archive', 'list-post', 'precedence', 'importance', 'sensitivity', 'organization', 'keywords', 'comments', 'content-language'] as const;
const headerAllowed = (k: string) => (/^X-[\w-]{1,100}$/i.test(k) && !/^x-(hermetica|sg|mailgun|ses|pm)-/i.test(k)) || (ALLOWED_PLAIN_HEADERS as readonly string[]).includes(k.toLowerCase());
export const CustomHeaders = z.record(z.string().refine(headerAllowed, 'custom headers must start with X- (not a provider/internal prefix) or be one of: ' + ALLOWED_PLAIN_HEADERS.join(', ')), z.string().max(998).regex(/^[^\r\n]*$/)).refine((m) => Object.keys(m).length <= 20);

export const SendSource = z.object({
  kind: z.enum(['campaign', 'workflow', 'sequence', 'api']),
  id: z.string().min(1).max(128),
  stepKey: z.string().max(128).optional(),
});

/** Inline content is for internal callers (workflows/tests); the public API sends stored templates only. */
export const InlineContent = z.object({
  subject: z.string().max(998).optional(),
  text: z.string().min(1).max(100_000),
  html: z.string().max(512_000).optional(),
  /** A block design sent in place of `html` (Manual review edits of block-built emails keep the design). */
  doc: BlockDoc.optional(),
});

/** 01-architecture §6 input. workspaceId comes from the caller's ctx, never from the payload. */
export const SendRequest = z.object({
  purpose: Purpose,
  channel: Channel,
  profileId: Id,
  templateId: Id.optional(),
  versionId: Id.optional(),
  inline: InlineContent.optional(),
  route: z.object({ connectionId: Id.optional(), poolId: Id.optional(), routePolicyId: Id.optional() }),
  source: SendSource,
  /** Push only: image, deep link, data payload, badge, sound, TTL and per-platform overrides (title = subject, body = text). */
  push: PushExtras.optional(),
  idempotencyKey: z.string().min(1).max(200),
  topicId: Id.optional(),
  scheduledFor: z.coerce.date().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  tracking: z.object({ clicks: z.boolean().optional(), opens: z.boolean().optional() }).optional(),
  /** Campaign-level UTM defaults, appended to http(s) links that carry no utm_* yet. */
  utm: z.record(z.string(), z.string()).optional(),
  /** Campaign variant overrides; subject is rendered as liquid like the template's own. */
  subjectOverride: z.string().max(998).optional(),
  fromNameOverride: z.string().max(200).optional(),
  /** Liquid template for the recipient's display name in the To header (for example `{{ first_name }} {{ last_name }}`); empty result = bare address. */
  toNameTemplate: z.string().max(200).optional(),
  /** Preview text (preheader) override, rendered as liquid like the template's own. */
  preheaderOverride: z.string().max(300).optional(),
  /** Reply in the thread of the latest message this source sent to the profile at that step (In-Reply-To/References, `Re:` subject). */
  replyToStep: z.string().max(128).optional(),
  /** Transactional threading: reply to this earlier message job of the same profile. */
  inReplyToJobId: Id.optional(),
  /** Outreach email without an HTML part or open pixel; `unsubscribeText` words the footer unsubscribe link. */
  plainText: z.boolean().optional(),
  unsubscribeText: z.string().max(120).optional(),
  /** `{a|b}` wording: `random` per send (default) or `sequential` (rotate evenly across the sends of a source step). */
  spintaxMode: z.enum(['random', 'sequential']).optional(),
  /** Experiment/A-B variant this send belongs to; stamped on the job so rollups group by variant. */
  variantKey: z.string().max(32).optional(),
  /** Transactional envelope (B1/B2): searchable tags and metadata, stored attachments, X- headers, verified from/reply-to override. */
  tags: MessageTags.optional(),
  metadata: MessageMetadata.optional(),
  attachments: z.array(StoredAttachment).max(10).optional(),
  /** Per-recipient files: `ref` is the profile attribute's value (an https URL or an asset id), fetched at dispatch. Set from the source's send options. */
  profileFiles: z.array(z.object({ name: z.string().max(100), ref: z.string().max(2048) })).max(5).optional(),
  customHeaders: CustomHeaders.optional(),
  senderIdentityId: Id.optional(),
  /** Prefer the verified sender identity with this from-address (a list default). Never creates or verifies a sender: if none of the route's verified senders match, it is ignored. */
  fromEmailPreference: z.string().email().max(320).optional(),
  replyTo: ReplyToList.optional(),
  /** Footer postal address for this message; wins over the brand kit and workspace address. */
  footerAddress: z.string().max(600).optional(),
  /** SMS only: public https image URLs sent as MMS media (providers without MMS ignore them). */
  mediaUrls: z.array(z.url()).max(10).optional(),
  /** Extra recipients (email only). Suppressed addresses are dropped at dispatch; providers without cc/bcc support fail the send cleanly. */
  cc: z.array(z.string().email().max(320)).max(10).optional(),
  bcc: z.array(z.string().email().max(320)).max(10).optional(),
  /** Transactional email to an address not yet on the profile (address-change confirmation). Same suppression gates apply to this address; refused for any other purpose. */
  destinationOverride: z.string().email().max(320).optional(),
  /** Set by requestSend from a restricted API key; dispatch re-applies it so a re-route never leaves the allowed senders. */
  senderScope: z.object({ connections: z.array(z.string()).optional(), domains: z.array(z.string()).optional() }).optional(),
}).refine((r) => Boolean(r.templateId) !== Boolean(r.inline), { message: 'Provide exactly one of templateId or inline' })
  .refine((r) => Boolean(r.route.connectionId || r.route.poolId || r.route.routePolicyId), { message: 'route needs connectionId, poolId or routePolicyId' });
export type SendRequest = z.infer<typeof SendRequest>;

export const SendOutcome = z.object({
  jobId: Id,
  status: z.enum(['queued', 'blocked', 'deferred', 'duplicate']),
  reason: z.string().optional(),
});
export type SendOutcome = z.infer<typeof SendOutcome>;

/** POST /v1/messages/send: stored templates only, source is always `api`. */
export const SendApiBody = z.object({
  purpose: Purpose,
  channel: Channel,
  profileId: Id,
  templateId: Id,
  versionId: Id.optional(),
  route: SendRequest.shape.route,
  /** Either this or the `Idempotency-Key` header (header wins when the body omits it; both must agree). */
  idempotencyKey: z.string().min(1).max(200).optional(),
  topicId: Id.optional(),
  scheduledFor: z.coerce.date().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
});

export const MessageListQuery = PageQuery.extend({
  profileId: Id.optional(),
  status: MessageStatus.optional(),
  sourceKind: SendSource.shape.kind.optional(),
  sourceId: z.string().max(128).optional(),
  /** Recipient address / number, substring match; comma separated values match any. */
  q: z.string().max(200).optional(),
  /** Messages to everyone linked to this custom object (a "group"), e.g. objectType=company&objectId=<id>. */
  objectType: z.string().max(64).optional(),
  objectId: Id.optional(),
  /** Oldest first instead of newest first. */
  order: z.enum(['asc', 'desc']).default('desc'),
  tag: MessageTag.optional(),
  /** `key:value` pairs, repeated or comma separated. */
  metadata: z.string().max(500).optional(),
  senderIdentityId: Id.optional(),
  templateId: Id.optional(),
  channel: Channel.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Event / trigger properties passed as send vars: `path:value` pairs (dots walk objects, e.g. `trigger.orderId:123`), comma separated; all must match. */
  vars: z.string().max(500).optional(),
  /** Only messages that have at least one event of this kind (open, click, delivered, hard_bounce, ...). */
  eventKind: z.string().max(40).optional(),
});

/** One policy stage of the send pipeline (destination, eligibility, caps, route, render, reserve, send, events). */
export const DecisionEntry = z.object({ stage: z.string(), outcome: z.enum(['allow', 'block', 'defer']), reason: z.string().nullish(), at: Timestamp.nullish() });
export const MessageJobDto = z.object({
  id: Id,
  idempotencyKey: z.string(),
  purpose: Purpose,
  channel: Channel,
  profileId: Id,
  /** Resolved address / phone number the message went (or would go) to. */
  destination: z.string().nullable(),
  connectionId: Id.nullable(),
  senderIdentityId: Id.nullable(),
  sourceKind: SendSource.shape.kind,
  sourceId: z.string(),
  stepKey: z.string().nullable(),
  templateVersionId: Id.nullable(),
  variantKey: z.string().nullable(),
  status: MessageStatus,
  blockReason: z.string().nullable(),
  errorClass: z.string().nullable(),
  decisionLog: z.array(DecisionEntry),
  scheduledFor: Timestamp.nullable(),
  sentAt: Timestamp.nullable(),
  providerMessageId: z.string().nullable(),
  subject: z.string().nullable(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.string()).nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const MessageJobPage = pageResult(MessageJobDto);
export const MessageAttemptDto = z.object({
  id: Id, jobId: Id, n: z.number().int(), status: z.string(), errorClass: z.string().nullable(), startedAt: Timestamp, finishedAt: Timestamp.nullable(),
});
export const MessageEventDto = z.object({
  id: Id, jobId: Id, profileId: Id, kind: z.string(), source: z.string(), connectionId: Id.nullable(), url: z.string().nullable(), ua: z.string().nullable(),
  isMachine: z.boolean(), occurredAt: Timestamp,
});
export const MessageDetailDto = z.object({
  job: MessageJobDto,
  attempts: z.array(MessageAttemptDto),
  events: z.array(MessageEventDto),
  decisionLog: z.array(DecisionEntry),
});
export const RetryOutcome = z.object({ jobId: Id, status: z.string(), at: Timestamp });
