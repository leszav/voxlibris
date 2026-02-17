import React from 'react';
import { cn } from '@/lib/utils';

interface HtmlContentRendererProps {
  readonly content: string;
  readonly className?: string;
}

export function HtmlContentRenderer({ content, className }: HtmlContentRendererProps): React.ReactElement {
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
      `}</style>
      <div
        className={cn('prose prose-sm max-w-none', className)}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </>
  );
}
