import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronDown, Loader2, MessageCircle, Sparkles, Users, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/queryClient';

type OverviewResponse = {
  success: boolean;
  booksSource: 'activity' | 'community' | 'mixed';
  books: Array<{
    id: string;
    bookId: string;
    title: string;
    author: string;
    coverUrl: string | null;
    completedAt: string;
    source: 'activity' | 'community';
  }>;
  clubs: Array<{
    id: string;
    title: string;
    description: string | null;
    coverImage: string | null;
    isLive: boolean;
    status: string;
  }>;
  readers: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    bio: string | null;
    followersCount: number;
    readerRating: number;
  }>;
  live: Array<{
    sessionId: string;
    clubId: string;
    clubTitle: string;
    sessionTitle: string;
    readerId: string;
    readerName: string | null;
    readerAvatar: string | null;
    startedAt: string;
  }>;
};

type RecommendationEntityType = 'book' | 'club' | 'reader' | 'live';
type BooksSourcePreference = 'all' | 'activity' | 'community';

type PreferencesResponse = {
  success: boolean;
  preferences: {
    excludedTypes: RecommendationEntityType[];
    booksSourcePreference: BooksSourcePreference;
  };
};

type BookItem = OverviewResponse['books'][number];
type ClubItem = OverviewResponse['clubs'][number];
type ReaderItem = OverviewResponse['readers'][number];

function sourceBadgeLabel(source: 'activity' | 'community'): string {
  if (source === 'community') {
    return 'Сообщество рекомендует';
  }
  return 'По активности';
}

type RecommendationSectionKey = 'books' | 'clubs' | 'readers';

function AccordionHeader({
  title,
  count,
  isOpen,
  onClick,
  icon,
}: Readonly<{
  title: string;
  count: number;
  isOpen: boolean;
  onClick: () => void;
  icon: ReactNode;
}>) {
  return (
    <button
      type="button"
      className="mb-3 flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-left"
      onClick={onClick}
    >
      <SectionHeader icon={icon} title={title} />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{count}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
    </button>
  );
}

function BooksSection({
  items,
  isOpen,
  onOpen,
  onDismiss,
  setLocation,
}: Readonly<{
  items: BookItem[];
  isOpen: boolean;
  onOpen: () => void;
  onDismiss: (book: BookItem) => void;
  setLocation: (value: string) => void;
}>) {
  return (
    <div>
      <AccordionHeader
        title="Книги"
        count={items.length}
        isOpen={isOpen}
        onClick={onOpen}
        icon={<BookOpen className="h-4 w-4 text-primary" />}
      />
      {isOpen ? (
        <div className="max-h-[460px] overflow-y-auto pr-1">
          <div className="grid gap-2 md:grid-cols-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет данных из вашей истории чтения.</p>
            ) : (
              items.map((book) => (
                <div key={book.id} className="relative rounded-lg border p-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-7 w-7"
                    onClick={() => onDismiss(book)}
                    title="Скрыть рекомендацию"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="mb-1">
                    <Badge variant={book.source === 'community' ? 'default' : 'secondary'}>
                      {sourceBadgeLabel(book.source)}
                    </Badge>
                  </div>
                  <p className="font-medium pr-8">{book.title}</p>
                  <p className="text-sm text-muted-foreground">{book.author}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/books/${book.bookId}/read`)}>
                      Открыть
                    </Button>
                    <Button size="sm" onClick={() => setLocation('/dashboard?tab=messages')}>
                      <MessageCircle className="mr-1 h-4 w-4" />
                      Порекомендовать в ЛС
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClubsSection({
  items,
  isOpen,
  onOpen,
  onDismiss,
  setLocation,
}: Readonly<{
  items: ClubItem[];
  isOpen: boolean;
  onOpen: () => void;
  onDismiss: (club: ClubItem) => void;
  setLocation: (value: string) => void;
}>) {
  return (
    <div>
      <AccordionHeader
        title="Клубы"
        count={items.length}
        isOpen={isOpen}
        onClick={onOpen}
        icon={<Users className="h-4 w-4 text-primary" />}
      />
      {isOpen ? (
        <div className="max-h-[460px] overflow-y-auto pr-1">
          <div className="grid gap-2 md:grid-cols-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Сейчас нет новых клубов по вашему профилю.</p>
            ) : (
              items.map((club) => (
                <div key={club.id} className="relative rounded-lg border p-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-7 w-7"
                    onClick={() => onDismiss(club)}
                    title="Скрыть рекомендацию"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="mb-1 flex items-center gap-2">
                    <p className="font-medium pr-8">{club.title}</p>
                    {club.isLive ? <Badge>LIVE</Badge> : null}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{club.description || 'Без описания'}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/clubs/${club.id}`)}>
                      Открыть клуб
                    </Button>
                    <Button size="sm" onClick={() => setLocation('/dashboard?tab=messages')}>
                      <MessageCircle className="mr-1 h-4 w-4" />
                      Порекомендовать в ЛС
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReadersSection({
  items,
  isOpen,
  onOpen,
  onDismiss,
  setLocation,
}: Readonly<{
  items: ReaderItem[];
  isOpen: boolean;
  onOpen: () => void;
  onDismiss: (reader: ReaderItem) => void;
  setLocation: (value: string) => void;
}>) {
  return (
    <div>
      <AccordionHeader
        title="Чтецы"
        count={items.length}
        isOpen={isOpen}
        onClick={onOpen}
        icon={<Users className="h-4 w-4 text-primary" />}
      />
      {isOpen ? (
        <div className="max-h-[460px] overflow-y-auto pr-1">
          <div className="grid gap-2 md:grid-cols-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет подходящих чтецов.</p>
            ) : (
              items.map((reader) => (
                <div key={reader.id} className="relative rounded-lg border p-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-7 w-7"
                    onClick={() => onDismiss(reader)}
                    title="Скрыть рекомендацию"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <p className="font-medium pr-8">{reader.displayName || reader.username}</p>
                  <p className="text-sm text-muted-foreground">@{reader.username}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Подписчики: {reader.followersCount}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/users/${reader.id}`)}>
                      Профиль
                    </Button>
                    <Button size="sm" onClick={() => setLocation('/dashboard?tab=messages')}>
                      <MessageCircle className="mr-1 h-4 w-4" />
                      Порекомендовать в ЛС
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeader({ icon, title }: Readonly<{ icon: ReactNode; title: string }>) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    </div>
  );
}

export function RecommendationSection() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [locallyDismissed, setLocallyDismissed] = useState<Set<string>>(new Set());
  const [openSection, setOpenSection] = useState<RecommendationSectionKey>('books');

  const { data, isLoading, isError } = useQuery<OverviewResponse>({
    queryKey: ['recommendations', 'overview'],
    queryFn: () => apiRequest<OverviewResponse>('/api/recommendations/overview'),
    staleTime: 60_000,
  });

  const { data: preferencesData } = useQuery<PreferencesResponse>({
    queryKey: ['recommendations', 'preferences'],
    queryFn: () => apiRequest<PreferencesResponse>('/api/recommendations/preferences'),
    staleTime: 60_000,
  });

  const preferences = preferencesData?.preferences ?? {
    excludedTypes: [] as RecommendationEntityType[],
    booksSourcePreference: 'all' as BooksSourcePreference,
  };

  const updatePreferencesMutation = useMutation({
    mutationFn: (payload: Partial<PreferencesResponse['preferences']>) =>
      apiRequest<PreferencesResponse>('/api/recommendations/preferences', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations', 'overview'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (payload: { entityType: RecommendationEntityType; entityId: string; source?: 'activity' | 'community' }) =>
      apiRequest('/api/recommendations/dismiss', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations', 'overview'] });
    },
  });

  const hidden = (entityType: RecommendationEntityType, entityId: string): boolean =>
    locallyDismissed.has(`${entityType}:${entityId}`);

  const dismissCard = (entityType: RecommendationEntityType, entityId: string, source?: 'activity' | 'community') => {
    setLocallyDismissed((prev) => new Set(prev).add(`${entityType}:${entityId}`));
    dismissMutation.mutate({ entityType, entityId, source });
  };

  const updateExcludedType = (type: RecommendationEntityType, enabled: boolean) => {
    const current = new Set<RecommendationEntityType>(preferences.excludedTypes);
    if (enabled) {
      current.delete(type);
    } else {
      current.add(type);
    }

    updatePreferencesMutation.mutate({ excludedTypes: Array.from(current) });
  };

  const visibleBooks = useMemo(
    () => (data?.books ?? []).filter((book) => !hidden('book', book.bookId)),
    [data?.books, locallyDismissed],
  );

  const visibleClubs = useMemo(
    () => (data?.clubs ?? []).filter((club) => !hidden('club', club.id)),
    [data?.clubs, locallyDismissed],
  );

  const visibleReaders = useMemo(
    () => (data?.readers ?? []).filter((reader) => !hidden('reader', reader.id)),
    [data?.readers, locallyDismissed],
  );

  const activeFiltersCount = useMemo(() => {
    let count = preferences.excludedTypes.length;
    if (preferences.booksSourcePreference !== 'all') {
      count += 1;
    }
    return count;
  }, [preferences.booksSourcePreference, preferences.excludedTypes.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Не удалось загрузить рекомендации.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            {data.booksSource === 'community'
              ? 'Подборка сообщества для старта'
              : 'Подборка на основе вашей активности'}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={activeFiltersCount > 0 ? 'default' : 'secondary'}>
              Фильтры: {activeFiltersCount > 0 ? `${activeFiltersCount} активны` : 'не заданы'}
            </Badge>
          </div>
          {data.booksSource === 'community' ? (
            <p className="text-sm text-muted-foreground">
              Новым аккаунтам мы показываем книги, которые пользователи чаще рекомендуют друг другу в личных сообщениях, с учетом выбранных жанров.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
            <p className="text-sm font-medium">Персональные фильтры</p>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border bg-background p-2">
                <Label htmlFor="show-books" className="text-sm">Показывать книги</Label>
                <Switch
                  id="show-books"
                  checked={!preferences.excludedTypes.includes('book')}
                  onCheckedChange={(checked) => updateExcludedType('book', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background p-2">
                <Label htmlFor="show-clubs" className="text-sm">Показывать клубы</Label>
                <Switch
                  id="show-clubs"
                  checked={!preferences.excludedTypes.includes('club')}
                  onCheckedChange={(checked) => updateExcludedType('club', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background p-2">
                <Label htmlFor="show-readers" className="text-sm">Показывать чтецов</Label>
                <Switch
                  id="show-readers"
                  checked={!preferences.excludedTypes.includes('reader')}
                  onCheckedChange={(checked) => updateExcludedType('reader', checked)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="books-source-filter" className="text-sm">Источник книжных рекомендаций</Label>
              <select
                id="books-source-filter"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={preferences.booksSourcePreference}
                onChange={(e) => updatePreferencesMutation.mutate({ booksSourcePreference: e.target.value as BooksSourcePreference })}
              >
                <option value="all">Все источники</option>
                <option value="activity">Только по активности</option>
                <option value="community">Только от сообщества</option>
              </select>
            </div>
          </div>

          <BooksSection
            items={visibleBooks}
            isOpen={openSection === 'books'}
            onOpen={() => setOpenSection('books')}
            onDismiss={(book) => dismissCard('book', book.bookId, book.source)}
            setLocation={setLocation}
          />

          <ClubsSection
            items={visibleClubs}
            isOpen={openSection === 'clubs'}
            onOpen={() => setOpenSection('clubs')}
            onDismiss={(club) => dismissCard('club', club.id)}
            setLocation={setLocation}
          />

          <ReadersSection
            items={visibleReaders}
            isOpen={openSection === 'readers'}
            onOpen={() => setOpenSection('readers')}
            onDismiss={(reader) => dismissCard('reader', reader.id)}
            setLocation={setLocation}
          />

        </CardContent>
      </Card>
    </div>
  );
}
