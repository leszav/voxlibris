import { useEffect } from 'react';
import { Rss } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ActivityFeed } from '@/components/feed/ActivityFeed';
import { useFeed, useMarkFeedSeen } from '@/hooks/use-feed';
import { useAuth } from '@/hooks/use-auth';

export default function FeedPage() {
  const { user } = useAuth();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useFeed(
    20,
    user?.id,
  );
  const { mutate: markSeen } = useMarkFeedSeen();

  // Пометить ленту просмотренной при открытии страницы
  useEffect(() => {
    if (user) {
      markSeen();
    }
  }, [user, markSeen]);

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Заголовок */}
        <div className="flex items-center gap-2 mb-6">
          <Rss className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Лента</h1>
        </div>

        {user ? (
          <ActivityFeed
            data={data}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage ?? false}
            fetchNextPage={fetchNextPage}
          />
        ) : (
          <p className="text-center text-muted-foreground py-12">
            Войдите, чтобы видеть ленту активности.
          </p>
        )}
      </div>
    </MainLayout>
  );
}
