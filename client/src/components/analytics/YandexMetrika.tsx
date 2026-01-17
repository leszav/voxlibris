import { useEffect } from 'react';

// ID счётчика Яндекс.Метрики
// В production используется реальный ID, в dev можно отключить или использовать тестовый
const YANDEX_METRIKA_ID = 106167747;

interface YandexMetrikaInitParams {
  clickmap: boolean;
  trackLinks: boolean;
  accurateTrackBounce: boolean;
  webvisor: boolean;
  ecommerce: string;
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
        const setupQueue = () => {
          const m = globalThis as WindowWithYandexMetrika;
          if (!m.ym) {
            m.ym = function(this: YandexMetrika) {
              if (!this.a) this.a = [];
              this.a.push(arguments as unknown as IArguments);
            } as unknown as YandexMetrika;
            m.ym.a = [];
            m.ym.l = Date.now();
          }
        };

        const loadScript = () => {
          const r = "https://mc.yandex.ru/metrika/tag.js";
          
          for (const script of document.scripts) {
            if (script.src === r) return;
          }
          
          const k = document.createElement("script");
          const a = document.getElementsByTagName("script")[0];
          k.async = true;
          k.src = r;
          
          if (import.meta.env.DEV) {
            k.onerror = () => console.error('[YandexMetrika] Failed to load script');
            k.onload = () => console.log('[YandexMetrika] Script loaded successfully');
          }
          
          a?.parentNode?.insertBefore(k, a);
        };
        
        setupQueue();
        loadScript();

        // Инициализируем счетчик
        const ym = (globalThis as WindowWithYandexMetrika).ym;
        if (ym) {
          ym(YANDEX_METRIKA_ID, "init", {
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: true,
            ecommerce: "dataLayer"
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
