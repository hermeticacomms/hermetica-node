import { z } from 'zod';
import { Timestamp } from './common.ts';

export const USAGE_METRICS = ['sends_email', 'sends_sms', 'sends_whatsapp', 'sends_push', 'ai_tokens'] as const;
export const UsageMetric = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof UsageMetric>;

/** null = unlimited. */
const Limit = z.number().int().nonnegative().nullable();
export const PlanLimits = z.object({ sends_email: Limit, sends_sms: Limit, sends_whatsapp: Limit, sends_push: Limit, ai_tokens: Limit, seats: Limit });
export type PlanLimits = z.infer<typeof PlanLimits>;

export const PlanDto = z.object({ id: z.string(), name: z.string(), limits: PlanLimits });
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
