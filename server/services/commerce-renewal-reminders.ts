const REMINDER_DAYS = [5, 4, 3, 2, 1] as const;

export interface RenewalReminderCandidate {
  entitlementId: string;
  userId: string;
  clubId: string;
  clubTitle: string;
  endsAt: Date;
}

export interface RenewalReminderPayload extends RenewalReminderCandidate {
  daysBeforeEnd: number;
  message: string;
  actionUrl: string;
}

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function daysBeforeEntitlementEnd(endsAt: Date, now = new Date()): number {
  return Math.ceil((startOfUtcDay(endsAt) - startOfUtcDay(now)) / 86_400_000);
}

export function buildRenewalReminder(candidate: RenewalReminderCandidate, baseUrl: string, now = new Date()): RenewalReminderPayload | null {
  const daysBeforeEnd = daysBeforeEntitlementEnd(candidate.endsAt, now);
  if (!REMINDER_DAYS.includes(daysBeforeEnd as typeof REMINDER_DAYS[number])) return null;

  return {
    ...candidate,
    daysBeforeEnd,
    message: `До окончания подписки на клуб «${candidate.clubTitle}» осталось ${daysBeforeEnd} дн. Продлите подписку.`,
    actionUrl: `${baseUrl.replace(/\/$/, '')}/clubs/${candidate.clubId}`,
  };
}

export function shouldCreateRenewalReminder(existingDays: Set<number>, daysBeforeEnd: number): boolean {
  return REMINDER_DAYS.includes(daysBeforeEnd as typeof REMINDER_DAYS[number]) && !existingDays.has(daysBeforeEnd);
}
