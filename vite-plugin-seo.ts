import { seoConfig } from "./seo.config";
import type { Plugin } from "vite";

const yandexMetrikaScript = seoConfig.yandexMetrikaId
  ? `
    <!-- Yandex.Metrika counter -->
    <script type="text/javascript">
      (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
      })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${seoConfig.yandexMetrikaId}', 'ym');

      ym(${seoConfig.yandexMetrikaId}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", accurateTrackBounce:true, trackLinks:true});
    </script>
    <noscript><div><img src="https://mc.yandex.ru/watch/${seoConfig.yandexMetrikaId}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
    <!-- /Yandex.Metrika counter -->`
  : "";

const placeholders: Record<string, string> = {
  "{{SITE_NAME}}": seoConfig.siteName,
  "{{DOMAIN}}": seoConfig.domain,
  "{{TITLE}}": seoConfig.title,
  "{{DESCRIPTION}}": seoConfig.description,
  "{{KEYWORDS}}": seoConfig.keywords,
  "{{OG_URL}}": `https://${seoConfig.domain}/`,
  "{{OG_IMAGE}}": seoConfig.ogImage,
  "{{YANDEX_METRIKA_ID}}": seoConfig.yandexMetrikaId || "",
  "{{YANDEX_METRIKA_SCRIPT}}": yandexMetrikaScript,
  "{{VK_LINK}}": seoConfig.socialLinks.vk || "",
  "{{TELEGRAM_LINK}}": seoConfig.socialLinks.telegram || "",
  "{{SEARCH_URL}}": `https://${seoConfig.domain}/catalog?search={search_term_string}`,
  "{{SUPPORT_EMAIL}}": `support@${seoConfig.domain}`,
};

export function seoPlugin(): Plugin {
  return {
    name: "vite-plugin-seo",
    transformIndexHtml(html) {
      let result = html;
      for (const [placeholder, value] of Object.entries(placeholders)) {
        result = result.replace(new RegExp(placeholder, "g"), value);
      }
      return result;
    },
  };
}
