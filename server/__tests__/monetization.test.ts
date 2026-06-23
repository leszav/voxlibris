import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addCommercePeriod, commerceEntitlementEnd } from "../services/commerce-periods.ts";
import { buildRenewalReminder, daysBeforeEntitlementEnd, shouldCreateRenewalReminder } from "../services/commerce-renewal-reminders.ts";

describe("Commerce monetization helpers", () => {
  it("рассчитывает окончание доступа по периодам", () => {
    const base = new Date("2026-06-19T00:00:00.000Z");

    assert.equal(addCommercePeriod(base, "week")?.toISOString(), "2026-06-26T00:00:00.000Z");
    assert.equal(addCommercePeriod(base, "month")?.toISOString(), "2026-07-19T00:00:00.000Z");
    assert.equal(addCommercePeriod(base, "quarter")?.toISOString(), "2026-09-19T00:00:00.000Z");
    assert.equal(addCommercePeriod(base, "year")?.toISOString(), "2027-06-19T00:00:00.000Z");
    assert.equal(addCommercePeriod(base, "one_time"), null);
  });

  it("продлевает активный доступ от текущего endsAt, а истёкший — от now", () => {
    const now = new Date("2026-06-19T00:00:00.000Z");
    const activeEndsAt = new Date("2026-06-29T00:00:00.000Z");
    const expiredEndsAt = new Date("2026-06-01T00:00:00.000Z");

    assert.equal(commerceEntitlementEnd({ period: "week" }, activeEndsAt, now)?.toISOString(), "2026-07-06T00:00:00.000Z");
    assert.equal(commerceEntitlementEnd({ period: "week" }, expiredEndsAt, now)?.toISOString(), "2026-06-26T00:00:00.000Z");
  });

  it("готовит renewal reminder только за последние 5 дней и dedupe по daysBeforeEnd", () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const endsAt = new Date("2026-06-25T00:01:00.000Z");

    assert.equal(daysBeforeEntitlementEnd(endsAt, now), 5);
    assert.equal(shouldCreateRenewalReminder(new Set([4, 3]), 5), true);
    assert.equal(shouldCreateRenewalReminder(new Set([5]), 5), false);
    assert.equal(shouldCreateRenewalReminder(new Set(), 6), false);

    const reminder = buildRenewalReminder({
      entitlementId: "entitlement-1",
      userId: "user-1",
      clubId: "club-1",
      clubTitle: "Тестовый клуб",
      endsAt,
    }, "https://voxlibris.ru/", now);

    assert.equal(reminder?.daysBeforeEnd, 5);
    assert.equal(reminder?.actionUrl, "https://voxlibris.ru/clubs/club-1");
    assert.match(reminder?.message ?? "", /Тестовый клуб/);
  });
});
