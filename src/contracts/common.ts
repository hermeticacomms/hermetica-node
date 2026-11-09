import { z } from 'zod';

export const Id = z.uuid();
export const IdParams = z.object({ id: Id });

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

type Undefaulted<T> = T extends z.ZodDefault<infer I extends z.core.SomeType> ? I : T;
/** `.partial()` without the `.default()`s: zod 4 keeps them, so a PATCH would reset every key the caller left out. */
export const patchOf = <S extends z.ZodRawShape, C extends z.core.$ZodObjectConfig>(schema: z.ZodObject<S, C>) =>
  schema.extend(Object.fromEntries(Object.entries(schema.shape).map(([k, s]) => [k, s instanceof z.ZodDefault ? s.unwrap() : s]))).partial() as unknown as z.ZodObject<{ -readonly [K in keyof S]: z.ZodOptional<Undefaulted<S[K]>> }, C>;

export const pageResult = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.uuid().nullable() });

/** One Reply-To address, or up to 5 separated by commas (replies go to all of them). */
export const ReplyToList = z.string().trim().max(1000).refine((v) => { const p = v.split(',').map((x) => x.trim()); return p.length <= 5 && p.every((x) => z.email().safeParse(x).success); }, { message: 'Enter up to 5 valid email addresses separated by commas' });

export const Timestamp = z.iso.datetime({ offset: true });

// D-PLAT-21 / D-MKT-17: every date input takes ISO 8601, typed in the OpenAPI. Codecs (not transforms) so DTOs that reuse them still encode.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_OR_TIME = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
/** A calendar day `YYYY-MM-DD`; an ISO 8601 date-time is accepted too and reduced to its date part. */
export const IsoDay = z.codec(
  z.string().regex(DAY_OR_TIME, 'Use a date like 2026-11-30 (an ISO 8601 date-time also works)').meta({ format: 'date' }),
  z.string().regex(DAY),
  { decode: (s) => s.slice(0, 10), encode: (s) => s },
);
/** An instant (ISO 8601 date-time with offset); a bare `YYYY-MM-DD` is accepted and read as midnight UTC. */
export const TimestampIn = z.codec(
  z.union([Timestamp, z.string().regex(DAY)], { error: 'Use an ISO 8601 date-time like 2026-11-04T15:00:00Z, or a date like 2026-11-04' }).meta({ type: 'string', format: 'date-time' }),
  Timestamp,
  { decode: (s) => (DAY.test(s) ? `${s}T00:00:00Z` : s), encode: (s) => s },
);
/** `z.coerce.date()` (still takes everything `Date` parses) documented as an ISO 8601 date-time, with a readable error. */
export const DateTimeIn = () => z.coerce.date({ error: 'Use an ISO 8601 date-time like 2026-11-04T15:00:00Z' }).meta({ type: 'string', format: 'date-time' });
/** `postcard`: printed mail through a bring-your-own print vendor; the destination is the profile (its postal address is read at send time). */
/** Which of your products sent an event, when several share one workspace (`forgedeck`, `formflow`). Lowercase slug. */
export const AppSlug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Use a lowercase slug like forgedeck or form-flow');
export const Channel = z.enum(['email', 'sms', 'whatsapp', 'push', 'postcard']);
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
