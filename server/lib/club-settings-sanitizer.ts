import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window as unknown as typeof window);

const CLUB_HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "b",
    "i",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "svg", "math"],
  KEEP_CONTENT: true,
};

interface RawClubSettings {
  welcomeTitle?: unknown;
  welcomeHtml?: unknown;
  rulesHtml?: unknown;
  shortDescription?: unknown;
}

interface SanitizedClubSettings {
  welcomeTitle?: string;
  welcomeHtml?: string;
  rulesHtml?: string;
  shortDescription?: string;
}

function clampText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function sanitizeHtml(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const sanitized = DOMPurify.sanitize(value, CLUB_HTML_SANITIZE_CONFIG).trim();
  if (!sanitized) {
    return undefined;
  }

  return sanitized.slice(0, maxLength);
}

function normalizeInput(input: unknown): RawClubSettings {
  if (input === null) {
    return {};
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as RawClubSettings;
      }
      return {};
    } catch {
      return {
        shortDescription: trimmed,
      };
    }
  }

  if (typeof input === "object" && input && !Array.isArray(input)) {
    return input as RawClubSettings;
  }

  return {};
}

export function sanitizeClubSettingsInput(input: unknown): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  const raw = normalizeInput(input);

  const sanitized: SanitizedClubSettings = {
    welcomeTitle: clampText(raw.welcomeTitle, 140),
    shortDescription: clampText(raw.shortDescription, 1200),
    welcomeHtml: sanitizeHtml(raw.welcomeHtml, 20000),
    rulesHtml: sanitizeHtml(raw.rulesHtml, 20000),
  };

  // Remove undefined keys for compact deterministic payload.
  const filtered = Object.fromEntries(
    Object.entries(sanitized).filter(([, value]) => value !== undefined),
  ) as SanitizedClubSettings;

  return JSON.stringify(filtered);
}
