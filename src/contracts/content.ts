import { z } from 'zod';
import { Channel, Id, Purpose, PageQuery, ReplyToList, Timestamp, pageResult } from './common.ts';
import { Block, BlockDoc } from './content-blocks.ts';
import { LintResult } from './content-library.ts';
import { RcsContent } from './rcs.ts';

export const TemplateKind = z.enum(['blocks', 'html', 'text', 'sms']);
export type TemplateKind = z.infer<typeof TemplateKind>;

/** Stored in template_versions.body; `kind` must match the template's kind. */
export const TemplateBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blocks'), doc: BlockDoc }),
  /** `authoring` + `source`: the html was compiled from markdown or raw MJML on save; the source is kept for re-editing. */
  z.object({ kind: z.literal('html'), html: z.string().max(512_000), authoring: z.enum(['markdown', 'mjml']).optional(), source: z.string().max(512_000).optional() }),
  z.object({ kind: z.literal('text'), text: z.string().max(100_000) }),
  z.object({ kind: z.literal('sms'), text: z.string().max(1600) }),
]);
export type TemplateBody = z.infer<typeof TemplateBody>;

export const TemplateVersionInput = z.object({
  body: TemplateBody,
  subject: z.string().max(998).nullable().default(null),
  preheader: z.string().max(500).nullable().default(null),
  fromNameOverride: z.string().max(200).nullable().default(null),
  textBody: z.string().max(100_000).nullable().default(null),
  /** Sender defaults carried by the template; a campaign or journey step that sets its own wins. */
  fromEmail: z.email().max(320).nullable().optional(),
  replyTo: ReplyToList.nullable().optional(),
  /** Copy addresses. Honoured on transactional sends only: a copy shares the recipient's personal content and never consented. */
  cc: z.array(z.email().max(320)).max(10).optional(),
  /** Email only: an AMP for Email document sent as a text/x-amp-html part next to the HTML (which stays the fallback). Checked at save. */
  ampHtml: z.string().max(200_000).nullable().optional(),
  /** SMS only: an RCS card and suggestion chips; the text body is the SMS fallback. */
  rcs: RcsContent.nullable().optional(),
});
export type TemplateVersionInput = z.infer<typeof TemplateVersionInput>;

export const TemplateVersionDto = z.object({
  id: Id, templateId: Id, workspaceId: Id, body: TemplateBody,
  subject: z.string().nullable(), preheader: z.string().nullable(), fromNameOverride: z.string().nullable(), textBody: z.string().nullable(),
  approvalStatus: z.enum(['none', 'pending', 'approved', 'rejected']), reviewComment: z.string().nullable(),
  createdBy: z.string().nullable(), createdAt: Timestamp, approvedBy: z.string().nullable(), approvedAt: Timestamp.nullable(),
  fromEmail: z.string().nullable().default(null), replyTo: z.string().nullable().default(null), cc: z.array(z.string()).default([]),
  ampHtml: z.string().nullable().default(null), rcs: RcsContent.nullable().default(null),
  /** Set when a reviewer confirmed this version is transactional despite offer wording (POST .../transactional-review). */
  transactionalReviewedBy: z.string().nullable().default(null), transactionalReviewedAt: Timestamp.nullable().default(null),
});

export const TemplateDto = z.object({
  id: Id, workspaceId: Id, channel: Channel, name: z.string(), kind: TemplateKind, folder: z.string().nullable(), tags: z.array(z.string()),
  currentVersionId: Id.nullable(), archived: z.boolean(), folderId: Id.nullable(), brandKitId: Id.nullable(), isDefault: z.boolean().default(false), topicId: Id.nullable().default(null), createdBy: z.string().nullable().default(null), createdAt: Timestamp, updatedAt: Timestamp,
});
export const TemplateWithVersion = TemplateDto.extend({ currentVersion: TemplateVersionDto.nullable() });

export const CreateTemplateBody = z.object({
  name: z.string().trim().min(1).max(200),
  kind: TemplateKind,
  /** Only with kind `sms`: `push` makes a push template (version subject = title, text = body). */
  channel: z.literal('push').optional(),
  /** A top-level folder by name, created when missing (the same folder record `folderId` names). */
  folder: z.string().trim().max(200).nullable().optional(),
  folderId: Id.nullable().optional(),
  tags: z.array(z.string().max(64)).max(50).default([]),
  /** Preference topic for this template's marketing sends that name no topic (as on PATCH). */
  topicId: Id.nullable().optional(),
  version: TemplateVersionInput.optional(),
});
export const UpdateTemplateBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  /** Moves to the top-level folder of that name, created when missing; null takes it out of any folder. `folderId` wins when both are sent. */
  folder: z.string().trim().max(200).nullable().optional(),
  tags: z.array(z.string().max(64)).max(50).optional(),
  archived: z.boolean().optional(),
  folderId: Id.nullable().optional(),
  brandKitId: Id.nullable().optional(),
  /** Preference topic for this template's marketing sends that name no topic; null clears it. People who opted out of the topic are not messaged. */
  topicId: Id.nullable().optional(),
  /** The pre-selected template for new campaigns on this channel; setting it clears the previous default. */
  isDefault: z.boolean().optional(),
});
export const ListTemplatesQuery = PageQuery.extend({
  channel: Channel.optional(), folder: z.string().optional(), folderId: Id.optional(), tag: z.string().max(64).optional(), q: z.string().max(200).optional(),
  archived: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  /** Actor id of the creator (a user id, or `me` for the caller). */
  createdBy: z.string().max(128).optional(),
  kind: TemplateKind.optional(),
  createdAfter: Timestamp.optional(), createdBefore: Timestamp.optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'name_desc', 'updated']).default('newest'),
});
export const TemplatePage = pageResult(TemplateDto);

/** Apply one change to many templates. Tags: `tags` replaces, `addTags` / `removeTags` edit. */
export const BulkUpdateTemplatesBody = z.object({
  ids: z.array(Id).min(1).max(100),
  patch: z.object({
    folderId: Id.nullable(), archived: z.boolean(), brandKitId: Id.nullable(), topicId: Id.nullable(),
    tags: z.array(z.string().max(64)).max(50), addTags: z.array(z.string().max(64)).max(50), removeTags: z.array(z.string().max(64)).max(50),
  }).partial().refine((p) => Object.keys(p).length > 0, 'Nothing to change'),
});
export const BulkUpdateTemplatesResult = z.object({ updated: z.number().int(), failed: z.array(z.object({ id: Id, reason: z.string() })) });
export const TemplateVersionPage = pageResult(TemplateVersionDto);

export const PreviewBody = z.object({
  versionId: Id.optional(),
  brandKitId: Id.optional(),
  strict: z.boolean().default(false),
  /** Shallow-merged over the sample profile / vars. */
  profile: z.record(z.string(), z.unknown()).optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  /** Render against this real profile instead of the sample one. */
  profileId: Id.optional(),
  /** Preview as a member of these segments (segment-aware conditional blocks). */
  segmentIds: z.array(Id).max(20).optional(),
  darkMode: z.boolean().default(false),
  /** When set, the result carries lint findings for this send purpose. */
  purpose: Purpose.optional(),
});
export const QaIssue = z.object({ code: z.string(), message: z.string() });
export const QaReport = z.object({
  clipping: z.object({ bytes: z.number(), limit: z.number(), percent: z.number(), clipped: z.boolean() }),
  accessibility: z.array(QaIssue),
  spam: z.object({ score: z.number(), hits: z.array(QaIssue.extend({ points: z.number() })) }),
  /** Inline-CSS audit: styles that mail clients drop or ignore. */
  css: z.array(QaIssue).default([]),
});

export const PreviewResult = z.object({
  channel: Channel,
  subject: z.string().nullable(), preheader: z.string().nullable(), html: z.string().nullable(), text: z.string(),
  links: z.array(z.object({ url: z.string(), position: z.number() })),
  warnings: z.array(z.string()),
  sms: z.object({ segments: z.number(), encoding: z.enum(['GSM-7', 'UCS-2']) }).nullable(),
  lint: LintResult.nullable(),
  /** Email only: clipping meter, accessibility findings and spam score. */
  qa: QaReport.nullable().optional(),
});

export const SnippetKey = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
export const SnippetDto = z.object({ id: Id, workspaceId: Id, key: SnippetKey, channel: Channel, body: z.string(), locked: z.boolean(), createdAt: Timestamp, updatedAt: Timestamp });
export const CreateSnippetBody = z.object({ key: SnippetKey, channel: Channel, body: z.string().max(50_000) });
export const UpdateSnippetBody = z.object({ body: z.string().max(50_000) });
export const SnippetBulkDeleteBody = z.object({ ids: z.array(Id).min(1).max(100) });
export const SnippetBulkDeleteResult = z.object({ deleted: z.number().int(), skippedLocked: z.number().int() });
export const SnippetPage = pageResult(SnippetDto);

export const BrandColors = z.object({ primary: z.string().max(32), text: z.string().max(32), background: z.string().max(32), accent: z.string().max(32).optional() }).partial();
export const BrandFonts = z.object({ heading: z.string().max(100), body: z.string().max(100) }).partial();
export const BrandKitInput = z.object({
  name: z.string().trim().min(1).max(200),
  logoAssetId: Id.nullable().default(null),
  logoUrl: z.string().max(2048).nullable().default(null),
  colors: BrandColors.default({}),
  fonts: BrandFonts.default({}),
  footerHtml: z.string().max(20_000).nullable().default(null),
  postalAddress: z.string().max(500).nullable().default(null),
  customCss: z.string().max(50_000).nullable().default(null),
  /** HTML wrapper for HTML templates; must contain {{ content }}, where the template body goes. */
  layoutHtml: z.string().max(50_000).nullable().default(null),
  /** The workspace default kit applies automatically to every block-editor render that names none. */
  isDefault: z.boolean().default(false),
});
export type BrandKitInput = z.infer<typeof BrandKitInput>;
// Not `BrandKitInput.partial()`: zod re-applies defaults to missing keys, which would reset fields on PATCH.
export const UpdateBrandKitBody = z.object({
  name: z.string().trim().min(1).max(200), logoAssetId: Id.nullable(), logoUrl: z.string().max(2048).nullable(),
  colors: BrandColors, fonts: BrandFonts, footerHtml: z.string().max(20_000).nullable(), postalAddress: z.string().max(500).nullable(), customCss: z.string().max(50_000).nullable(), layoutHtml: z.string().max(50_000).nullable(), isDefault: z.boolean(),
}).partial();
export const BrandKitDto = BrandKitInput.extend({ id: Id, workspaceId: Id, createdAt: Timestamp, updatedAt: Timestamp });
export const BrandKitPage = pageResult(BrandKitDto);

/** AI translation of a language variant (opt-in AI assist; brand voice applies). Liquid tags are never altered. */
export const TranslateVariantBody = z.object({
  blocks: z.array(Block).max(100), subject: z.string().max(998).optional(), preheader: z.string().max(500).optional(),
  targetLanguage: z.string().min(2).max(50),
});
export const TranslateVariantResult = z.object({
  blocks: z.array(Block), subject: z.string().optional(), preheader: z.string().optional(), model: z.string(), draft: z.literal(true),
});

/** Real-client rendering previews (Litmus / Email on Acid style) through a per-workspace connection. */
export const QaPreviewConnectionBody = z.object({ vendor: z.string().min(1).max(32), name: z.string().trim().min(1).max(100), apiKey: z.string().min(1).max(500).optional(),
  /** Second credential for vendors that need one (Email on Acid: the account password). */
  apiSecret: z.string().min(1).max(500).optional() });
export const QaPreviewConnectionDto = z.object({
  configured: z.boolean(), vendor: z.string().nullable(), name: z.string().nullable(),
  /** Vendors this server has an adapter for. */
  vendors: z.array(z.string()),
});
export const ClientPreviewStartBody = z.object({ versionId: Id.optional(), clients: z.array(z.string().min(1).max(100)).max(100).optional() });
export const PreviewClientDto = z.object({ id: z.string(), name: z.string(), platform: z.enum(['web', 'desktop', 'mobile']), defaultSelected: z.boolean() });
export const PreviewClientsDto = z.object({ clients: z.array(PreviewClientDto), credits: z.object({ remaining: z.number(), resetsAt: z.string().nullable() }).nullable() });
export const ClientPreviewRunDto = z.object({
  id: Id, templateId: Id, versionId: Id.nullable(), vendor: z.string(), externalId: z.string(), clients: z.array(z.string()), status: z.enum(['pending', 'done', 'failed']),
  shots: z.array(z.object({ client: z.string(), url: z.string() })), error: z.string().nullable(), createdBy: z.string().nullable(), createdAt: Timestamp,
});
export const ClientPreviewRunList = z.object({ items: z.array(ClientPreviewRunDto) });
export const ClientPreviewStart = z.object({ externalId: z.string() });
export const ClientPreviewResult = z.object({
  status: z.enum(['pending', 'done', 'failed']), error: z.string().optional(),
  shots: z.array(z.object({ client: z.string(), url: z.string() })),
});

/** The fill-in parts of a template's current version: block design blocks or marked HTML regions. */
export const TemplateDefaultContent = z.object({
  versionId: Id.nullable(), subject: z.string().nullable(),
  regions: z.array(z.object({ key: z.string(), kind: z.string(), content: z.string() })),
});

/** A finished block-to-HTML conversion (the conversion is synchronous, so a job is always complete). */
export const TemplateConversionJob = z.object({ id: Id, status: z.literal('complete'), sourceTemplateId: Id, resultTemplateId: Id.nullable(), createdAt: Timestamp });
export const TemplateConversionJobPage = pageResult(TemplateConversionJob);
