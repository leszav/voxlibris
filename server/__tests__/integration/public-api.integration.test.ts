import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { apiRequest, expectStatus, expectStatusIn, isApiAvailable, TEST_API_BASE_URL } from "../helpers/api-client.ts";

let apiAvailable = false;

before(async () => {
  apiAvailable = await isApiAvailable();
});

describe("Integration: public API smoke", () => {
  it("GET /api/health возвращает рабочий health-check", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ status: string; timestamp: string }>("/api/health");

    expectStatus(response, 200);
    assert.equal(body.status, "ok");
    assert.ok(Date.parse(body.timestamp) > 0);
  });

  it("GET /api/books возвращает JSON-список книг", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ books: unknown[] }>("/api/books");

    expectStatus(response, 200);
    assert.ok(Array.isArray(body.books));
  });

  it("GET /api/books/search без q валидируется как 400", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string }>("/api/books/search");

    expectStatus(response, 400);
    assert.match(body.message ?? "", /q|поиск|обязател/i);
  });

  it("GET /api/search/global с коротким запросом возвращает пустые группы без 500", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ query: string; results: Record<string, unknown[]> }>("/api/search/global?q=a");

    expectStatus(response, 200);
    assert.equal(body.query, "a");
    assert.ok(Array.isArray(body.results.books));
    assert.ok(Array.isArray(body.results.clubs));
    assert.ok(Array.isArray(body.results.users));
  });

  it("GET /api/clubs/catalog публично отдаёт массив каталога", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<unknown[]>("/api/clubs/catalog?limit=5");

    expectStatus(response, 200);
    assert.ok(Array.isArray(body));
  });

  it("GET /api/clubs/landing-reader-clubs/status отдаёт публичный feature flag", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ enabled: boolean }>("/api/clubs/landing-reader-clubs/status");

    expectStatus(response, 200);
    assert.equal(typeof body.enabled, "boolean");
  });

  it("GET /api/presence/club/:clubId возвращает список online user ids", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ success: boolean; onlineUserIds: string[] }>("/api/presence/club/test-club-id");

    expectStatus(response, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.onlineUserIds));
  });

  it("GET /api/users/search с коротким q возвращает 400", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ success: boolean; error?: string }>("/api/users/search?q=a");

    expectStatus(response, 400);
    assert.equal(body.success, false);
    assert.match(body.error ?? "", /at least 2/i);
  });

  it("GET /api/books/:id для отсутствующей книги возвращает 404, а не 500", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string }>("/api/books/00000000-0000-4000-8000-000000000000");

    expectStatusIn(response, [404]);
    assert.match(body.message ?? "", /не найден|not found/i);
  });
});
