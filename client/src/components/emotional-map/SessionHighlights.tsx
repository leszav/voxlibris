import type { EmotionalMapHighlight } from '@/api/emotional-map';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { emotionLabels, formatTimestamp } from './EmotionalMapChart';

interface SessionHighlightsProps {
  highlights: EmotionalMapHighlight[] | null | undefined;
  title?: string;
  description?: string;
}

export function SessionHighlights({
  highlights,
  title = 'Ключевые моменты',
  description = 'Самые заметные эмоциональные пики сессии',
}: Readonly<SessionHighlightsProps>) {
  const items = highlights ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((highlight) => (
              <div
                key={`${highlight.timestampMs}-${highlight.reason}`}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="space-y-1">
                  <div className="font-medium">{highlight.reason}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatTimestamp(highlight.timestampMs)} · {emotionLabels[highlight.dominantEmotion]}
                  </div>
                </div>
                <Badge variant="secondary">{highlight.reactionCount}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Хайлайты появятся после накопления реакций с таймкодами.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
