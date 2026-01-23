import { seoConfig } from "./seo.config";
import type { Plugin } from "vite";


const placeholders: Record<string, string> = {
  "{{SITE_NAME}}": seoConfig.siteName,
  "{{DOMAIN}}": seoConfig.domain,
  "{{TITLE}}": seoConfig.title,
  "{{DESCRIPTION}}": seoConfig.description,
  "{{KEYWORDS}}": seoConfig.keywords,
  "{{OG_URL}}": `https://${seoConfig.domain}/`,
  "{{OG_IMAGE}}": seoConfig.ogImage,
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
