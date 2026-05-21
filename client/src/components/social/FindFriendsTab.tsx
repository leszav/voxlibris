import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Search, AlertCircle } from 'lucide-react';
import { UserCard, type UserCardData } from '@/components/social/UserCard';
import { apiRequest } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/use-debounce';

type UserType = 'all' | 'readers' | 'listeners';

export function FindFriendsTab() {
  const [query, setQuery] = React.useState('');
  const [type, setType] = React.useState<UserType>('all');
  const debouncedQuery = useDebounce(query, 300);

  const { data: users, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['users', 'search', debouncedQuery, type],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debouncedQuery, type, limit: '30' });
      const res = await apiRequest<{ success: boolean; users: UserCardData[] }>(
        `/api/users/search?${params}`,
      );
      return res.users;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="space-y-4">
      {/* Поисковая строка */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по имени или нику..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Фильтр */}
      <Tabs value={type} onValueChange={(v) => setType(v as UserType)}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">Все</TabsTrigger>
          <TabsTrigger value="readers" className="flex-1">🎙️ Чтецы</TabsTrigger>
          <TabsTrigger value="listeners" className="flex-1">🎧 Слушатели</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Подсказка */}
      {debouncedQuery.length < 2 && (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Введите минимум 2 символа для поиска</p>
        </div>
      )}

      {/* Ошибка */}
      {isError && (
        <div className="text-center py-10 text-destructive">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm">{error instanceof Error ? error.message : 'Ошибка поиска'}</p>
        </div>
      )}

      {/* Скелетон */}
      {!isError && debouncedQuery.length >= 2 && (isLoading || isFetching) && (
        <div className="space-y-3">
          {(['s1', 's2', 's3', 's4'] as const).map((key) => (
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

      {/* Пустое состояние */}
      {!isError && debouncedQuery.length >= 2 && !isLoading && !isFetching && users?.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Никого не найдено по запросу «{debouncedQuery}»</p>
        </div>
      )}

      {/* Результаты */}
      {!isError && users && users.length > 0 && (
        <div className="space-y-3">
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
