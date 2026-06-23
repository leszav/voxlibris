import type { CommercePrice } from "../../shared/schema.js";

export function addCommercePeriod(date: Date, period: CommercePrice['period']) {
  if (period === 'one_time') return null;
  const result = new Date(date);
  if (period === 'week') result.setDate(result.getDate() + 7);
  if (period === 'month') result.setMonth(result.getMonth() + 1);
  if (period === 'quarter') result.setMonth(result.getMonth() + 3);
  if (period === 'year') result.setFullYear(result.getFullYear() + 1);
  return result;
}

export function commerceEntitlementEnd(price: Pick<CommercePrice, 'period'>, existingEndsAt: Date | null | undefined, now = new Date()) {
  const base = existingEndsAt && existingEndsAt > now ? existingEndsAt : now;
  return addCommercePeriod(base, price.period);
}
