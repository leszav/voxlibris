const HOMESCREEN_OPEN_SESSION_KEY = "mobile-analytics-homescreen-open-tracked";

type MobileDeviceType = "mobile" | "tablet";
type MobileOs = "android" | "ios" | "other";

function getUserAgent(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  return navigator.userAgent.toLowerCase();
}

export function getMobileDeviceType(): MobileDeviceType | null {
  const userAgent = getUserAgent();
  if (!userAgent) {
    return null;
  }

  if (/ipad|tablet|playbook|silk|kindle|sm-t|tab/i.test(userAgent) || (/android/i.test(userAgent) && !/mobile/i.test(userAgent))) {
    return "tablet";
  }

  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) {
    return "mobile";
  }

  return null;
}

export function getMobileOs(): MobileOs {
  const userAgent = getUserAgent();
  if (/android/i.test(userAgent)) {
    return "android";
  }
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "ios";
  }
  return "other";
}

export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function getMobileAnalyticsContext(extra: Record<string, unknown> = {}): Record<string, unknown> | null {
  const deviceType = getMobileDeviceType();
  if (!deviceType) {
    return null;
  }

  return {
    deviceType,
    os: getMobileOs(),
    displayMode: isStandaloneMode() ? "standalone" : "browser",
    ...extra,
  };
}

export function markHomescreenOpenTracked(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.sessionStorage.getItem(HOMESCREEN_OPEN_SESSION_KEY) === "1") {
    return false;
  }

  window.sessionStorage.setItem(HOMESCREEN_OPEN_SESSION_KEY, "1");
  return true;
}
