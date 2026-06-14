import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ClubCard } from "@/components/ui/club-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, SlidersHorizontal, Loader2, Plus, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useInfiniteCatalogClubs } from "@/hooks/use-clubs";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { AccountActivationBanner } from "@/components/AccountActivationBanner";
import { UserCard, type UserCardData } from "@/components/social/UserCard";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const CLUB_TYPE_LABELS: Record<string, string> = {
  standard: "Стандарт",
  premium: "Премиум",
  "reader-led": "Клуб Чтеца",
  reading_club: "Тихое чтение",
};

function matchesFilters(
  club: { title: string; description: string | null; bookTitle: string | null; author: string | null; type: string; isLive: boolean; memberCount: number; maxMembers: number; tags: string[] },
  q: string,
  selectedTypes: Set<string>,
  filterLive: boolean,
  filterHasPlace: boolean,
  selectedTags: Set<string>,
): boolean {
  if (q) {
    const hay = [club.title, club.description ?? "", club.bookTitle ?? "", club.author ?? ""].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (selectedTypes.size > 0 && !selectedTypes.has(club.type)) return false;
  if (filterLive && !club.isLive) return false;
  if (filterHasPlace && club.maxMembers > 0 && club.memberCount >= club.maxMembers) return false;
  if (selectedTags.size > 0) {
    const clubTagSet = new Set(club.tags);
    for (const tag of selectedTags) {
      if (!clubTagSet.has(tag)) return false;
    }
  }
  return true;
}

export default function Catalog() {
  const cols = useGridColumns();
  // Загружаем 4 полных строки за раз — кратно cols, строки всегда симметричны
  const ROWS_PER_LOAD = 4;
  const pageSize = cols * ROWS_PER_LOAD;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [filterLive, setFilterLive] = useState(false);
  const [filterHasPlace, setFilterHasPlace] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  // Debounce поиска — запрос к серверу только через 400ms после остановки ввода
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteCatalogClubs(debouncedSearch, pageSize);

  const { data: foundUsers = [], isLoading: isUsersLoading } = useQuery({
    queryKey: ["catalog-users-search", debouncedSearch],
    queryFn: async (): Promise<UserCardData[]> => {
      const params = new URLSearchParams({ q: debouncedSearch, type: "all", limit: "8" });
      const res = await apiRequest<{ success: boolean; users: UserCardData[] }>(`/api/users/search?${params}`);
      return res.users;
    },
    enabled: debouncedSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  // Плоский список всех загруженных клубов
  const clubs = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Собираем уникальные теги из всех загруженных клубов
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const club of clubs) {
      for (const tag of club.tags ?? []) set.add(tag);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [clubs]);

  // Клиентская фильтрация применяется только к типу/статусу/тегам
  // (текстовый поиск уже на сервере через debouncedSearch)
  const filtered = useMemo(() => {
    if (!selectedTypes.size && !filterLive && !filterHasPlace && !selectedTags.size) return clubs;
    return clubs.filter((club) =>
      matchesFilters(club, "", selectedTypes, filterLive, filterHasPlace, selectedTags),
    );
  }, [clubs, selectedTypes, filterLive, filterHasPlace, selectedTags]);

  // IntersectionObserver — sentinel в конце списка
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNextPageStable = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchNextPageStable(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPageStable]);

  const hasActiveFilters = selectedTypes.size > 0 || filterLive || filterHasPlace || selectedTags.size > 0;

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }
  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }
  function resetFilters() {
    setSelectedTypes(new Set());
    setFilterLive(false);
    setFilterHasPlace(false);
    setSelectedTags(new Set());
    setSearch("");
  }

  return (
    <MainLayout>
      <div className="container px-4 py-8 sm:px-6 md:px-12 md:py-12">
        <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-primary">Каталог Клубов</h1>
            <p className="text-muted-foreground mt-1">Найдите свое следующее книжное приключение.</p>
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            {isAuthenticated && (
              <Button onClick={() => setLocation("/clubs/create")} className="w-full whitespace-nowrap sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Создать клуб
              </Button>
            )}
            <div className="flex w-full items-center gap-2 md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск жанров, книг..."
                  className="bg-background pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearch("")}
                    aria-label="Очистить поиск"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                variant={filtersVisible ? "default" : "outline"}
                className="shrink-0"
                onClick={() => setFiltersVisible((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Фильтры
                {hasActiveFilters && (
                  <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary text-[11px] font-bold">
                    {selectedTypes.size + (filterLive ? 1 : 0) + (filterHasPlace ? 1 : 0) + selectedTags.size}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        <AccountActivationBanner />

        {debouncedSearch.trim().length >= 2 && (
          <section className="mb-6 rounded-2xl border bg-card/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Люди по запросу</h2>
                <p className="text-sm text-muted-foreground">Чтецы и слушатели по запросу «{debouncedSearch.trim()}»</p>
              </div>
              {!isUsersLoading && foundUsers.length > 0 && (
                <span className="text-xs text-muted-foreground">Найдено: {foundUsers.length}</span>
              )}
            </div>

            {isUsersLoading && (
              <div className="text-sm text-muted-foreground">Ищем пользователей...</div>
            )}

            {!isUsersLoading && foundUsers.length === 0 && (
              <div className="text-sm text-muted-foreground">По запросу не найдено чтецов и слушателей</div>
            )}

            {!isUsersLoading && foundUsers.length > 0 && (
              <div className="space-y-3">
                {foundUsers.map((user) => (
                  <UserCard key={user.id} user={user} />
                ))}
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
          {/* Filters Sidebar */}
          {filtersVisible && (
            <aside className="lg:col-span-1">
              <div className="rounded-2xl border bg-card/60 p-4 sm:p-5 lg:sticky lg:top-24">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Фильтры
                  </h3>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={resetFilters}>
                      <X className="w-3 h-3 mr-1" /> Сбросить
                    </Button>
                  )}
                </div>
                <Separator className="my-4" />

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium">Тип клуба</legend>
                    <div className="space-y-2">
                      {Object.entries(CLUB_TYPE_LABELS).map(([value, label]) => (
                        <div key={value} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`type-${value}`}
                            checked={selectedTypes.has(value)}
                            onChange={() => toggleType(value)}
                            className="rounded border-input text-primary focus:ring-primary"
                          />
                          <label htmlFor={`type-${value}`} className="text-sm text-muted-foreground cursor-pointer">{label}</label>
                        </div>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium">Статус</legend>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="filter-live" checked={filterLive} onChange={(e) => setFilterLive(e.target.checked)} className="rounded border-input text-primary focus:ring-primary" />
                        <label htmlFor="filter-live" className="text-sm text-muted-foreground cursor-pointer">Читают сейчас</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="filter-has-place" checked={filterHasPlace} onChange={(e) => setFilterHasPlace(e.target.checked)} className="rounded border-input text-primary focus:ring-primary" />
                        <label htmlFor="filter-has-place" className="text-sm text-muted-foreground cursor-pointer">Есть места</label>
                      </div>
                    </div>
                  </fieldset>

                  {allTags.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Теги</p>
                      <div className="flex flex-wrap gap-2">
                        {allTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                              selectedTags.has(tag)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}

          {/* Results Grid */}
          <div className={`space-y-6 ${filtersVisible ? "lg:col-span-3" : "lg:col-span-4"}`}>
            {!isLoading && !error && clubs.length > 0 && (
              <div className="rounded-2xl border bg-card/40 px-4 py-3 text-sm text-muted-foreground flex items-center justify-between flex-wrap gap-2">
                <span>
                  {filtered.length === clubs.length
                    ? <>Всего загружено: <span className="font-medium text-foreground">{clubs.length}</span></>
                    : <>Показано: <span className="font-medium text-foreground">{filtered.length}</span> из {clubs.length}</>
                  }
                </span>
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <X className="w-3 h-3" /> Сбросить фильтры
                  </button>
                )}
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Загружаем клубы...</span>
              </div>
            )}

            {!isLoading && error && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-red-600 mb-2">Ошибка загрузки клубов</p>
                <p className="text-sm text-muted-foreground">{error.message}</p>
              </div>
            )}

            {!isLoading && !error && clubs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">Клубы не найдены</p>
              </div>
            )}

            {!isLoading && !error && clubs.length > 0 && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <p className="text-muted-foreground">Нет клубов, подходящих под выбранные фильтры</p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <X className="w-4 h-4 mr-2" /> Сбросить фильтры
                </Button>
              </div>
            )}

            {filtered.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:gap-6">
                {filtered.map((club) => (
                  <ClubCard
                    key={club.id}
                    id={club.id}
                    title={club.title}
                    bookTitle={club.bookTitle ?? undefined}
                    author={club.author ?? undefined}
                    coverUrl={club.coverImage ?? undefined}
                    bookCoverUrl={club.bookCoverUrl ?? undefined}
                    description={club.description || undefined}
                    members={club.memberCount}
                    maxMembers={club.maxMembers}
                    isLive={club.isLive}
                    isPrivate={club.isPrivate}
                    type={club.type as "standard" | "premium" | "reader-led" | "reading_club"}
                    tags={club.tags}
                    readerJoinRequestsEnabled={club.readerJoinRequestsEnabled}
                  />
                ))}
              </div>
            )}

            {/* Sentinel для infinite scroll */}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Загружаем ещё...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
