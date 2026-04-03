import { useMemo } from "react";
import DOMPurify from "dompurify";

interface ClubContentRendererProps {
  readonly content: string;
}

export function ClubContentRenderer({ content }: Readonly<ClubContentRendererProps>) {
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
        .club-reader-content {
          text-align: var(--club-reader-text-align, justify);
        }
        .club-reader-content > p,
        .club-reader-content > h1,
        .club-reader-content > h2,
        .club-reader-content > h3,
        .club-reader-content > h4,
        .club-reader-content > h5,
        .club-reader-content > h6,
        .club-reader-content > blockquote,
        .club-reader-content > pre,
        .club-reader-content > ul,
        .club-reader-content > ol,
        .club-reader-content > hr {
          content-visibility: auto;
          contain-intrinsic-size: 0 100px;
        }
      `}</style>
      <div
        className="prose prose-lg max-w-none dark:prose-invert club-reader-content"
        style={{
          fontSize: "var(--club-reader-font-size, 18px)",
          fontFamily: "var(--club-reader-font-family, Georgia)",
          lineHeight: "var(--club-reader-line-height, 1.8)",
        }}
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
    </>
  );
}
