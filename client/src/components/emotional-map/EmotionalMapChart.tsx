import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type { EmotionalMap, EmotionalMapPoint, DominantEmotion } from '@/api/emotional-map';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const emotionLabels: Record<DominantEmotion, string> = {
  joy: 'Радость',
  sadness: 'Грусть',
  excitement: 'Восторг',
  tension: 'Напряжение',
  neutral: 'Нейтрально',
};

const chartConfig = {
  totalReactions: {
    label: 'Реакции',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

function formatTimestamp(timestampMs: number): string {
  const totalSeconds = Math.floor(timestampMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getPointLabel(point: EmotionalMapPoint): string {
  const chapter = point.chapterNumber ? ` · глава ${point.chapterNumber}` : '';
  return `${formatTimestamp(point.timestampMs)}${chapter}`;
}

interface EmotionalMapChartProps {
  map: EmotionalMap | null | undefined;
  title?: string;
  description?: string;
}

export function EmotionalMapChart({
  map,
  title = 'Эмоциональная карта',
  description = 'Пики реакций слушателей по таймлайну записи',
}: Readonly<EmotionalMapChartProps>) {
  const points = map?.points ?? [];
  const data = points.map((point) => ({
    ...point,
    label: getPointLabel(point),
    emotionLabel: emotionLabels[point.dominantEmotion],
    reactionsLabel: point.reactions.map((reaction) => `${reaction.emoji} ${reaction.count}`).join(' · '),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={data} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_value, payload) => {
                      const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
                      if (!point) return null;
                      return (
                        <div className="space-y-1">
                          <div>{point.label}</div>
                          <div className="text-muted-foreground">{point.emotionLabel}</div>
                          {point.reactionsLabel ? (
                            <div className="text-muted-foreground">{point.reactionsLabel}</div>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="totalReactions" fill="var(--color-totalReactions)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Для этой сессии пока нет реакций с аудио-таймкодами.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { formatTimestamp, emotionLabels };
