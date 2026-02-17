import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface HtmlContentRendererProps {
  content: string;
  className?: string;
}

export function HtmlContentRenderer({ content, className }: HtmlContentRendererProps) {
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());

  const toggleSpoiler = useCallback((index: number) => {
    setRevealedSpoilers(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Парсим HTML и заменяем спойлеры на интерактивные элементы
  const processContent = (htmlContent: string) => {
    // Заменяем спойлеры на специальные маркеры
    const spoilerRegex = /<div[^\u003e]*data-spoiler="true"[^\u003e]*class="spoiler-block"[^\u003e]*\u003e(.*?)<\/div\u003e/gs;
    const matches = [...htmlContent.matchAll(spoilerRegex)];
    
    if (matches.length === 0) {
      return <div 
        className={cn('prose prose-sm max-w-none', className)} 
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let spoilerIndex = 0;

    for (const match of matches) {
      // Добавляем HTML до спойлера
      if (match.index! > lastIndex) {
        const beforeSpoiler = htmlContent.slice(lastIndex, match.index);
        if (beforeSpoiler.trim()) {
          parts.push(
            <div 
              key={`before-${spoilerIndex}`}
              dangerouslySetInnerHTML={{ __html: beforeSpoiler }} 
            />
          );
        }
      }

      // Добавляем интерактивный спойлер
      const spoilerContent = match[1];
      const isRevealed = revealedSpoilers.has(spoilerIndex);
      
      parts.push(
        <div key={`spoiler-${spoilerIndex}`} className="my-2">
          <div
            className={`inline-block cursor-pointer px-3 py-2 rounded transition-all duration-200 text-sm font-medium border ${
              isRevealed 
                ? "bg-muted text-foreground border-border" 
                : "bg-gray-800 text-gray-800 select-none hover:bg-gray-700 border-gray-700"
            }`}
            onClick={() => toggleSpoiler(spoilerIndex)}
            title={isRevealed ? "Скрыть спойлер" : "Показать спойлер"}
          >
            {isRevealed ? (
              <div dangerouslySetInnerHTML={{ __html: spoilerContent }} />
            ) : (
              "СПОЙЛЕР"
            )}
          </div>
        </div>
      );

      lastIndex = match.index! + match[0].length;
      spoilerIndex++;
    }

    // Добавляем оставшийся HTML после последнего спойлера
    if (lastIndex < htmlContent.length) {
      const afterSpoilers = htmlContent.slice(lastIndex);
      if (afterSpoilers.trim()) {
        parts.push(
          <div 
            key="after-spoilers"
            dangerouslySetInnerHTML={{ __html: afterSpoilers }} 
          />
        );
      }
    }

    return (
      <div className={cn('prose prose-sm max-w-none', className)}>
        {parts}
      </div>
    );
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
      `}</style>
      {processContent(content)}
    </>
  );
}
