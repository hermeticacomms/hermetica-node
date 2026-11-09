import { z } from 'zod';

/** A tappable chip under an RCS message or card. Text is liquid. Limits follow RCS Business Messaging (25-character chips). */
export const RcsSuggestion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reply'), text: z.string().trim().min(1).max(25) }),
  z.object({ type: z.literal('url'), text: z.string().trim().min(1).max(25), url: z.url().max(2048) }),
  z.object({ type: z.literal('dial'), text: z.string().trim().min(1).max(25), phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'an E.164 phone number') }),
]);
export type RcsSuggestion = z.infer<typeof RcsSuggestion>;

/**
 * Rich content for an SMS template, used when the route's provider speaks RCS (Twilio RCS, Sinch). The template's text is always the
 * SMS fallback, so a phone without RCS (or a failed RCS attempt) still gets the plain message. Title and description are liquid.
 */
export const RcsContent = z.object({
  card: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    mediaUrl: z.url().max(2048).regex(/^https:\/\//, 'an https URL').optional(),
  }).optional(),
  suggestions: z.array(RcsSuggestion).max(4).default([]),
});
export type RcsContent = z.infer<typeof RcsContent>;
