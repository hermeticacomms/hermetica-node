import { z } from 'zod';
import { Id, PageQuery, Timestamp, pageResult } from './common.ts';
import { Block } from './content-blocks.ts';

export const LintIssue = z.object({ code: z.string(), message: z.string() });
export const LintResult = z.object({ errors: z.array(LintIssue), warnings: z.array(LintIssue) });
export type LintResult = z.infer<typeof LintResult>;

export const ReviewBody = z.object({ comment: z.string().max(2000).nullish() });
/** Why this version is transactional although it contains offer wording; kept in the audit log. */
export const TransactionalReviewBody = z.object({ note: z.string().trim().min(3).max(500) });
export const CloneTemplateBody = z.object({ name: z.string().trim().min(1).max(200).optional() });
export const UploadTypeGroup = z.enum(['image', 'pdf', 'video', 'audio', 'document', 'text', 'archive']);
export const AssetAccess = z.enum(['public_indexable', 'public_not_indexable', 'private']);
export const ContentSettingsDto = z.object({ approvalRequired: z.boolean(), campaignApprovalRequired: z.boolean().default(false), transactionalPromo: z.enum(['warn', 'block']).default('warn'), uploadTypes: z.array(UploadTypeGroup).max(7).default(['image', 'pdf', 'video']), defaultAssetAccess: AssetAccess.default('public_indexable') });
export const ContentSettingsPatch = z.object({ approvalRequired: z.boolean(), campaignApprovalRequired: z.boolean(), transactionalPromo: z.enum(['warn', 'block']), uploadTypes: z.array(UploadTypeGroup).max(7), defaultAssetAccess: AssetAccess }).partial();

export const AssetDto = z.object({
  id: Id, filename: z.string(), contentType: z.string(), bytes: z.number(), width: z.number(), height: z.number(), url: z.string(), thumbUrl: z.string().nullable().default(null), altText: z.string().nullable(), folderId: Id.nullable(), language: z.string().nullable(), tags: z.array(z.string()).default([]), scanStatus: z.enum(['unscanned', 'clean', 'quarantined']).default('unscanned'), access: AssetAccess.default('public_indexable'), createdAt: Timestamp,
});
export const FolderDto = z.object({ id: Id, kind: z.enum(['template', 'asset']), name: z.string(), parentId: Id.nullable(), itemCount: z.number(), createdAt: Timestamp });
export const FolderInput = z.object({ name: z.string().trim().min(1).max(200), parentId: Id.nullable().optional() });
export const UpdateFolderBody = FolderInput.partial();
export const UpdateAssetBody = z.object({
  filename: z.string().trim().min(1).max(200).optional(), altText: z.string().max(500).nullable().optional(), folderId: Id.nullable().optional(), language: z.string().trim().min(2).max(35).nullable().optional(), tags: z.array(z.string().max(64)).max(50).optional(), access: AssetAccess.optional(),
});
export const ImportAssetBody = z.object({ url: z.url().max(2048), filename: z.string().trim().min(1).max(200).optional(), folderId: Id.nullable().optional() });
export const ListAssetsQuery = PageQuery.extend({ q: z.string().max(200).optional(), folderId: Id.optional(), tag: z.string().max(64).optional(), language: z.string().max(35).optional(), type: UploadTypeGroup.optional(), access: AssetAccess.optional(), after: Timestamp.optional(), before: Timestamp.optional() });
export const AssetPage = pageResult(AssetDto);

export const TrackingDomainInput = z.object({ domain: z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/) });
export const TrackingDomainDto = z.object({
  id: Id, domain: z.string(), status: z.enum(['pending', 'verified', 'failed']), cnameTarget: z.string(), verifiedAt: Timestamp.nullable(),
  lastCheckedAt: Timestamp.nullable(), lastError: z.string().nullable(), createdAt: Timestamp,
  /** HTTPS certificate on the host. Links use https only once `issued`; until then they go out over http. */
  certStatus: z.enum(['pending', 'issued', 'failed']), certCheckedAt: Timestamp.nullable(), certError: z.string().nullable(),
});
export const TrackingDomainPage = pageResult(TrackingDomainDto);

export const LinkCheckDto = z.object({ url: z.string(), status: z.number().nullable(), error: z.string().nullable(), checkedAt: Timestamp });
export const LinkCheckResult = z.object({ pending: z.boolean(), items: z.array(LinkCheckDto) });

/** `category` is the flow purpose; `industry` groups industry starters; `flow` is the matching flow blueprint key. */
export const GalleryItem = z.object({ key: z.string(), name: z.string(), category: z.string(), description: z.string(), kind: z.enum(['blocks', 'html', 'text', 'sms']), industry: z.string().optional(), flow: z.string().optional() });
export const InstantiateGalleryBody = z.object({ name: z.string().trim().min(1).max(200).optional(), folder: z.string().max(200).nullable().optional() });
export const FolderList = z.object({ folders: z.array(z.string()), items: z.array(FolderDto).default([]) });

/** Reusable block group; templates reference it by id (`saved` block), so editing it updates every template that uses it. */
export const SavedSectionInput = z.object({ name: z.string().trim().min(1).max(200), blocks: z.array(Block).min(1).max(50) });
export const SavedSectionDto = SavedSectionInput.extend({ id: Id, workspaceId: Id, createdAt: Timestamp, updatedAt: Timestamp });
export const SavedSectionPage = pageResult(SavedSectionDto);
export const UpdateSavedSectionBody = SavedSectionInput.partial();
/** `type`: sections with a top-level block of that type (e.g. `button`). Dates bound created / updated; sort keys page by keyset. */
export const ListSavedSectionsQuery = PageQuery.extend({
  q: z.string().max(200).optional(), type: z.string().regex(/^[a-z]{2,20}$/).optional(),
  createdAfter: Timestamp.optional(), createdBefore: Timestamp.optional(), updatedAfter: Timestamp.optional(), updatedBefore: Timestamp.optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'updated']).default('newest'),
});
