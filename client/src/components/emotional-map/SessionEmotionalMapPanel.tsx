import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, ChevronDown } from 'lucide-react';

import { emotionalMapApi } from '@/api/emotional-map';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EmotionalMapChart } from './EmotionalMapChart';
import { SessionHighlights } from './SessionHighlights';

interface SessionEmotionalMapPanelProps {
  sessionId: string;
  defaultOpen?: boolean;
}

export function SessionEmotionalMapPanel({ sessionId, defaultOpen = false }: Readonly<SessionEmotionalMapPanelProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const mapQuery = useQuery({
    queryKey: ['reading-session', sessionId, 'emotional-map'],
    queryFn: () => emotionalMapApi.getEmotionalMap(sessionId),
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });

  return (
    <section className="rounded-2xl bg-muted/40 p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Эмоции эфира</span>
            <span className="block text-xs text-muted-foreground">Пики реакций и ключевые моменты</span>
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {mapQuery.isLoading || mapQuery.isFetching ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : null}

          {mapQuery.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Не удалось загрузить эмоциональную карту</div>
                  <div className="text-xs opacity-90">
                    {mapQuery.error instanceof Error ? mapQuery.error.message : 'Попробуйте открыть блок позже.'}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void mapQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : null}

          {mapQuery.data && !mapQuery.isFetching ? (
            <div className="space-y-4">
              <EmotionalMapChart
                map={mapQuery.data}
                title="Карта реакций"
                description="Где слушатели сильнее всего реагировали во время эфира"
              />
              <SessionHighlights highlights={mapQuery.data.highlights} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
