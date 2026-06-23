import assert from "node:assert/strict";

export const TEST_API_BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:5000";

export type ApiResponse<T = unknown> = {
  response: Response;
  body: T;
};

const REQUEST_DELAY_MS = Number.parseInt(process.env.TEST_API_REQUEST_DELAY_MS ?? "1200", 10);
let lastRequestAt = 0;

async function throttleApiRequests(): Promise<void> {
  if (!Number.isFinite(REQUEST_DELAY_MS) || REQUEST_DELAY_MS <= 0) {
    return;
  }

  const elapsed = Date.now() - lastRequestAt;
  const delay = REQUEST_DELAY_MS - elapsed;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestAt = Date.now();
}

export function apiUrl(path: string): string {
  return new URL(path, TEST_API_BASE_URL).toString();
}

export async function isApiAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_500);
    const response = await fetch(apiUrl("/api/health"), { signal: controller.signal });
    clearTimeout(timeout);

    return response.ok;
  } catch {
    return false;
  }
}

export async function apiRequest<T = unknown>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  await throttleApiRequests();

  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json() as T
    : await response.text() as T;

  return { response, body };
}

export function bearerAuth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export function expectStatus(response: Response, expectedStatus: number): void {
  assert.equal(
    response.status,
    expectedStatus,
    `Expected HTTP ${expectedStatus}, got ${response.status} for ${response.url}`,
  );
}

export function expectStatusIn(response: Response, expectedStatuses: number[]): void {
  assert.ok(
    expectedStatuses.includes(response.status),
    `Expected one of HTTP ${expectedStatuses.join(", ")}, got ${response.status} for ${response.url}`,
  );
}
