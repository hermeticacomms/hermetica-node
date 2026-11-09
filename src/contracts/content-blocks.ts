import { z } from 'zod';

/** Block document (editor model, P3 T3.3). Compiled to MJML by @hermetica/content `blocksToMjml`. */
const Hide = z.enum(['mobile', 'desktop']);
const Color = z.string().max(32).regex(/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|transparent)$/);
/** Per-block override applied only where the client honours prefers-color-scheme: dark. */
const Dark = z.object({ background: Color.optional(), color: Color.optional() });
export type DarkOverride = z.infer<typeof Dark>;
const base = { id: z.string().min(1).max(64).optional(), hide: Hide.optional(), dark: Dark.optional() };

/** bestsellers = "popular"; also_bought = "customers also bought" (pluggable recommender); recently_purchased = "buy it again"; most_viewed = "trending"; recommended = per-profile item-to-item picks (nightly); new_arrivals = newest products; collection = products in the store collection named by `category`. */
export const PRODUCT_MODES = ['feed', 'bestsellers', 'recently_viewed', 'related', 'category', 'also_bought', 'recently_purchased', 'most_viewed', 'recommended', 'new_arrivals', 'collection'] as const;
export type ProductMode = (typeof PRODUCT_MODES)[number];

export type Hide = z.infer<typeof Hide>;

type Base = { id?: string; hide?: Hide; dark?: DarkOverride };
export type Block = Base & (
  | { type: 'section'; background?: string; backgroundImage?: string; children: Block[] }
  | { type: 'columns'; columns: Block[][] }
  | { type: 'text'; html: string }
  | { type: 'image'; src: string; alt?: string; href?: string; width?: number; params?: Record<string, string>; brandItemId?: string }
  | { type: 'button'; label: string; href: string; background?: string; color?: string; brandItemId?: string }
  | { type: 'divider' }
  | { type: 'spacer'; height?: number }
  | { type: 'social'; items: { network: string; href: string }[]; brandItemId?: string }
  | { type: 'html'; html: string }
  | { type: 'product'; feedId: string; limit?: number; mode?: ProductMode; category?: string }
  | { type: 'coupon'; poolId: string }
  | { type: 'conditional'; if: string; segmentIds?: string[]; children: Block[] }
  | { type: 'list'; for: string; in: string; children: Block[] }
  | { type: 'menu'; items: { label: string; href: string }[]; align?: 'left' | 'center' | 'right' }
  | { type: 'table'; rows: string[][]; header?: boolean }
  | { type: 'countdown'; to: string; label?: string; expiredText?: string; color?: string; background?: string; fontSize?: number; width?: number; zone?: string }
  | { type: 'saved'; sectionId: string }
  | { type: 'video'; thumbnail: string; href: string; alt?: string; width?: number; label?: string }
  | { type: 'split'; image: string; alt?: string; imageSide?: 'left' | 'right'; html: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'review'; productId: string; label?: string }
  | { type: 'poll'; pollId: string; question: string; options: { id: string; label: string }[] }
  | { type: 'sponsor'; slot?: string; sponsor?: string; headline?: string; body?: string; imageUrl?: string; href?: string; cta?: string }
);

const children = (): z.ZodType<Block[]> => z.array(z.lazy(() => Block)).max(100);

export const Block: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('section'), background: Color.optional(), backgroundImage: z.string().max(2048).optional(), children: children() }),
    z.object({ ...base, type: z.literal('columns'), columns: z.array(children()).min(1).max(4) }),
    z.object({ ...base, type: z.literal('text'), html: z.string().max(100_000) }),
    z.object({ ...base, type: z.literal('image'), src: z.string().max(2048), alt: z.string().max(500).optional(), href: z.string().max(2048).optional(), width: z.number().int().min(1).max(1200).optional(),
      /** Query parameters added to `src` at render; values may hold merge tags (`{{ profile.first_name }}`), URL-encoded per recipient. For personalized image services. */
      params: z.record(z.string().regex(/^[a-zA-Z0-9_]{1,32}$/), z.string().max(200)).refine((r) => Object.keys(r).length <= 10, 'At most 10 parameters').optional(),
      /** A brand logo item: fills src/alt/link/size wherever the block leaves them empty. */
      brandItemId: z.uuid().optional() }),
    // brandItemId: a brand button style (padding, border, font); the block's own colours still win.
    z.object({ ...base, type: z.literal('button'), label: z.string().max(200), href: z.string().max(2048), background: Color.optional(), color: Color.optional(), brandItemId: z.uuid().optional() }),
    z.object({ ...base, type: z.literal('divider') }),
    z.object({ ...base, type: z.literal('spacer'), height: z.number().int().min(1).max(200).optional() }),
    // brandItemId: a brand social group; its links (and custom icons) replace `items` at render.
    z.object({ ...base, type: z.literal('social'), items: z.array(z.object({ network: z.string().max(32), href: z.string().max(2048) })).max(12), brandItemId: z.uuid().optional() }),
    z.object({ ...base, type: z.literal('html'), html: z.string().max(200_000) }),
    z.object({ ...base, type: z.literal('product'), feedId: z.uuid(), limit: z.number().int().min(1).max(24).optional(), mode: z.enum(PRODUCT_MODES).optional(), category: z.string().max(100).optional() }),
    z.object({ ...base, type: z.literal('coupon'), poolId: z.uuid() }),
    // `if` may be empty when segmentIds is set: show to members of ANY listed segment, AND the expression when both are given.
    z.object({ ...base, type: z.literal('conditional'), if: z.string().max(500), segmentIds: z.array(z.uuid()).max(20).optional(), children: children() }),
    // `for`: loop variable; `in`: collection path (products | event.items)
    z.object({ ...base, type: z.literal('list'), for: z.string().regex(/^[a-z_][a-z0-9_]*$/i).max(32), in: z.string().regex(/^[a-z_][a-z0-9_.]*$/i).max(100), children: children() }),
    z.object({ ...base, type: z.literal('menu'), items: z.array(z.object({ label: z.string().max(60), href: z.string().max(2048) })).max(8), align: z.enum(['left', 'center', 'right']).optional() }),
    z.object({ ...base, type: z.literal('table'), rows: z.array(z.array(z.string().max(500)).min(1).max(6)).min(1).max(30), header: z.boolean().optional() }),
    // `to`: ISO-8601 instant. Sends show a live timer image (`/t/cd/<signed>.gif`, drawn at open time with these colours, size and zone label); the text computed at render is its alt and the fallback.
    z.object({ ...base, type: z.literal('countdown'), to: z.iso.datetime({ offset: true }), label: z.string().max(100).optional(), expiredText: z.string().max(200).optional(),
      color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(), background: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
      fontSize: z.number().int().min(10).max(70).optional(), width: z.number().int().min(120).max(600).optional(), zone: z.string().regex(/^[A-Za-z0-9 :+/.-]{1,24}$/).optional() }),
    z.object({ ...base, type: z.literal('saved'), sectionId: z.uuid() }),
    // Video thumbnail: email clients cannot play video, so a still image links out to the video page.
    z.object({ ...base, type: z.literal('video'), thumbnail: z.string().max(2048), href: z.string().max(2048), alt: z.string().max(500).optional(), width: z.number().int().min(1).max(1200).optional(), label: z.string().max(100).optional() }),
    // Image beside text (stacks on mobile); the call-to-action button is optional.
    z.object({ ...base, type: z.literal('split'), image: z.string().max(2048), alt: z.string().max(500).optional(), imageSide: z.enum(['left', 'right']).optional(), html: z.string().max(100_000), ctaLabel: z.string().max(200).optional(), ctaHref: z.string().max(2048).optional() }),
    // Star rating and review count for one catalog product, from published reviews; renders nothing until the product has a review.
    z.object({ ...base, type: z.literal('review'), productId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/), label: z.string().max(100).optional() }),
    // Poll (engagement module): each option is a signed one-vote link; the poll itself lives in `surveys`.
    z.object({ ...base, type: z.literal('poll'), pollId: z.uuid(), question: z.string().max(500), options: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: z.string().max(200) })).min(2).max(20) }),
    // Sponsor ad: `slot` is filled with a booked or network ad at send/render time (sponsorships module); the other fields hold the ad itself. Renders nothing without headline and href.
    z.object({ ...base, type: z.literal('sponsor'), slot: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(), sponsor: z.string().max(200).optional(), headline: z.string().max(200).optional(), body: z.string().max(1000).optional(), imageUrl: z.string().max(2048).optional(), href: z.string().max(2048).optional(), cta: z.string().max(60).optional() }),
  ]),
);

/** A language variant: replaces the base blocks (and optionally subject/preheader) for recipients whose locale matches the key (`fr`, `pt-BR`). */
export const Translation = z.object({ subject: z.string().max(998).optional(), preheader: z.string().max(500).optional(), blocks: z.array(Block).max(100) });
export type Translation = z.infer<typeof Translation>;
export const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export const BlockDoc = z.object({
  version: z.literal(1).default(1),
  width: z.number().int().min(320).max(800).default(600),
  background: Color.optional(),
  blocks: z.array(Block).max(100),
  translations: z.record(z.string().regex(LOCALE_RE), Translation).optional(),
});
export type BlockDoc = z.infer<typeof BlockDoc>;
