import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildStudioSessionSummary } from "@/lib/studio-session-summary";
import { apiRequest } from "@/lib/queryClient";
import { SessionEmotionalMapPanel } from "@/components/emotional-map";

interface StudioEndConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function StudioEndConfirmDialog({ open, onCancel, onConfirm }: Readonly<StudioEndConfirmDialogProps>) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Завершить эфир?</h2>
          <p className="text-sm text-muted-foreground">
            Слушатели будут отключены от трансляции. Вы сможете посмотреть краткие итоги сессии после завершения.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>Отмена</Button>
          <Button variant="destructive" onClick={onConfirm}>Да, завершить</Button>
        </div>
      </div>
    </div>
  );
}

interface StudioSummaryDialogProps {
  open: boolean;
  sessionId?: string | null;
  elapsedTime: number;
  listenerCount: number;
  onClose: () => void;
}

interface StudioSessionAnalyticsResponse {
  success: boolean;
  analytics: {
    peakListenerCount?: number | null;
    sessionRating?: {
      averageRating: number | null;
      ratingCount: number;
    };
  };
}

export function StudioSummaryDialog({ open, sessionId, elapsedTime, listenerCount: _listenerCount, onClose }: Readonly<StudioSummaryDialogProps>) {
  const [peakListenerCount, setPeakListenerCount] = useState<number | null>(null);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);

  useEffect(() => {
    if (!open || !sessionId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await apiRequest<StudioSessionAnalyticsResponse>(`/api/session-analytics/sessions/${sessionId}/analytics`);
        if (cancelled) return;

        setPeakListenerCount(response.analytics.peakListenerCount ?? 0);
        setAverageRating(response.analytics.sessionRating?.averageRating ?? null);
        setRatingCount(response.analytics.sessionRating?.ratingCount ?? 0);
      } catch {
        if (cancelled) return;
        setPeakListenerCount(0);
        setAverageRating(null);
        setRatingCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  if (!open) return null;

  const metrics = buildStudioSessionSummary({
    elapsedTime,
    peakListenerCount,
    averageRating,
    ratingCount,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Итоги сессии</h2>
          <p className="text-sm text-muted-foreground">Эфир завершен. Ниже краткая сводка текущей live-сессии.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{metric.value}</p>
            </div>
          ))}
        </div>

        {sessionId ? (
          <div className="mt-6">
            <SessionEmotionalMapPanel sessionId={sessionId} defaultOpen />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
}
