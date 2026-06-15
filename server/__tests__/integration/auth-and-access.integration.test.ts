import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { apiRequest, expectStatus, expectStatusIn, isApiAvailable, TEST_API_BASE_URL } from "../helpers/api-client.ts";

let apiAvailable = false;

before(async () => {
  apiAvailable = await isApiAvailable();
});

describe("Integration: auth and protected API boundaries", () => {
  it("GET /api/auth/me без токена возвращает 401", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ code?: string; message?: string }>("/api/auth/me");

    expectStatus(response, 401);
    assert.equal(body.code, "NO_TOKEN");
  });

  it("GET /api/clubs без токена возвращает 401", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response } = await apiRequest("/api/clubs");

    expectStatus(response, 401);
  });

  it("GET /api/user/clubs без токена возвращает 401", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response } = await apiRequest("/api/user/clubs");

    expectStatus(response, 401);
  });

  it("GET /api/user/books без токена возвращает 401", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response } = await apiRequest("/api/user/books");

    expectStatus(response, 401);
  });

  it("POST /api/books без токена возвращает 401", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response } = await apiRequest("/api/books", {
      method: "POST",
      body: JSON.stringify({ title: "Integration Test Book", author: "VoxLibris" }),
    });

    expectStatus(response, 401);
  });

  it("POST /api/auth/login без логина/email возвращает 400", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "Password123" }),
    });

    expectStatusIn(response, [400, 429]);
    if (response.status === 400) {
      assert.equal(typeof body.message, "string");
      assert.ok(body.message.length > 0);
    }
  });

  it("POST /api/auth/register с некорректным email возвращает 400", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string; errors?: unknown[] }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ displayName: "Тестовый Пользователь", email: "bad-email", password: "Password123" }),
    });

    expectStatusIn(response, [400, 429]);
    if (response.status === 400) {
      assert.ok(body.message || Array.isArray(body.errors));
    }
  });

  it("POST /api/auth/forgot-password с пустым body возвращает 400", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string; errors?: unknown[] }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expectStatusIn(response, [400, 429]);
    if (response.status === 400) {
      assert.ok(body.message || Array.isArray(body.errors));
    }
  });

  it("POST /api/auth/reset-password с пустым body возвращает 400", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string; errors?: unknown[] }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expectStatusIn(response, [400, 429]);
    if (response.status === 400) {
      assert.ok(body.message || Array.isArray(body.errors));
    }
  });

  it("POST /api/auth/refresh без cookie возвращает 401", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string }>("/api/auth/refresh", { method: "POST" });

    expectStatus(response, 401);
    assert.match(body.message ?? "", /refresh token/i);
  });

  it("POST /api/auth/logout без cookie безопасно возвращает 200", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ message?: string }>("/api/auth/logout", { method: "POST" });

    expectStatus(response, 200);
    assert.match(body.message ?? "", /выход|logout/i);
  });

  it("POST /api/v1/feedback с невалидными данными возвращает 400 до отправки email", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ success?: boolean; errors?: unknown[] }>("/api/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ name: "", email: "bad", subject: "bug", message: "short" }),
    });

    expectStatus(response, 400);
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors));
  });

  it("POST /api/v1/guest/restore с плохим кодом возвращает 400 или 404/disabled без 500", async (t) => {
    if (!apiAvailable) return t.skip(`API server is not available at ${TEST_API_BASE_URL}`);

    const { response, body } = await apiRequest<{ code?: string; message?: string }>("/api/v1/guest/restore", {
      method: "POST",
      body: JSON.stringify({ code: "bad" }),
    });

    expectStatusIn(response, [400, 404, 429]);
    if (response.status !== 429) {
      assert.ok(body.code || body.message);
    }
  });
});
