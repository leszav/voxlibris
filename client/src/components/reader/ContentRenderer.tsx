import { useMemo } from "react";
import DOMPurify from "dompurify";

interface ContentRendererProps {
  readonly content: string;
}

export function ContentRenderer({ content }: ContentRendererProps) {
  // Санитизация контента
  const sanitizedContent = useMemo(() => {
    if (!content) return "";

    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [
        "p", "br", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
        "strong", "em", "u", "s", "blockquote", "pre", "code",
        "ul", "ol", "li", "a", "img", "hr"
      ],
      ALLOWED_ATTR: ["class", "id", "href", "src", "alt", "title", "loading"],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      FORCE_BODY: false,
    });
  }, [content]);

  return (
    <div
      className="prose prose-lg max-w-none dark:prose-invert reader-content"
      style={{
        fontSize: "var(--reader-font-size, 18px)",
        fontFamily: "var(--reader-font-family, Georgia)",
        lineHeight: "var(--reader-line-height, 1.8)",
        textAlign: "justify" as const,
      }}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
