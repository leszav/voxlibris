import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// Объявляем глобальную функцию счётчика, чтобы TypeScript не ругался
declare global {
  interface Window {
    ym?: (...args: any[]) => void;
  }
}

/**
 * Компонент для отправки hit в Яндекс.Метрику при смене маршрута SPA.
 * Отслеживает переходы по маршрутам wouter и вызывает ym('hit', ...).
 */
export function YandexMetrikaTracker() {
  const [location] = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const win = (globalThis as any).window as (Window & { ym?: (...args: any[]) => void }) | undefined;
    if (!win) {
      return;
    }

    const currentUrl =
      win.location.pathname + win.location.search + win.location.hash;
    const referrer = prevPathRef.current
      ? prevPathRef.current
      : globalThis.document?.referrer || undefined;

    win.ym?.(106167747, "hit", currentUrl, {
      referer: referrer,
      title: globalThis.document?.title,
    });

    prevPathRef.current = currentUrl;
  }, [location]);

  return null;
}
