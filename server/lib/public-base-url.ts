import { logger } from "./logger.js";
import { storage } from "../repositories/index.js";

const PLATFORM_CANONICAL_URL_KEY = "platform.canonical_url";
const CANONICAL_URL_CACHE_TTL_MS = 60_000;
let canonicalUrlCache: { value: string | null; expiresAt: number } | null = null;

export function normalizePublicBaseUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const normalizedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
  } catch {
    return null;
  }
}

function splitUrlList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function getConfiguredPublicBaseUrls(): string[] {
  const configured = [
    ...splitUrlList(process.env.APP_BASE_URLS),
    process.env.APP_BASE_URL,
    process.env.CLIENT_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizePublicBaseUrl(value))
    .filter((value): value is string => Boolean(value));

  const unique = Array.from(new Set(configured));
  return unique;
}

async function getCanonicalUrlFromSettings(): Promise<string | null> {
  if (canonicalUrlCache && canonicalUrlCache.expiresAt > Date.now()) {
    return canonicalUrlCache.value;
  }

  try {
    const setting = await storage.getSetting(PLATFORM_CANONICAL_URL_KEY);
    const normalized = setting?.value ? normalizePublicBaseUrl(setting.value) : null;
    canonicalUrlCache = {
      value: normalized,
      expiresAt: Date.now() + CANONICAL_URL_CACHE_TTL_MS,
    };

    if (setting?.value && !normalized) {
      logger.warn({ value: setting.value }, "[PublicBaseUrl] Invalid canonical URL in platform settings");
    }

    return normalized;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[PublicBaseUrl] Failed to load canonical URL from settings",
    );
    return null;
  }
}

export function invalidatePublicBaseUrlCache(): void {
  canonicalUrlCache = null;
}

export async function getPublicBaseUrl(): Promise<string> {
  const canonicalFromSettings = await getCanonicalUrlFromSettings();
  if (canonicalFromSettings) {
    return canonicalFromSettings;
  }

  const configured = getConfiguredPublicBaseUrls();
  if (configured.length > 0) {
    return configured[0];
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Set platform canonical URL in admin settings or configure APP_BASE_URL/CLIENT_URL in production",
    );
  }

  const fallback = "http://localhost:3000";
  logger.warn("[PublicBaseUrl] Using development fallback URL: http://localhost:3000");
  return fallback;
}

export async function resolveTrustedBaseUrl(preferredBaseUrl?: string): Promise<string> {
  const configured = getConfiguredPublicBaseUrls();
  const canonicalUrl = await getPublicBaseUrl();

  if (!preferredBaseUrl) {
    return canonicalUrl;
  }

  const normalizedPreferred = normalizePublicBaseUrl(preferredBaseUrl);
  if (!normalizedPreferred) {
    logger.warn({ preferredBaseUrl }, "[PublicBaseUrl] Ignoring invalid base URL");
    return canonicalUrl;
  }

  const allowList = new Set<string>([canonicalUrl, ...configured]);
  if (allowList.has(normalizedPreferred)) {
    return normalizedPreferred;
  }

  logger.warn(
    { preferredBaseUrl: normalizedPreferred, configured: Array.from(allowList) },
    "[PublicBaseUrl] Ignoring non-whitelisted base URL",
  );
  return canonicalUrl;
}

export const platformBaseUrlSettingKey = PLATFORM_CANONICAL_URL_KEY;
