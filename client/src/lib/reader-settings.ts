export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  lineHeight: number;
  textAlign: "left" | "justify";
  contentWidth: number;
}

export type ReaderSettingsScope = "personal" | "club";

export const MOBILE_READER_BREAKPOINT = 768;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: "Georgia",
  theme: "light",
  lineHeight: 1.8,
  textAlign: "justify",
  contentWidth: 80,
};

export const READER_SETTINGS_STORAGE_KEY = "readerSettings";

const MOBILE_EFFECTIVE_FONT_SIZE = 12;
const MOBILE_EFFECTIVE_LINE_HEIGHT = 1.2;
const MOBILE_EFFECTIVE_CONTENT_WIDTH = 95;

const ALLOWED_FONT_FAMILIES = new Set([
  "Georgia",
  "Times New Roman",
  "Arial",
  "Verdana",
  "system-ui",
]);

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

export function normalizeReaderSettings(input: unknown): ReaderSettings {
  const source = typeof input === "object" && input !== null
    ? input as Partial<ReaderSettings>
    : {};

  const theme = source.theme === "dark" || source.theme === "sepia" || source.theme === "light"
    ? source.theme
    : DEFAULT_READER_SETTINGS.theme;

  const textAlign = source.textAlign === "left" || source.textAlign === "justify"
    ? source.textAlign
    : DEFAULT_READER_SETTINGS.textAlign;

  const fontFamily = typeof source.fontFamily === "string" && ALLOWED_FONT_FAMILIES.has(source.fontFamily)
    ? source.fontFamily
    : DEFAULT_READER_SETTINGS.fontFamily;

  return {
    fontSize: Math.round(clampNumber(source.fontSize, 12, 32, DEFAULT_READER_SETTINGS.fontSize)),
    fontFamily,
    theme,
    lineHeight: Math.round(clampNumber(source.lineHeight, 1.2, 2.5, DEFAULT_READER_SETTINGS.lineHeight) * 10) / 10,
    textAlign,
    contentWidth: Math.round(clampNumber(source.contentWidth, 60, 95, DEFAULT_READER_SETTINGS.contentWidth)),
  };
}

export function loadReaderSettingsFromStorage(): ReaderSettings {
  try {
    const saved = globalThis.localStorage?.getItem(READER_SETTINGS_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_READER_SETTINGS;
    }

    return normalizeReaderSettings(JSON.parse(saved));
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettingsToStorage(settings: ReaderSettings): void {
  try {
    globalThis.localStorage?.setItem(READER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore localStorage errors and keep in-memory state
  }
}

function getViewportWidth(viewportWidth?: number): number {
  if (typeof viewportWidth === "number" && Number.isFinite(viewportWidth)) {
    return viewportWidth;
  }

  if (typeof window !== "undefined") {
    return window.innerWidth;
  }

  return MOBILE_READER_BREAKPOINT;
}

export function getEffectiveReaderSettings(settings: ReaderSettings, viewportWidth?: number): ReaderSettings {
  const normalizedSettings = normalizeReaderSettings(settings);
  const resolvedViewportWidth = getViewportWidth(viewportWidth);

  if (resolvedViewportWidth >= MOBILE_READER_BREAKPOINT) {
    return normalizedSettings;
  }

  return {
    ...normalizedSettings,
    fontSize: MOBILE_EFFECTIVE_FONT_SIZE,
    lineHeight: MOBILE_EFFECTIVE_LINE_HEIGHT,
    contentWidth: MOBILE_EFFECTIVE_CONTENT_WIDTH,
  };
}

export function applyReaderSettings(settings: ReaderSettings, scope: ReaderSettingsScope): void {
  const root = document.documentElement;
  const effectiveSettings = getEffectiveReaderSettings(settings);

  if (scope === "club") {
    root.style.setProperty("--club-reader-font-size", `${effectiveSettings.fontSize}px`);
    root.style.setProperty("--club-reader-font-family", effectiveSettings.fontFamily);
    root.style.setProperty("--club-reader-line-height", effectiveSettings.lineHeight.toString());
    root.style.setProperty("--club-reader-text-align", effectiveSettings.textAlign);
    root.style.setProperty("--club-reader-content-width", `${effectiveSettings.contentWidth}%`);
    root.dataset.clubReaderTheme = effectiveSettings.theme;
    document.body.classList.remove("club-reader-light", "club-reader-dark", "club-reader-sepia");
    document.body.classList.add(`club-reader-${effectiveSettings.theme}`);
    return;
  }

  root.style.setProperty("--reader-font-size", `${effectiveSettings.fontSize}px`);
  root.style.setProperty("--reader-font-family", effectiveSettings.fontFamily);
  root.style.setProperty("--reader-line-height", effectiveSettings.lineHeight.toString());
  root.style.setProperty("--reader-text-align", effectiveSettings.textAlign);
  root.style.setProperty("--reader-content-width", `${effectiveSettings.contentWidth}%`);
  root.dataset.readerTheme = effectiveSettings.theme;
  document.body.classList.remove("reader-light", "reader-dark", "reader-sepia");
  document.body.classList.add(`reader-${effectiveSettings.theme}`);
}

export function cleanupReaderSettings(scope: ReaderSettingsScope): void {
  const root = document.documentElement;

  if (scope === "club") {
    document.body.classList.remove("club-reader-light", "club-reader-dark", "club-reader-sepia");
    root.style.removeProperty("--club-reader-font-size");
    root.style.removeProperty("--club-reader-font-family");
    root.style.removeProperty("--club-reader-line-height");
    root.style.removeProperty("--club-reader-text-align");
    root.style.removeProperty("--club-reader-content-width");
    delete root.dataset.clubReaderTheme;
    return;
  }

  document.body.classList.remove("reader-light", "reader-dark", "reader-sepia");
  root.style.removeProperty("--reader-font-size");
  root.style.removeProperty("--reader-font-family");
  root.style.removeProperty("--reader-line-height");
  root.style.removeProperty("--reader-text-align");
  root.style.removeProperty("--reader-content-width");
  delete root.dataset.readerTheme;
}
