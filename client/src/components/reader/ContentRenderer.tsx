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
      ALLOWED_ATTR: ["class", "id", "href", "src", "alt", "title", "loading", "style"],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      FORCE_BODY: false,
    });
  }, [content]);

  return (
    <>
      <style>{`
        .reader-content {
          text-align: var(--reader-text-align, justify);
        }
        .reader-content > p,
        .reader-content > h1,
        .reader-content > h2,
        .reader-content > h3,
        .reader-content > h4,
        .reader-content > h5,
        .reader-content > h6,
        .reader-content > blockquote,
        .reader-content > pre,
        .reader-content > ul,
        .reader-content > ol,
        .reader-content > hr {
          content-visibility: auto;
          contain-intrinsic-size: 0 100px;
        }
      `}</style>
      <div
        className="prose prose-lg max-w-none dark:prose-invert reader-content"
        style={{
          fontSize: "var(--reader-font-size, 18px)",
          fontFamily: "var(--reader-font-family, Georgia)",
          lineHeight: "var(--reader-line-height, 1.8)",
        }}
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    </>
  );
}
