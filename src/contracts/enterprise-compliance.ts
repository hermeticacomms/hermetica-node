import { z } from 'zod';
import { AppSlug, Id } from './common.ts';

export const RetentionClassParams = z.object({ dataClass: z.string() });
export const RetentionBody = z.object({ retainDays: z.union([z.number().int().min(30).max(3650), z.null(), z.literal('default')]) });
export const RetentionDto = z.object({ dataClass: z.string(), retainDays: z.number().nullable(), isDefault: z.boolean() });

export const DsarParams = z.object({ id: Id });
export const DsarExportDto = z.looseObject({ requestId: Id, exportedAt: z.string() });
export const DsarEraseDto = z.object({ requestId: Id, tombstones: z.number(), counts: z.record(z.string(), z.record(z.string(), z.number())) });
// Rights requests for a workspace profile addressed by any one identifier: export or erase in one call.
const subject = { profileId: Id.optional(), email: z.string().max(320).optional(), phone: z.string().max(40).optional(), externalId: z.string().max(256).optional() };
const hasSubject = (s: { profileId?: string | undefined; email?: string | undefined; phone?: string | undefined; externalId?: string | undefined }) => Boolean(s.profileId || s.email || s.phone || s.externalId);
const subjectMsg = 'Give profileId, email, phone or externalId';
export const PrivacyLookupBody = z.object(subject).refine(hasSubject, subjectMsg);
/** Cookie Munch's conformance canary answers found as `canary_<token>` with `canary: true`; it is never a real profile. */
const SubjectId = z.union([Id, z.string().regex(/^canary_[0-9a-z]{8,64}$/)]);
export const PrivacyLookupDto = z.object({ subjectId: SubjectId.nullable(), status: z.enum(['found', 'no_match']), canary: z.boolean().optional() });
export const PrivacyRequestBody = z.object({
  type: z.enum(['access', 'deletion']), ...subject,
  /**
   * deletion only. `app`: erase one product's data about the person (its events, lists, attributes, messages; the profile goes only when nothing else is left).
   * `workspace`: erase the person everywhere in the workspace. Default: `app` for an app-bound key, `workspace` otherwise.
   */
  scope: z.enum(['app', 'workspace']).optional(),
  /** With scope app from an unbound key: the app to erase. */
  app: AppSlug.optional(),
}).refine(hasSubject, subjectMsg);
/** `no_match`: nobody in this workspace has that identifier (also the answer to a repeated deletion); it still gets an id to poll. */
export const PrivacyRequestDto = z.object({
  id: Id, type: z.enum(['access', 'deletion']), status: z.enum(['completed', 'no_match']), subjectId: SubjectId.nullable(), canary: z.boolean().optional(),
  /** deletion: what was erased (`app` with `app` set, or `workspace`). */
  scope: z.enum(['app', 'workspace']).optional(), app: z.string().optional(), profileDeleted: z.boolean().optional(),
  result: z.unknown().optional(), tombstones: z.number().optional(), counts: z.record(z.string(), z.record(z.string(), z.number())).optional(),
});
/**
 * Poll answer for a request made through /v1/privacy/subjects/requests (or logged in the DSAR log). A completed access request carries
 * `result` for 30 days after completedAt: no copy is kept, it is rebuilt from current data (exportedAt = now). Then `result` is null
 * with `resultExpired`, or with `subjectErased` once the person was erased.
 */
export const PrivacyRequestStatusDto = z.object({
  id: Id, type: z.enum(['access', 'deletion']), status: z.enum(['pending', 'running', 'completed', 'no_match']), subjectId: Id.nullable(),
  receivedAt: z.string(), completedAt: z.string().nullable(), tombstones: z.number().optional(), counts: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  result: DsarExportDto.nullable().optional(), resultExpired: z.boolean().optional(), subjectErased: z.boolean().optional(),
});
/** Forget-app: an app-bound key forgets its own app; a user or unbound key names `app`. */
export const ForgetAppBody = z.object({ app: AppSlug.optional() });
export const ForgetAppDto = z.object({
  app: z.string(),
  /** Rows removed per table (events, list_members, segment_memberships, segment_snapshot_members, form_submissions, campaign_recipients, message_jobs, journeyEnrollments = enrollments in the app's journeys, attributes = attribute keys). */
  removed: z.record(z.string(), z.number()),
  /** Nothing else was left about the person (no other app's data, no consent or suppression records), so the profile was deleted too. */
  profileDeleted: z.boolean(),
  /** By-identifier route only: false when nobody has that identifier (nothing to forget; a retry after success answers the same). */
  found: z.boolean().optional(),
});
export const TrashRetentionBody = z.object({ days: z.number().int().min(0).max(3650) });
export const TrashRetentionDto = z.object({ days: z.number().int() });
export const GpcSettingBody = z.object({ honour: z.boolean() });
export const GpcSettingDto = z.object({ honour: z.boolean() });
