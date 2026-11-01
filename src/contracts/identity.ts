import { z } from 'zod';
import { Attributes, Channel, Id, ReplyToList, Timestamp, pageResult } from './common.ts';

const str = z.string().max(256).nullable();

export const StandardFieldsInput = z.object({
  firstName: str.optional(),
  lastName: str.optional(),
  timezone: str.optional(),
  locale: str.optional(),
  country: str.optional(),
  city: str.optional(),
  region: str.optional(),
  lifecycleStage: str.optional(),
  ownerUserId: z.uuid().nullable().optional(),
});

export const ProfileIdentifiersInput = z.object({
  email: z.string().max(320).optional(),
  phone: z.string().max(40).optional(),
  externalId: z.string().min(1).max(256).optional(),
  anonymousId: z.string().min(1).max(256).optional(),
});

export const UpsertProfileBody = z.object({
  identifiers: ProfileIdentifiersInput,
  attributes: Attributes.optional(),
  standard: StandardFieldsInput.optional(),
  source: z.string().min(1).max(64).default('api'),
  /** Use your own key: the key of a unique custom field (for example customer_number). When no identifier matches, the person whose field holds the value given in `attributes` is updated instead of a new one being created. */
  matchAttribute: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/).optional(),
  /** `true` opts the contact out of marketing email (consent revoked, address suppressed). There is no `false`: only the person can opt back in, through a consent form. */
  unsubscribed: z.literal(true).optional(),
});

export const UpdateProfileBody = StandardFieldsInput.extend({ attributes: Attributes.optional() });

export const ProfileDto = z.object({
  id: Id,
  emailPrimary: z.string().nullable(),
  phonePrimary: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  timezone: z.string().nullable(),
  locale: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  source: z.string().nullable(),
  lifecycleStage: z.string().nullable(),
  ownerUserId: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  mergedIntoId: z.string().nullable(),
  archivedAt: Timestamp.nullish(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const ProfilePage = pageResult(ProfileDto);

export const UpsertProfileResult = z.object({ profile: ProfileDto, created: z.boolean(), conflicts: z.array(Id) });

/** Profile filters shared by `GET /v1/profiles`, list members, counts and bulk selectors. */
export const ProfileFilterFields = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(64).optional(),
  /** Comma separated: profile has any / all of these tags. */
  tagsAny: z.string().max(640).optional(),
  tagsAll: z.string().max(640).optional(),
  listId: z.uuid().optional(),
  /** Exact normalized match. */
  email: z.string().max(320).optional(),
  phone: z.string().max(40).optional(),
  createdSince: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  updatedSince: z.coerce.date().optional(),
  updatedBefore: z.coerce.date().optional(),
  /** Any custom attribute: `attrKey` compared to `attrValue` (numbers compare numerically). */
  attrKey: z.string().max(128).optional(),
  attrOp: z.enum(['eq', 'contains', 'gt', 'lt']).default('eq'),
  attrValue: z.string().max(500).optional(),
  /** VIP / starred = attribute `vip` is true. */
  vip: z.enum(['true', 'false']).optional(),
  /** Profiles with a consent state in this status (`none` = no consent record). Narrow with `consentChannel`. */
  consentStatus: z.enum(['granted', 'revoked', 'pending_confirmation', 'none']).optional(),
  consentChannel: Channel.optional(),
  /** Consent state last changed on/after this instant. */
  consentSince: z.coerce.date().optional(),
  /** Interest: granted consent on this topic. */
  topicId: z.uuid().optional(),
  /** Location (exact, case-insensitive). */
  country: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  /** Current member of this saved segment (by its last evaluation). */
  segmentId: z.uuid().optional(),
  /** Has this event (optionally inside a time window). */
  eventName: z.string().max(128).optional(),
  eventSince: z.coerce.date().optional(),
  eventBefore: z.coerce.date().optional(),
  /** Profile.source, e.g. `import:<id>` or `form:<id>`. */
  source: z.string().max(128).optional(),
  /** Archived contacts are hidden unless asked for. */
  archived: z.enum(['only', 'include']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});
export type ProfileFilterFields = z.infer<typeof ProfileFilterFields>;

export const ListProfilesQuery = ProfileFilterFields.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});
export const ProfileCount = z.object({ count: z.number().int() });
export const ProfileListMembership = z.object({ id: Id, name: z.string() });
export const ProfileMemberships = z.object({ lists: z.array(ProfileListMembership), segments: z.array(ProfileListMembership) });

export const ListSizeHistoryQuery = z.object({ days: z.coerce.number().int().min(2).max(365).default(30) });
export const ListSizeHistory = z.object({ items: z.array(z.object({ day: z.string(), size: z.number().int(), added: z.number().int().default(0), removed: z.number().int().default(0) })) });
export const MembershipsBatchBody = z.object({ profileIds: z.array(Id).min(1).max(100) });
export const MembershipsBatchResult = z.object({ items: z.array(z.object({ profileId: Id }).extend(ProfileMemberships.shape)) });

export const MergeBody = z.object({ mergedId: Id });
export const NoteKind = z.enum(['note', 'email', 'call', 'meeting']);
export const NoteBody = z.object({ body: z.string().min(1).max(10_000), kind: NoteKind.default('note') });
export const NoteDto = z.object({ id: Id, profileId: Id, authorId: z.string(), body: z.string(), kind: NoteKind.default('note'), at: Timestamp, updatedAt: Timestamp.nullish() });
export const NoteParams = z.object({ id: Id, noteId: Id });
export const NotePage = pageResult(NoteDto);
export const ActivityDto = z.object({
  id: Id,
  profileId: Id,
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  summary: z.string(),
  data: z.unknown(),
  at: Timestamp,
});
export const ActivityPage = pageResult(ActivityDto);
export const TagsBody = z.object({ names: z.array(z.string().min(1).max(64)).min(1).max(100) });
export const TagsResult = z.object({ tags: z.array(z.string()) });

/** Per-list settings (Mailchimp parity). All optional; stored as one JSON bag. */
export const ListSettings = z.object({
  doubleOptIn: z.boolean().optional(),
  /** Subscribe by email: a mail to this address (on one of your inbound domains) starts this list's double opt-in for the sender. Needs double opt-in; nothing is granted until they confirm. Empty clears it. */
  subscribeAddress: z.union([z.email(), z.literal('')]).optional(),
  permissionReminder: z.string().max(1000).optional(),
  defaultFromName: z.string().max(200).optional(),
  defaultFromEmail: z.string().max(320).optional(),
  defaultSubject: z.string().max(300).optional(),
  /** Fills an unset reply-to on campaigns sent to this list (the message and the template's brand default win). Empty clears it. */
  defaultReplyTo: z.union([ReplyToList, z.literal('')]).optional(),
  /** When set, forms that put people on this list may only apply these tags; others are dropped. Empty = no limit. */
  allowedFormTags: z.array(z.string().min(1).max(64)).max(100).optional(),
  defaultLanguage: z.string().max(16).optional(),
  companyName: z.string().max(200).optional(),
  contactAddress: z.string().max(500).optional(),
  /** A saved address record printed in the footer of marketing email sent to this list (beats the workspace address). Empty clears it. */
  postalAddressId: z.union([z.uuid(), z.literal('')]).optional(),
  footer: z.string().max(2000).optional(),
  /** Public contact email and homepage, printed with the address on the preference page. */
  contactEmail: z.union([z.email(), z.literal('')]).optional(),
  homepageUrl: z.union([z.url(), z.literal('')]).optional(),
  /** Campaigns to this list reach only members who are also in this segment. Empty clears it. */
  segmentScopeId: z.union([z.uuid(), z.literal('')]).optional(),
  /** How the hosted unsubscribe link behaves: `confirm` (default) asks first; `one_click` unsubscribes straight away on a POST from the mail client or the page button. A GET never changes anything. */
  unsubscribeMode: z.enum(['confirm', 'one_click']).optional(),
  /** Where people land after confirming an unsubscribe from this list. Empty = the workspace page. */
  unsubscribeRedirectUrl: z.union([z.url(), z.literal('')]).optional(),
  /** Text shown on the page people see after unsubscribing from this list (plain text; it never replaces the confirmation itself). */
  unsubscribedMessage: z.string().max(1000).optional(),
  notifyOnSubscribe: z.string().max(320).optional(),
  notifyOnUnsubscribe: z.string().max(320).optional(),
  archived: z.boolean().optional(),
  /** One emoji shown beside the list name so lists are easy to tell apart. */
  emoji: z.string().max(8).optional(),
  /** Opt-in: shown on the public lists page (/p/lists/<workspaceId>). Ignored for double opt-in lists. */
  publicDirectory: z.boolean().optional(),
  /** Temporary list: from this instant it behaves as archived (no new members, not targetable, hidden from the public directory). Empty string clears it. */
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.literal('')]).optional(),
});
export type ListSettings = z.infer<typeof ListSettings>;
export const CreateListBody = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).nullable().optional(), settings: ListSettings.optional(), folderId: Id.nullable().optional() });
export const UpdateListBody = CreateListBody.partial();
export const ListDto = z.object({ id: Id, name: z.string(), description: z.string().nullable(), kind: z.string(), settings: ListSettings, tags: z.array(z.string()).optional(), folderId: Id.nullable().optional(), createdAt: Timestamp });
export const ListWithCount = ListDto.extend({ memberCount: z.number().int() });
export const ListMembersBody = z.object({ profileIds: z.array(Id).min(1).max(1000) });
export const ListMembersResult = z.object({ changed: z.array(Id) });
/** Free-form data stored on one person's membership of one list (for example a plan or a table number). */
export const ListMemberMetaBody = z.object({ meta: z.record(z.string().min(1).max(64), z.unknown()).refine((m) => JSON.stringify(m).length <= 8000, 'Membership data is limited to 8 KB') });
export const ListMemberMetaDto = z.object({ listId: Id, profileId: Id, meta: z.record(z.string(), z.unknown()), addedAt: Timestamp, source: z.string().nullable() });
/** Either explicit ids, or a name search: every non-deleted list whose name contains it (max 200). */
export const ListsBatchDeleteBody = z.object({ ids: z.array(Id).min(1).max(200).optional(), search: z.string().trim().min(1).max(100).optional() })
  .refine((b) => !!b.ids !== !!b.search, { message: 'Send either ids or search' });
export const ListsBatchDeleteResult = z.object({ deleted: z.array(Id) });

export const ListJoinOrderQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(80).optional() });
export const ListJoinOrderPage = z.object({ items: z.array(ListMemberMetaDto), nextCursor: z.string().nullable() });
