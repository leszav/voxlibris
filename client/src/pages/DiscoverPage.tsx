import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Search } from 'lucide-react';
import { UserCard, type UserCardData } from '@/components/social/UserCard';
import { apiRequest } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/use-debounce';

type UserType = 'all' | 'readers' | 'listeners';

function useUserSearch(q: string, type: UserType) {
  return useQuery({
    queryKey: ['users', 'search', q, type],
    queryFn: async () => {
      const params = new URLSearchParams({ q, type, limit: '30' });
      const res = await apiRequest<{ success: boolean; users: UserCardData[] }>(
        `/api/users/search?${params}`,
      );
      return res.users;
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

export default function DiscoverPage() {
  const [query, setQuery] = React.useState('');
  const [type, setType] = React.useState<UserType>('all');
  const debouncedQuery = useDebounce(query, 300);

  const { data: users, isLoading, isFetching } = useUserSearch(debouncedQuery, type);

  return (
    <MainLayout>
      <div className="container max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Найти людей</h1>
          <p className="text-muted-foreground text-sm">
            Ищите чтецов и слушателей, подписывайтесь на интересных людей
          </p>
        </div>

        {/* Поисковая строка */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени или нику..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Фильтр по типу */}
        <Tabs value={type} onValueChange={(v) => setType(v as UserType)} className="mb-6">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">Все</TabsTrigger>
            <TabsTrigger value="readers" className="flex-1">🎙️ Чтецы</TabsTrigger>
            <TabsTrigger value="listeners" className="flex-1">🎧 Слушатели</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Результаты */}
        {debouncedQuery.length < 2 && (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Введите минимум 2 символа для поиска</p>
          </div>
        )}

        {debouncedQuery.length >= 2 && (isLoading || isFetching) && (
          <div className="space-y-3">
            {(['s1', 's2', 's3', 's4', 's5'] as const).map((key) => (
              <div key={key} className="flex items-center gap-3 p-4 border rounded-lg">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        )}

        {debouncedQuery.length >= 2 && !isLoading && !isFetching && users?.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Никого не найдено по запросу «{debouncedQuery}»</p>
          </div>
        )}

        {users && users.length > 0 && (
          <div className="space-y-3">
            {users.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
