import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface HtmlContentRendererProps {
  readonly content: string;
  readonly className?: string;
}

export function HtmlContentRenderer({ content, className }: HtmlContentRendererProps): React.ReactElement {
  const [expandedSpoilers, setExpandedSpoilers] = useState<Record<string, boolean>>({});

  const processedContent = useMemo(() => {
    let spoilerIndex = 0;
    return content.replace(/<div\s+data-spoiler-block="true"/g, () => {
      spoilerIndex += 1;
      return `<div data-spoiler-block="true" data-spoiler-id="spoiler-${spoilerIndex}"`;
    });
  }, [content]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const spoilerLabel = target.closest<HTMLElement>('[data-spoiler-label="true"]');
    if (!spoilerLabel) {
      return;
    }

    const spoilerRoot = spoilerLabel.closest<HTMLElement>('[data-spoiler-block="true"]');
    if (!spoilerRoot) {
      return;
    }

    const spoilerId = spoilerRoot.dataset.spoilerId;
    if (!spoilerId) {
      return;
    }

    setExpandedSpoilers((prev) => ({
      ...prev,
      [spoilerId]: !prev[spoilerId],
    }));
  };

  const spoilerStyles = Object.entries(expandedSpoilers)
    .filter(([, expanded]) => expanded)
    .map(([spoilerId]) => [
      `.prose [data-spoiler-id="${spoilerId}"] [data-spoiler-content="true"]{display:block;}`,
      `.prose [data-spoiler-id="${spoilerId}"] [data-spoiler-label="true"]::after{content:"Скрыть";}`,
    ].join("\n"))
    .join("\n");

  return (
    <>
      <style>{`
        .prose h1, .prose h2, .prose h3 {
          line-height: 1.25;
          font-weight: 700;
        }
        .prose h1 { font-size: 2em; margin-top: 1em; }
        .prose h2 { font-size: 1.5em; margin-top: 0.75em; }
        .prose h3 { font-size: 1.25em; margin-top: 0.5em; }
        .prose ul {
          list-style-type: disc;
          padding-left: 1.5em;
        }
        .prose ol {
          list-style-type: decimal;
          padding-left: 1.5em;
        }
        .prose blockquote {
          border-left: 3px solid hsl(var(--primary));
          padding-left: 1em;
          margin-left: 0;
          font-style: italic;
        }
        .prose a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .prose strong {
          font-weight: 700;
        }
        .prose em {
          font-style: italic;
        }
        .prose s {
          text-decoration: line-through;
        }
        .prose [data-spoiler-block="true"] {
          margin: 0.75rem 0;
          overflow: hidden;
          border: 1px solid hsl(var(--border));
          border-radius: 0.9rem;
          background: hsl(var(--muted) / 0.35);
        }
        .prose [data-spoiler-label="true"] {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          cursor: pointer;
          padding: 0.75rem 0.95rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          user-select: none;
        }
        .prose [data-spoiler-label="true"]::after {
          content: "Показать";
          font-size: 0.75rem;
          font-weight: 500;
          color: hsl(var(--muted-foreground));
        }
        .prose [data-spoiler-content="true"] {
          display: none;
          padding: 0 0.95rem 0.9rem;
        }
        ${spoilerStyles}
      `}</style>
      <div
        onClick={handleClick}
        className={cn('prose prose-sm max-w-none', className)}
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    </>
  );
}
