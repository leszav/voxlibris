import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window as unknown as typeof window);

// Конфигурация DOMPurify для безопасного рендеринга книжного контента
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "em", "u", "i", "b", "a", "ul", "ol", "li",
    "blockquote", "pre", "code", "hr", "img", "table", "thead",
    "tbody", "tr", "td", "th", "caption", "sup", "sub"
  ],
  ALLOWED_ATTR: [
    "href", "title", "class", "id", "alt", "src", "width", "height",
    "style" // Ограниченный style (только безопасные свойства)
  ],
  // Упрощенный regex для безопасности и производительности (complexity < 20)
  ALLOWED_URI_REGEXP: /^(https?|mailto):|^[^a-z]/i,
  ALLOW_DATA_ATTR: false,
  ALLOWED_STYLES: {
    "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
    "font-size": [/^\d+(?:px|em|rem|%)$/],
    "color": [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
    "font-weight": [/^bold$/, /^normal$/],
    "font-style": [/^italic$/, /^normal$/],
    "margin": [/^\d+(?:px|em|rem)$/],
    "padding": [/^\d+(?:px|em|rem)$/],
  },
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false,
  FORCE_BODY: false,
};

/**
 * Очистка HTML контента книги от XSS и потенциально опасных элементов
 * Используется при загрузке/парсинге книг (server-side)
 */
export function sanitizeBookContent(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== "string") {
    return "";
  }

  try {
    const sanitized = DOMPurify.sanitize(htmlContent, PURIFY_CONFIG);
    return sanitized;
  } catch (error) {
    console.error("[Content Sanitizer] Error sanitizing content:", error);
    // Fallback: возвращаем пустую строку при ошибке
    return "";
  }
}

/**
 * Извлечение plain text из HTML (для индексации, поиска)
 */
export function extractPlainText(htmlContent: string): string {
  const dom = new JSDOM(htmlContent);
  return dom.window.document.body.textContent || "";
}

/**
 * Валидация структуры HTML для книг с поэзией
 * Проверяет наличие специальных классов для форматирования стихов
 */
export function validatePoetryStructure(htmlContent: string): boolean {
  const dom = new JSDOM(htmlContent);
  const doc = dom.window.document;

  // Проверка наличия специальных классов/тегов для стихов
  const poetryMarkers = [
    ".poem",
    ".stanza",
    ".verse",
    "div[data-type='poem']",
  ];

  return poetryMarkers.some(selector => doc.querySelector(selector) !== null);
}

/**
 * Нормализация HTML контента для единообразного отображения
 */
export function normalizeBookHTML(htmlContent: string): string {
  const dom = new JSDOM(htmlContent);
  const doc = dom.window.document;

  // Удаление пустых параграфов
  doc.querySelectorAll("p").forEach((p: Element) => {
    if (!p.textContent?.trim()) {
      p.remove();
    }
  });

  // Нормализация пробелов
  doc.querySelectorAll("p, div, span").forEach((el: Element) => {
    if (el.textContent) {
      el.textContent = el.textContent.replaceAll(/\s+/g, " ").trim();
    }
  });

  return doc.body.innerHTML;
}
