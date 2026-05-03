import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface HtmlContentRendererProps {
  readonly content: string;
  readonly className?: string;
}

export function HtmlContentRenderer({ content, className }: HtmlContentRendererProps): React.ReactElement {
  const processedContent = useMemo(() => {
    let spoilerIndex = 0;
    return content
      .replace(/<div\s+data-spoiler-block="true"/g, () => {
        spoilerIndex += 1;
        return `<div data-spoiler-block="true" data-spoiler-id="spoiler-${spoilerIndex}"`;
      })
      .replace(/<span\s+data-spoiler="true"/g, () => {
        spoilerIndex += 1;
        return `<span data-spoiler="true" data-spoiler-id="spoiler-${spoilerIndex}"`;
      });
  }, [content]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rawTarget = event.target;
    const target = rawTarget instanceof HTMLElement
      ? rawTarget
      : rawTarget instanceof Node
        ? rawTarget.parentElement
        : null;

    if (!target) {
      return;
    }

    const spoilerRoot = target.closest<HTMLElement>('[data-spoiler="true"], [data-spoiler-block="true"]');
    if (!spoilerRoot) {
      return;
    }

    const isRevealed = spoilerRoot.dataset.spoilerRevealed === 'true';
    spoilerRoot.dataset.spoilerRevealed = isRevealed ? 'false' : 'true';
  };

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
        .prose [data-spoiler="true"],
        .prose [data-spoiler-block="true"] {
          cursor: pointer;
          user-select: none;
          transition: background-color 160ms ease, color 160ms ease, filter 160ms ease;
        }
        .prose [data-spoiler="true"] {
          display: inline;
          border-radius: 0.35rem;
          background: linear-gradient(90deg, rgba(83, 61, 45, 0.56), rgba(83, 61, 45, 0.64), rgba(83, 61, 45, 0.56));
          color: rgba(15, 23, 42, 0.08);
          filter: blur(1.8px) saturate(0.88);
          -webkit-text-fill-color: rgba(15, 23, 42, 0.08);
          padding: 0.02rem 0.16rem;
        }
        .prose [data-spoiler-block="true"] {
          display: block;
          margin: 0.75rem 0;
          border-radius: 0.9rem;
          background: linear-gradient(90deg, rgba(83, 61, 45, 0.54), rgba(83, 61, 45, 0.62), rgba(83, 61, 45, 0.54));
          color: rgba(15, 23, 42, 0.07);
          filter: blur(2.2px) saturate(0.86);
          -webkit-text-fill-color: rgba(15, 23, 42, 0.07);
          padding: 0.85rem 1rem;
          overflow: hidden;
        }
        .prose [data-spoiler="true"][data-spoiler-revealed="true"],
        .prose [data-spoiler-block="true"][data-spoiler-revealed="true"] {
          background: none;
          color: inherit;
          filter: none;
          -webkit-text-fill-color: currentColor;
        }
        .prose [data-spoiler-block="true"] > *:first-child {
          margin-top: 0;
        }
        .prose [data-spoiler-block="true"] > *:last-child {
          margin-bottom: 0;
        }
      `}</style>
      <div
        onClick={handleClick}
        className={cn('prose prose-sm max-w-none', className)}
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    </>
  );
}
