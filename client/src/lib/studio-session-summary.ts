export interface StudioSessionSummaryMetric {
  label: string;
  value: string;
}

export interface BuildStudioSessionSummaryParams {
  elapsedTime: number;
  peakListenerCount?: number | null;
  averageRating?: number | null;
  ratingCount?: number;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function buildStudioSessionSummary({
  elapsedTime,
  peakListenerCount,
  averageRating,
  ratingCount = 0,
}: BuildStudioSessionSummaryParams): StudioSessionSummaryMetric[] {
  return [
    {
      label: 'Время в эфире',
      value: formatElapsed(elapsedTime),
    },
    {
      label: 'Пик слушателей',
      value: String(peakListenerCount ?? 0),
    },
    {
      label: 'Рейтинг за сессию',
      value: averageRating && ratingCount > 0
        ? `${averageRating.toFixed(1)} / 5 (${ratingCount})`
        : 'Нет оценок',
    },
  ];
}
