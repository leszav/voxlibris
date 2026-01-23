import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// Тип функции Яндекс.Метрики
export type YandexMetrikaFunction = ((...args: any[]) => void) & {
  a?: any[];
  l?: number;
};

// Объявляем глобальную функцию счётчика, чтобы TypeScript не ругался
declare global {
  interface Window {
    ym?: YandexMetrikaFunction;
  }
}

/**
 * Глобальная инициализация Яндекс.Метрики без inline-скриптов.
 * Загружает tag.js и вызывает ym('init', ...). Вызывается лениво и только один раз.
 */
function ensureYandexMetrikaInitialized() {
  const g = globalThis as any;
  const win = g.window as Window | undefined;
  const doc = g.document as Document | undefined;

  if (!win || !doc) {
    return;
  }

  // Защита от повторной инициализации
  if (g.__ymInitialized) {
    return;
  }
  g.__ymInitialized = true;

  // Очередь вызовов до загрузки tag.js (аналог официального сниппета)
  const ym: YandexMetrikaFunction = (...args: any[]) => {
    ym.a ??= [];
    ym.a.push(args);
  };
  ym.l = Date.now();

  (win as any).ym = ym;

  const script = doc.createElement("script");
  script.async = true;
  script.src = "https://mc.yandex.ru/metrika/tag.js";
  doc.head?.appendChild(script);

  // Инициализация счётчика с настройками для SPA
  (win as any).ym(106167747, "init", {
    defer: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
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

    const g = globalThis as any;
    const win = g.window as (Window & { ym?: (...args: any[]) => void }) | undefined;
    if (!win || !win.ym) {
      return;
    }

    const currentUrl =
      win.location.pathname + win.location.search + win.location.hash;
    const referrer = prevPathRef.current
      ? prevPathRef.current
      : g.document?.referrer || undefined;

    win.ym(106167747, "hit", currentUrl, {
      referer: referrer,
      title: g.document?.title,
    });

    prevPathRef.current = currentUrl;
  }, [location]);

  return null;
}
