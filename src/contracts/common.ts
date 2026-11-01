import { z } from 'zod';

export const Id = z.uuid();
export const IdParams = z.object({ id: Id });

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const pageResult = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.uuid().nullable() });

/** One Reply-To address, or up to 5 separated by commas (replies go to all of them). */
export const ReplyToList = z.string().trim().max(1000).refine((v) => { const p = v.split(',').map((x) => x.trim()); return p.length <= 5 && p.every((x) => z.email().safeParse(x).success); }, { message: 'Enter up to 5 valid email addresses separated by commas' });

export const Timestamp = z.iso.datetime({ offset: true });
export const Channel = z.enum(['email', 'sms', 'whatsapp', 'push']);
/** Channels whose address is a phone number (E.164). */
export const isPhoneChannel = (c: Channel): boolean => c === 'sms' || c === 'whatsapp';
export type Channel = z.infer<typeof Channel>;
/** Every send has exactly one purpose; purpose selects policy (brief §10.1). */
export const Purpose = z.enum(['marketing', 'prospecting', 'transactional', 'operational']);
export type Purpose = z.infer<typeof Purpose>;

/** Free-form typed attribute bag (profiles, events, objects). */
export const Attributes = z.record(z.string().max(128), z.unknown());

export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }),
});
