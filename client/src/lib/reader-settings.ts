export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  lineHeight: number;
  textAlign: "left" | "justify";
  contentWidth: number;
}

export type ReaderSettingsScope = "personal" | "club";
export type ReaderSettingsDeviceMode = "desktop" | "mobile";

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
export const MOBILE_READER_SETTINGS_STORAGE_KEY = "readerSettingsMobile";

export const MOBILE_DEFAULT_READER_SETTINGS: ReaderSettings = {
  ...DEFAULT_READER_SETTINGS,
  fontSize: 12,
  lineHeight: 1.2,
  contentWidth: 95,
};

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

function getStorageKey(deviceMode: ReaderSettingsDeviceMode): string {
  return deviceMode === "mobile" ? MOBILE_READER_SETTINGS_STORAGE_KEY : READER_SETTINGS_STORAGE_KEY;
}

function getDefaultSettings(deviceMode: ReaderSettingsDeviceMode): ReaderSettings {
  return deviceMode === "mobile" ? MOBILE_DEFAULT_READER_SETTINGS : DEFAULT_READER_SETTINGS;
}

export function loadReaderSettingsFromStorage(deviceMode: ReaderSettingsDeviceMode = "desktop"): ReaderSettings {
  try {
    const saved = globalThis.localStorage?.getItem(getStorageKey(deviceMode));
    if (!saved) {
      return getDefaultSettings(deviceMode);
    }

    const fallbackSettings = getDefaultSettings(deviceMode);
    const parsed = JSON.parse(saved);

    if (!parsed || typeof parsed !== "object") {
      return fallbackSettings;
    }

    return normalizeReaderSettings({
      ...fallbackSettings,
      ...parsed,
    });
  } catch {
    return getDefaultSettings(deviceMode);
  }
}

export function saveReaderSettingsToStorage(
  settings: ReaderSettings,
  deviceMode: ReaderSettingsDeviceMode = "desktop",
): void {
  try {
    globalThis.localStorage?.setItem(getStorageKey(deviceMode), JSON.stringify(normalizeReaderSettings(settings)));
  } catch {
    // ignore localStorage errors and keep in-memory state
  }
}

function getViewportWidth(viewportWidth?: number): number {
  if (typeof viewportWidth === "number" && Number.isFinite(viewportWidth)) {
    return viewportWidth;
  }

  if (globalThis.window !== undefined) {
    return globalThis.window.innerWidth;
  }

  return MOBILE_READER_BREAKPOINT;
}

export function getEffectiveReaderSettings(settings: ReaderSettings, viewportWidth?: number): ReaderSettings {
  const normalizedSettings = normalizeReaderSettings(settings);
  getViewportWidth(viewportWidth);
  return normalizedSettings;
}

export function isMobileReaderViewport(viewportWidth?: number): boolean {
  // Prefer pointer media query: touch devices (phones, tablets) have coarse pointer
  // regardless of viewport width, while desktops always have fine (mouse) pointer.
  // Falls back to viewport width when window is not available (SSR / tests).
  if (viewportWidth === undefined && globalThis.window !== undefined) {
    return globalThis.window.matchMedia("(pointer: coarse)").matches;
  }
  return getViewportWidth(viewportWidth) < MOBILE_READER_BREAKPOINT;
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
    return;
  }

  root.style.setProperty("--reader-font-size", `${effectiveSettings.fontSize}px`);
  root.style.setProperty("--reader-font-family", effectiveSettings.fontFamily);
  root.style.setProperty("--reader-line-height", effectiveSettings.lineHeight.toString());
  root.style.setProperty("--reader-text-align", effectiveSettings.textAlign);
  root.style.setProperty("--reader-content-width", `${effectiveSettings.contentWidth}%`);
}

export function cleanupReaderSettings(scope: ReaderSettingsScope): void {
  const root = document.documentElement;

  if (scope === "club") {
    root.style.removeProperty("--club-reader-font-size");
    root.style.removeProperty("--club-reader-font-family");
    root.style.removeProperty("--club-reader-line-height");
    root.style.removeProperty("--club-reader-text-align");
    root.style.removeProperty("--club-reader-content-width");
    return;
  }

  root.style.removeProperty("--reader-font-size");
  root.style.removeProperty("--reader-font-family");
  root.style.removeProperty("--reader-line-height");
  root.style.removeProperty("--reader-text-align");
  root.style.removeProperty("--reader-content-width");
}
