import process from "node:process";

type EndpointResult = {
  path: string;
  requests: number;
  ok: number;
  failed: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx] ?? 0;
}

async function runEndpointLoad(
  baseUrl: string,
  path: string,
  totalRequests: number,
  concurrency: number,
  authToken?: string,
  forwardedFor?: string,
): Promise<EndpointResult> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
  const latencies: number[] = [];
  let ok = 0;
  let failed = 0;
  let cursor = 0;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (forwardedFor) {
    headers["X-Forwarded-For"] = forwardedFor;
  }

  const worker = async () => {
    while (true) {
      const requestIndex = cursor++;
      if (requestIndex >= totalRequests) {
        break;
      }

      const startedAt = performance.now();
      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
        });
        const duration = performance.now() - startedAt;
        latencies.push(duration);
        if (response.ok) {
          ok += 1;
        } else {
          failed += 1;
        }
      } catch {
        const duration = performance.now() - startedAt;
        latencies.push(duration);
        failed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  latencies.sort((a, b) => a - b);
  const total = latencies.length;
  const sum = latencies.reduce((acc, value) => acc + value, 0);

  return {
    path: normalizedPath,
    requests: total,
    ok,
    failed,
    errorRate: total > 0 ? (failed / total) * 100 : 0,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    min: latencies[0] ?? 0,
    max: latencies[latencies.length - 1] ?? 0,
    avg: total > 0 ? sum / total : 0,
  };
}

function printSummary(baseUrl: string, results: EndpointResult[]): void {
  console.log(`\nQA Load Smoke for ${baseUrl}`);
  console.log(
    "path".padEnd(28) +
      "req".padStart(6) +
      "ok".padStart(6) +
      "fail".padStart(8) +
      "err%".padStart(8) +
      "p50".padStart(10) +
      "p95".padStart(10) +
      "p99".padStart(10) +
      "avg".padStart(10),
  );
  console.log("-".repeat(96));

  for (const result of results) {
    console.log(
      result.path.slice(0, 27).padEnd(28) +
        String(result.requests).padStart(6) +
        String(result.ok).padStart(6) +
        String(result.failed).padStart(8) +
        result.errorRate.toFixed(2).padStart(8) +
        result.p50.toFixed(1).padStart(10) +
        result.p95.toFixed(1).padStart(10) +
        result.p99.toFixed(1).padStart(10) +
        result.avg.toFixed(1).padStart(10),
    );
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
  const endpointsRaw = process.env.QA_ENDPOINTS ?? "/api/health,/api/books,/api/clubs/catalog";
  const endpoints = endpointsRaw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const warmup = parsePositiveInt(process.env.QA_WARMUP, 5);
  const totalRequests = parsePositiveInt(process.env.QA_REQUESTS, 100);
  const concurrency = parsePositiveInt(process.env.QA_CONCURRENCY, 10);
  const authToken = process.env.QA_AUTH_TOKEN;
  const forwardedFor = process.env.QA_X_FORWARDED_FOR;

  if (endpoints.length === 0) {
    throw new Error("No endpoints configured. Set QA_ENDPOINTS.");
  }

  console.log(
    `Starting QA smoke: base=${baseUrl}, endpoints=${endpoints.length}, warmup=${warmup}, requests=${totalRequests}, concurrency=${concurrency}`,
  );

  const results: EndpointResult[] = [];
  for (const endpoint of endpoints) {
    const normalizedPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
    for (let i = 0; i < warmup; i += 1) {
      try {
        await fetch(url, {
          method: "GET",
          headers:
            authToken || forwardedFor
              ? {
                  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                  ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
                }
              : undefined,
        });
      } catch {
        // Warmup errors are ignored in summary.
      }
    }

    const result = await runEndpointLoad(
      baseUrl,
      normalizedPath,
      totalRequests,
      concurrency,
      authToken,
      forwardedFor,
    );
    results.push(result);
  }

  printSummary(baseUrl, results);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("QA smoke failed:", message);
  process.exit(1);
});
