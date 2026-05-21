import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { ActivityEventCard } from './ActivityEventCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { InfiniteData } from '@tanstack/react-query';
import type { FeedResponse } from '@/api/feed';

interface ActivityFeedProps {
  readonly data: InfiniteData<FeedResponse> | undefined;
  readonly isLoading: boolean;
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly emptyMessage?: string;
}

const FEED_SKELETON_KEYS = [
  'feed-skeleton-1',
  'feed-skeleton-2',
  'feed-skeleton-3',
  'feed-skeleton-4',
  'feed-skeleton-5',
] as const;

export function ActivityFeed({
  data,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  emptyMessage = 'В ленте пока ничего нет. Подпишитесь на чтецов, чтобы видеть их активность.',
}: ActivityFeedProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll через IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {FEED_SKELETON_KEYS.map((key) => (
          <div key={key} className="flex items-start gap-3 py-3 px-1">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const allEvents = data?.pages.flatMap((p) => p.events) ?? [];

  if (allEvents.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">{emptyMessage}</p>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {allEvents.map((event) => (
          <ActivityEventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Sentinel для infinite scroll */}
      <div ref={sentinelRef} className="py-4 flex justify-center">
        {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {!hasNextPage && allEvents.length > 0 && (
          <p className="text-xs text-muted-foreground">Это всё</p>
        )}
      </div>
    </div>
  );
}
