import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// Тип функции Яндекс.Метрики
export type YandexMetrikaFunction = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

// Объявляем глобальную функцию счётчика, чтобы TypeScript не ругался
declare global {
  interface Window {
    ym?: YandexMetrikaFunction;
  }
}

const YM_COUNTER_ID = 106167747;
const YM_LOAD_TIMEOUT_MS = 3000;

function installYmStub(win: Window) {
  if (win.ym) {
    return;
  }

  const ym: YandexMetrikaFunction = (...args: unknown[]) => {
    ym.a ??= [];
    ym.a.push(args);
  };
  ym.l = Date.now();
  win.ym = ym;
}

function loadYandexTag(doc: Document) {
  const globalWithYM = globalThis as typeof globalThis & { __ymScriptLoaded?: boolean };
  if (globalWithYM.__ymScriptLoaded) {
    return;
  }

  globalWithYM.__ymScriptLoaded = true;

  const script = doc.createElement("script");
  script.async = true;
  script.src = "https://mc.yandex.ru/metrika/tag.js";
  doc.head?.appendChild(script);
}

function scheduleYandexTagLoad(win: Window, doc: Document) {
  const globalWithYM = globalThis as typeof globalThis & {
    __ymLoadScheduled?: boolean;
  };
  if (globalWithYM.__ymLoadScheduled) {
    return;
  }

  globalWithYM.__ymLoadScheduled = true;

  const load = () => loadYandexTag(doc);
  const eagerEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

  for (const eventName of eagerEvents) {
    win.addEventListener(eventName, load, { once: true, passive: true });
  }

  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(() => load(), { timeout: YM_LOAD_TIMEOUT_MS });
  } else {
    win.setTimeout(load, YM_LOAD_TIMEOUT_MS);
  }
}

/**
 * Глобальная инициализация Яндекс.Метрики без inline-скриптов.
 * Загружает tag.js и вызывает ym('init', ...). Вызывается лениво и только один раз.
 */
function ensureYandexMetrikaInitialized() {
  const globalWithYM = globalThis as typeof globalThis & { __ymInitialized?: boolean };
  const win = globalThis.window ?? undefined;
  const doc = globalThis.document ?? undefined;

  if (!win || !doc) {
    return;
  }

  installYmStub(win);

  if (globalWithYM.__ymInitialized) {
    scheduleYandexTagLoad(win, doc);
    return;
  }
  globalWithYM.__ymInitialized = true;

  scheduleYandexTagLoad(win, doc);

  // Инициализируем счетчик сразу, а загрузку tag.js откладываем до idle/взаимодействия.
  win.ym?.(YM_COUNTER_ID, "init", {
    defer: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: import.meta.env.VITE_ENABLE_YANDEX_WEBVISOR === "true",
  });
}

export function reachYandexGoal(goal: string, params?: Record<string, unknown>) {
  ensureYandexMetrikaInitialized();

  const win = globalThis.window ?? undefined;
  win?.ym?.(YM_COUNTER_ID, "reachGoal", goal, params);
}

/**
 * Компонент для отправки hit в Яндекс.Метрику при смене маршрута SPA.
 * Отслеживает переходы по маршрутам wouter и вызывает ym('hit', ...).
 */
export function YandexMetrikaTracker() {
  const [location] = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    ensureYandexMetrikaInitialized();

    const win = globalThis.window ?? undefined;
    if (!win || !win.ym) {
      return;
    }

    const currentUrl =
      win.location.pathname + win.location.search + win.location.hash;
    const referrer = prevPathRef.current
      ? prevPathRef.current
      : document?.referrer || undefined;

    win.ym(YM_COUNTER_ID, "hit", currentUrl, {
      referer: referrer,
      title: document?.title,
    });

    prevPathRef.current = currentUrl;
  }, [location]);

  return null;
}
