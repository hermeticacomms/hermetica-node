import { z } from 'zod';
import { Id } from './common.ts';

/** Postcard sizes in inches, width x height (landscape). Print vendors add their own bleed. */
export const PostcardSize = z.enum(['6x4', '9x6']);
export type PostcardSize = z.infer<typeof PostcardSize>;

/** Front and back are HTML with Liquid merge tags ({{ profile.firstName }}, {{ address.city }}). */
export const PostcardDesign = z.object({
  size: PostcardSize.default('6x4'),
  front: z.string().trim().min(1).max(200_000),
  back: z.string().trim().min(1).max(200_000),
});
export type PostcardDesign = z.infer<typeof PostcardDesign>;

export const PostalAddressDto = z.object({
  name: z.string(), line1: z.string(), line2: z.string().nullable(), city: z.string(), region: z.string().nullable(), postalCode: z.string(), country: z.string(),
});
export type PostalAddressDto = z.infer<typeof PostalAddressDto>;

/** Proof of the saved design, or of `design` when given (the designer's unsaved edits). */
export const PostcardProofBody = z.object({ profileId: Id.optional(), design: PostcardDesign.optional() });
export const PostcardDesignDto = z.object({ messageId: Id.nullable(), design: PostcardDesign.nullable() });
/** The design rendered for one contact (or with sample values), with the address it would be mailed to. */
export const PostcardProofDto = z.object({
  size: PostcardSize, front: z.string(), back: z.string(), address: PostalAddressDto.nullable(),
  /** Why this contact would be skipped (no or invalid postal address); null when it would be mailed. */
  skipReason: z.string().nullable(),
  warnings: z.array(z.string()),
});

/** Postcard campaign report: where each card is, and why people were skipped. */
export const PostcardReportDto = z.object({
  campaignId: Id,
  byStatus: z.record(z.string(), z.number().int()),
  skipped: z.array(z.object({ reason: z.string(), count: z.number().int() })),
});
