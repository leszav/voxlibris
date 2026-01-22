/**
 * Middleware для инжекции кода Yandex.Metrika в HTML
 * Используется только в production режиме
 */

const YANDEX_METRIKA_ID = 106167747;

/**
 * Внедряет код Yandex.Metrika в HTML перед закрывающим тегом </head>
 * @param html - HTML строка для обработки
 * @returns HTML с внедренным кодом Metrika
 */
export function injectMetrikaCode(html: string): string {
  // Проверяем, что код еще не был внедрен
  if (html.includes('mc.yandex.ru/metrika/tag.js')) {
    return html;
  }

  const metrikaCode = `
<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

    ym(${YANDEX_METRIKA_ID}, 'init', {
        ssr: true,
        webvisor: true,
        clickmap: true,
        ecommerce: "dataLayer",
        referrer: document.referrer,
        url: location.href,
        accurateTrackBounce: true,
        trackLinks: true
    });
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->`;

  // Ищем закрывающий тег </head> и вставляем код перед ним
  return html.replace('</head>', `${metrikaCode}\n</head>`);
}

/**
 * Express middleware для автоматической инжекции Metrika в HTML ответы
 * Применяется только к HTML-страницам
 */
export function metrikaInjectionMiddleware() {
  return (req: any, res: any, next: any) => {
    // Применяем только к HTML запросам (главная страница или .html файлы)
    if (req.path === '/' || req.path.endsWith('.html')) {
      const originalSend = res.send;
      
      res.send = function(data: any) {
        // Проверяем, что это HTML контент
        if (typeof data === 'string' && data.includes('<html')) {
          data = injectMetrikaCode(data);
        }
        return originalSend.call(this, data);
      };
    }
    next();
  };
}
