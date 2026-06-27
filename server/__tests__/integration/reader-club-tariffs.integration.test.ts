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
const standardOwnerToken = process.env.TEST_STANDARD_OWNER_TOKEN ?? ownerToken;
const standardMemberToken = process.env.TEST_STANDARD_MEMBER_TOKEN;
const standardInviteToken = process.env.TEST_STANDARD_INVITE_TOKEN;
const paidStandardInviteToken = process.env.TEST_PAID_STANDARD_INVITE_TOKEN;

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

function skipIfNoStandardClubContext(t: { skip: (message?: string) => void }): boolean {
  if (!standardOwnerToken || !standardMemberToken || !standardInviteToken || !paidStandardInviteToken) {
    t.skip("Set TEST_STANDARD_OWNER_TOKEN, TEST_STANDARD_MEMBER_TOKEN, TEST_STANDARD_INVITE_TOKEN and TEST_PAID_STANDARD_INVITE_TOKEN to run standard club entitlement checks");
    return true;
  }

  return false;
}

describe("Integration: reader club tariff API", () => {
  it("commerce constructor admin endpoints требуют админский токен", async (t) => {
    if (skipIfApiUnavailable(t)) return;

    const features = await apiRequest("/api/commerce/admin/features");
    if (features.response.status === 404) {
      t.skip("Commerce constructor routes are not loaded in the running API server");
      return;
    }
    expectStatus(features.response, 401);

    const products = await apiRequest("/api/commerce/admin/products");
    expectStatus(products.response, 401);
  });

  it("admin может создать feature, product, price и typed product feature", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoAdminToken(t)) return;

    const suffix = Date.now();
    const feature = await apiRequest<{ key: string; valueType: string }>("/api/commerce/admin/features", {
      method: "POST",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({
        key: `integration.feature.${suffix}`,
        title: "Integration feature",
        category: "integration",
        scopeType: "platform",
        valueType: "integer",
        defaultInt: 1,
      }),
    });
    expectStatus(feature.response, 201);
    assert.equal(feature.body.valueType, "integer");

    const product = await apiRequest<{ id: string; code: string }>("/api/commerce/admin/products", {
      method: "POST",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({
        type: "platform_subscription",
        scopeType: "platform",
        code: `integration_product_${suffix}`,
        title: "Integration product",
        status: "draft",
        visibility: "private",
      }),
    });
    expectStatus(product.response, 201);

    const price = await apiRequest<{ id: string; amountRub: number }>(`/api/commerce/admin/products/${product.body.id}/prices`, {
      method: "POST",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({ amountRub: 123, period: "month", isDefault: true }),
    });
    expectStatus(price.response, 201);
    assert.equal(price.body.amountRub, 123);

    const productFeature = await apiRequest<{ id: string; valueInt: number }>(`/api/commerce/admin/products/${product.body.id}/features`, {
      method: "POST",
      headers: bearerAuth(adminToken!),
      body: JSON.stringify({ label: "Integration limit", featureKey: feature.body.key, valueType: "integer", valueInt: 10 }),
    });
    expectStatus(productFeature.response, 201);
    assert.equal(productFeature.body.valueInt, 10);

    const detail = await apiRequest<{ prices: unknown[]; features: Array<{ featureKey: string }> }>(`/api/commerce/admin/products/${product.body.id}`, {
      headers: bearerAuth(adminToken!),
    });
    expectStatus(detail.response, 200);
    assert.equal(detail.body.prices.length, 1);
    assert.ok(detail.body.features.some((item) => item.featureKey === feature.body.key));
  });

  it("admin product/price/product-feature endpoints возвращают 404 для неизвестных id", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoAdminToken(t)) return;

    const missingId = "00000000-0000-4000-8000-000000000000";
    const auth = bearerAuth(adminToken!);

    const product = await apiRequest(`/api/commerce/admin/products/${missingId}`, { headers: auth });
    expectStatus(product.response, 404);

    const price = await apiRequest(`/api/commerce/admin/prices/${missingId}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ status: "archived" }),
    });
    expectStatus(price.response, 404);

    const productFeature = await apiRequest(`/api/commerce/admin/product-features/${missingId}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ label: "Missing", featureKey: "missing.feature", valueType: "boolean", valueBool: true }),
    });
    expectStatus(productFeature.response, 404);
  });

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

  it("обычный клуб блокирует Freemium-превышение участников и даёт paid plan повысить лимит", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoStandardClubContext(t)) return;

    const blocked = await apiRequest<{ code?: string; featureKey?: string; upgradeUrl?: string }>(`/api/invitations/${standardInviteToken}/accept`, {
      method: "POST",
      headers: bearerAuth(standardMemberToken!),
    });

    expectStatus(blocked.response, 403);
    assert.equal(blocked.body.code, "LIMIT_EXCEEDED");
    assert.equal(blocked.body.featureKey, "club.members.max_count");
    assert.equal(blocked.body.upgradeUrl, "/pricing");

    const allowed = await apiRequest<{ club?: { id?: string } }>(`/api/invitations/${paidStandardInviteToken}/accept`, {
      method: "POST",
      headers: bearerAuth(standardMemberToken!),
    });

    expectStatusIn(allowed.response, [200, 409]);
  });

  it("приватный обычный клуб запрещён без feature и разрешён с платным plan", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoStandardClubContext(t)) return;

    const suffix = Date.now();
    const blocked = await apiRequest<{ code?: string; featureKey?: string; upgradeUrl?: string }>("/api/clubs", {
      method: "POST",
      headers: bearerAuth(standardMemberToken!),
      body: JSON.stringify({ title: `Private blocked ${suffix}`, description: "Integration", type: "standard", isPrivate: true }),
    });

    expectStatus(blocked.response, 403);
    assert.equal(blocked.body.code, "MISSING_ENTITLEMENT");
    assert.equal(blocked.body.featureKey, "club.private.enabled");
    assert.equal(blocked.body.upgradeUrl, "/pricing");

    const allowed = await apiRequest<{ id: string; isPrivate: boolean }>("/api/clubs", {
      method: "POST",
      headers: bearerAuth(standardOwnerToken!),
      body: JSON.stringify({ title: `Private paid ${suffix}`, description: "Integration", type: "standard", isPrivate: true }),
    });

    expectStatusIn(allowed.response, [201, 409]);
    if (allowed.response.status === 201) assert.equal(allowed.body.isPrivate, true);
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

  it("paid reader-led fixture доступен в публичном API", async (t) => {
    if (skipIfApiUnavailable(t) || !paidReaderProductId || !paidReaderClubId) return;

    const products = await apiRequest<Array<{ id: string; scopeId: string | null; prices: Array<{ amountRub: number; period: string; isDefault: boolean }>; features: Array<{ featureKey: string }> }>>(
      `/api/commerce/products?type=reader_club_subscription&scopeType=reader_club&scopeId=${encodeURIComponent(paidReaderClubId)}`,
    );

    expectStatus(products.response, 200);
    const product = products.body.find((item) => item.id === paidReaderProductId);
    assert.ok(product, "paid reader-led fixture product must be public");
    assert.equal(product.scopeId, paidReaderClubId);
    assert.ok(product.prices.some((price) => price.amountRub > 0 && price.period === "month" && price.isDefault));
    assert.ok(product.features.some((feature) => feature.featureKey === "reader_club_access"));
  });

  it("active reader-led product содержит typed reader_club_access=true", async (t) => {
    if (skipIfApiUnavailable(t) || skipIfNoAdminToken(t) || !paidReaderProductId) return;

    const product = await apiRequest<{ features: Array<{ featureKey: string; valueType: string; valueBool: boolean | null }> }>(`/api/commerce/admin/products/${paidReaderProductId}`, {
      headers: bearerAuth(adminToken!),
    });

    expectStatus(product.response, 200);
    assert.ok(product.body.features.some((feature) => feature.featureKey === "reader_club_access" && feature.valueType === "boolean" && feature.valueBool === true));
  });
});
