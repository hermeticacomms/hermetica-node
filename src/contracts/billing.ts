import { z } from 'zod';
import { Timestamp } from './common.ts';

/** `profiles` is a gauge, not a counter: the month's peak of active profiles (the overage basis). */
export const USAGE_METRICS = ['sends_email', 'sends_sms', 'sends_whatsapp', 'sends_push', 'sends_postcard', 'ai_tokens', 'profiles'] as const;
export const UsageMetric = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof UsageMetric>;

/** null = unlimited. */
const Limit = z.number().int().nonnegative().nullable();
export const PlanLimits = z.object({ sends_email: Limit, sends_sms: Limit, sends_whatsapp: Limit, sends_push: Limit, sends_postcard: Limit, ai_tokens: Limit, seats: Limit, profiles: Limit, mailboxes: Limit });
export type PlanLimits = z.infer<typeof PlanLimits>;

/** `limits` are hard caps; `includedProfiles` is the band a paid plan bills overage past (null = no band). */
export const PlanDto = z.object({ id: z.string(), name: z.string(), limits: PlanLimits, monthlyUsd: z.number().nullable(), includedProfiles: z.number().int().nullable(), profileOveragePer1kUsd: z.number().nullable() });
export const UsageLine = z.object({ metric: UsageMetric, used: z.number().int(), limit: Limit, softLimit: Limit });
export const BillingSummary = z.object({
  plan: PlanDto,
  status: z.string(),
  period: z.string(),
  currentPeriodEnd: Timestamp.nullable(),
  limits: PlanLimits,
  usage: z.array(UsageLine),
  managedByProvider: z.boolean(),
});
export const SetPlanBody = z.object({ planId: z.string().min(1).max(40), limitOverrides: z.record(z.string(), z.number().int().nonnegative().nullable()).optional() });
export const UrlBody = z.object({ returnUrl: z.url().max(2048) });
export const CheckoutBody = z.object({ planId: z.string().min(1).max(40), successUrl: z.url().max(2048), cancelUrl: z.url().max(2048) });
export const UrlResult = z.object({ url: z.string() });
/** The caller's own link in Hermeticor's referral program (Referalli). `enabled: false` = the program is not configured here. */
/** `percent`/`months` come from the program's published rule (null when Referalli did not answer), so the copy cannot drift from it. */
/** `terms` is Referalli's own summary of the reward per locale (en, es, de, fr, pt, it, nl, ja, …), so tiered or capped rules read right. */
export const MyReferralDto = z.object({ enabled: z.boolean(), code: z.string().nullable(), link: z.string().nullable(), terms: z.record(z.string(), z.string()).nullable() });

/** Stripe Connect payouts (boost bounties, ad network earnings). `configured` false = no platform Stripe account: everything is settled by hand. */
export const PayoutAccountDto = z.object({ configured: z.boolean(), started: z.boolean(), payoutsEnabled: z.boolean(), detailsSubmitted: z.boolean() });
/** `country` (ISO code) of the writer's payout account, asked before the account exists; another country than the platform's gets Stripe's recipient agreement. */
export const PayoutOnboardBody = z.object({ returnUrl: z.url(), country: z.string().trim().length(2).toUpperCase().optional() });
