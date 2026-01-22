import { useEffect } from 'react';

// ID счётчика Яндекс.Метрики
// В production используется реальный ID, в dev можно отключить или использовать тестовый
const YANDEX_METRIKA_ID = 106167747;

interface YandexMetrikaInitParams {
  ssr: boolean;
  webvisor: boolean;
  clickmap: boolean;
  ecommerce: string;
  referrer: string;
  url: string;
  accurateTrackBounce: boolean;
  trackLinks: boolean;
}

interface YandexMetrika {
  (counterId: number, action: 'init', params: YandexMetrikaInitParams): void;
  (counterId: number, action: string, params?: unknown): void;
  a?: IArguments[];
  l?: number;
}

interface WindowWithYandexMetrika {
  ym?: YandexMetrika;
}

/**
 * Компонент для инициализации Яндекс.Метрики
 * Вставляет скрипт Яндекс.Метрики в DOM при монтировании
 * В development режиме только логирует события в консоль
 * 
 * Оптимизации:
 * - Ленивая загрузка после полной загрузки страницы
 * - Обработка ошибок загрузки скрипта
 * - Проверка на дублирование
 */
export function YandexMetrika() {
  useEffect(() => {
    // В dev режиме не загружаем Метрику, только логируем
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    
    if (isDev) {
      if (import.meta.env.DEV) {
        console.log('[YandexMetrika] Running in development mode - tracking disabled');
      }
      // Создаём заглушку для ym() чтобы не было ошибок
      const mockYm = (...args: unknown[]) => {
        console.log('[YandexMetrika] Mock call:', args);
      };
      (globalThis as WindowWithYandexMetrika).ym = mockYm as YandexMetrika;
      return;
    }

    // Проверяем, не загружена ли уже Яндекс.Метрика
    if ((globalThis as WindowWithYandexMetrika).ym) {
      if (import.meta.env.DEV) {
        console.log('[YandexMetrika] Already loaded');
      }
      return;
    }

    /**
     * Инициализация Яндекс.Метрики с оптимизацией загрузки
     */
    const initializeMetrika = () => {
      try {
        // Setup queue function
        const m = globalThis as WindowWithYandexMetrika;
        if (!m.ym) {
          m.ym = function() {
            const args = arguments as unknown as IArguments;
            (m.ym as YandexMetrika).a ??= [];
            (m.ym as YandexMetrika).a!.push(args);
          } as unknown as YandexMetrika;
          m.ym.a = [];
          m.ym.l = Date.now();
        }

        // Load script function
        const scriptUrl = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`;
        
        // Check if script already exists
        const existingScript = Array.from(document.scripts).find(script => script.src === scriptUrl);
        if (existingScript) return;
        
        const script = document.createElement("script");
        const firstScript = document.getElementsByTagName("script")[0];
        script.async = true;
        script.src = scriptUrl;
        
        if (import.meta.env.DEV) {
          script.onerror = () => console.error('[YandexMetrika] Failed to load script');
          script.onload = () => console.log('[YandexMetrika] Script loaded successfully');
        }
        
        firstScript?.parentNode?.insertBefore(script, firstScript);

        // Инициализируем счетчик согласно официальной инструкции
        const ym = (globalThis as WindowWithYandexMetrika).ym;
        if (ym) {
          ym(YANDEX_METRIKA_ID, "init", {
            ssr: true,
            webvisor: true,
            clickmap: true,
            ecommerce: "dataLayer",
            referrer: document.referrer,
            url: location.href,
            accurateTrackBounce: true,
            trackLinks: true
          });
        }

        if (import.meta.env.DEV) {
          console.log(`[YandexMetrika] Initialized counter ${YANDEX_METRIKA_ID}`);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[YandexMetrika] Initialization error:', error);
        }
      }
    };

    // Загружаем Metrika только после полной загрузки страницы
    if (document.readyState === 'complete') {
      // Страница уже загружена, инициализируем сразу
      initializeMetrika();
    } else {
      // Ждём полной загрузки страницы
      globalThis.addEventListener('load', initializeMetrika);
      return () => globalThis.removeEventListener('load', initializeMetrika);
    }

    // Cleanup при размонтировании компонента не требуется,
    // так как Метрика должна работать на протяжении всей сессии
  }, []);

  // В dev режиме noscript не нужен
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    return null;
  }

    return (
    <noscript>
      <div>
        <img 
          src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`}
          style={{ position: 'absolute', left: '-9999px' }} 
          alt=""
        />
      </div>
    </noscript>
  );
}
