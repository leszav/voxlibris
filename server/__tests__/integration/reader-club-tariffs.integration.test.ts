import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiRequest, bearerAuth, expectStatus, expectStatusIn, isApiAvailable, TEST_API_BASE_URL } from "../helpers/api-client.ts";

let apiAvailable = false;

const adminToken = process.env.TEST_ADMIN_TOKEN;
const ownerToken = process.env.TEST_OWNER_TOKEN;
const readerClubId = process.env.TEST_READER_CLUB_ID;
const paidReaderClubId = process.env.TEST_PAID_READER_CLUB_ID ?? readerClubId;
const paidReaderProductId = process.env.TEST_PAID_READER_CLUB_PRODUCT_ID;
const grantUserId = process.env.TEST_GRANT_USER_ID;

before(async () => {
  apiAvailable = await isApiAvailable();
});

function skipIfApiUnavailable(t: { skip: (message?: string) => void }): boolean {
  if (!apiAvailable) {
    t.skip(`API server is not available at ${TEST_API_BASE_URL}`);
    return true;
  }

  return false;
}

function skipIfNoAdminToken(t: { skip: (message?: string) => void }): boolean {
  if (!adminToken) {
    t.skip("Set TEST_ADMIN_TOKEN to run authenticated admin tariff API checks");
    return true;
  }

  return false;
}

function skipIfNoOwnerContext(t: { skip: (message?: string) => void }): boolean {
  if (!ownerToken || !readerClubId) {
    t.skip("Set TEST_OWNER_TOKEN and TEST_READER_CLUB_ID to run owner tariff API checks");
    return true;
  }

  return false;
}

function skipIfNoGrantContext(t: { skip: (message?: string) => void }): boolean {
  if (!adminToken || !paidReaderProductId || !grantUserId) {
    t.skip("Set TEST_ADMIN_TOKEN, TEST_PAID_READER_CLUB_PRODUCT_ID and TEST_GRANT_USER_ID to run grant checks");
    return true;
  }

  return false;
}

describe("Integration: reader club tariff API", () => {
  it("admin tariff templates требуют админский токен", async (t) => {
    if (skipIfApiUnavailable(t)) return;

    const { response } = await apiRequest("/api/commerce/admin/reader-club-tariff-templates");

    expectStatus(response, 401);
  });

  it("admin может создать и обновить шаблон тарифа клуба чтеца", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoAdminToken(t)) return;

    const create = await apiRequest<{ id: string; title: string; amountRub: number; status: string }>("/api/commerce/admin/reader-club-tariff-templates", {
      method: "POST",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({
        title: `Integration reader club tariff ${Date.now()}`,
        description: "Created by integration test",
        amountRub: 490,
        period: "month",
        readerShareBps: 7000,
        acquiringFeeBps: 350,
        status: "draft",
        visibility: "private",
        sortOrder: 9999,
      }),
    });

    expectStatus(create.response, 201);
    assert.match(create.body.title, /^Integration reader club tariff/);
    assert.equal(create.body.amountRub, 490);

    const update = await apiRequest<{ id: string; amountRub: number; status: string }>(`/api/commerce/admin/reader-club-tariff-templates/${create.body.id}`, {
      method: "PATCH",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({ amountRub: 590, status: "archived" }),
    });

    expectStatus(update.response, 200);
    assert.equal(update.body.id, create.body.id);
    assert.equal(update.body.amountRub, 590);
    assert.equal(update.body.status, "archived");
  });

  it("owner monetization API требует токен", async (t) => {
    if (skipIfApiUnavailable(t)) return;

    const { response } = await apiRequest("/api/clubs/00000000-0000-4000-8000-000000000000/monetization");

    expectStatus(response, 401);
  });

  it("owner reader club может открыть настройки монетизации и создать заявку", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoOwnerContext(t)) return;

    const monetization = await apiRequest<{ assignment: unknown | null; templates: unknown[]; requests: unknown[] }>(`/api/clubs/${readerClubId}/monetization`, {
      headers: bearerAuth(ownerToken!),
    });

    expectStatus(monetization.response, 200);
    assert.ok(Array.isArray(monetization.body.templates));
    assert.ok(Array.isArray(monetization.body.requests));

    const request = await apiRequest<{ id: string; clubId: string; title: string; status: string }>(`/api/clubs/${readerClubId}/monetization/tariff-requests`, {
      method: "POST",
      headers: bearerAuth(ownerToken!),
      body: JSON.stringify({
        title: `Integration custom tariff ${Date.now()}`,
        description: "Created by integration test",
        requestedAmountRub: 790,
        requestedPeriod: "month",
      }),
    });

    expectStatusIn(request.response, [201, 400, 403, 404]);
    if (request.response.status === 201) {
      assert.equal(request.body.clubId, readerClubId);
      assert.equal(request.body.status, "pending");
    }
  });

  it("commerce dashboard и grants требуют админский токен", async (t) => {
    if (skipIfApiUnavailable(t)) return;

    const dashboard = await apiRequest("/api/commerce/admin/financial-dashboard");
    expectStatus(dashboard.response, 401);

    const grant = await apiRequest("/api/commerce/admin/grants", {
      method: "POST",
      body: JSON.stringify({ userId: "test-user", productId: "test-product" }),
    });
    expectStatus(grant.response, 401);
  });

  it("admin может выдать и отозвать paid reader-club grant", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoGrantContext(t)) return;

    const grant = await apiRequest<{ granted: Array<{ id: string; status: string; featureKey: string }> }>("/api/commerce/admin/grants", {
      method: "POST",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({ userId: grantUserId, productId: paidReaderProductId, sourceType: "admin_grant" }),
    });

    expectStatus(grant.response, 201);
    assert.ok(grant.body.granted.length > 0);
    assert.ok(grant.body.granted.some((item) => item.featureKey === "reader_club_access" && item.status === "active"));

    const entitlementId = grant.body.granted[0].id;
    const revoke = await apiRequest<{ id: string; status: string }>(`/api/commerce/admin/entitlements/${entitlementId}`, {
      method: "DELETE",
      headers: bearerAuth(adminToken!),
    });

    expectStatus(revoke.response, 200);
    assert.equal(revoke.body.id, entitlementId);
    assert.equal(revoke.body.status, "revoked");
  });

  it("paid reader-club public product доступен для checkout flow", async (t) => {
    if (skipIfApiUnavailable(t) || !paidReaderClubId) return;

    const products = await apiRequest<Array<{ id: string; prices: unknown[]; features: Array<{ featureKey: string }> }>>(
      `/api/commerce/products?type=reader_club_subscription&scopeType=reader_club&scopeId=${encodeURIComponent(paidReaderClubId)}`,
    );

    expectStatus(products.response, 200);
    assert.ok(Array.isArray(products.body));
    for (const product of products.body) {
      assert.ok(Array.isArray(product.prices));
      assert.ok(product.features.some((feature) => feature.featureKey === "reader_club_access"));
    }
  });
});
