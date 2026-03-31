import { MainLayout } from "@/components/layout/MainLayout";
import { ClubCard } from "@/components/ui/club-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, SlidersHorizontal, Loader2, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useCatalogClubs } from "@/hooks/use-clubs";
import { AccountActivationBanner } from "@/components/AccountActivationBanner";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function Catalog() {
  const { data: clubsData, isLoading, error } = useCatalogClubs();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const clubs = Array.isArray(clubsData) ? clubsData : [];

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
              <Button 
                onClick={() => setLocation("/clubs/create")} 
                className="w-full whitespace-nowrap sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Создать клуб
              </Button>
            )}
            <div className="flex w-full items-center gap-2 md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Поиск жанров, книг..." className="bg-background pl-9" />
              </div>
              <Button variant="outline" className="shrink-0">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Фильтры
              </Button>
            </div>
          </div>
        </div>

        {/* Баннер активации аккаунта */}
        <AccountActivationBanner />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:col-span-1">
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-5 lg:sticky lg:top-24">
              <h3 className="font-semibold flex items-center gap-2">
                <Filter className="w-4 h-4" /> Фильтры
              </h3>
              <Separator className="my-4" />

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Тип клуба</legend>
                  <div className="space-y-2">
                    {['Все типы', 'Стандарт', 'Клуб Чтеца', 'Премиум'].map((t) => (
                      <div key={t} className="flex items-center gap-2">
                        <input type="checkbox" id={`type-${t}`} className="rounded border-input text-primary focus:ring-primary" />
                        <label htmlFor={`type-${t}`} className="text-sm text-muted-foreground">{t}</label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-3">
                  <label htmlFor="genre-select" className="text-sm font-medium">Жанр</label>
                  <select id="genre-select" className="w-full rounded-md border bg-background px-3 py-2 text-foreground">
                    <option value="all">Все жанры</option>
                    <option value="fiction">Художественная</option>
                    <option value="scifi">Фантастика</option>
                    <option value="mystery">Детектив</option>
                    <option value="classic">Классика</option>
                  </select>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Статус</legend>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="live" className="rounded border-input text-primary focus:ring-primary" />
                      <label htmlFor="live" className="text-sm text-muted-foreground">Читают сейчас</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="open" className="rounded border-input text-primary focus:ring-primary" />
                      <label htmlFor="open" className="text-sm text-muted-foreground">Есть места</label>
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>
          </aside>

          {/* Results Grid */}
          <div className="space-y-6 lg:col-span-3">
            {!isLoading && !error && clubs.length > 0 && (
              <div className="rounded-2xl border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                Найдено клубов: <span className="font-medium text-foreground">{clubs.length}</span>
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
            {!isLoading && !error && clubs.length > 0 && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:gap-6">
                  {clubs.map((club) => {
                    const cover = club.coverImage || undefined;
                    return (
                    <ClubCard
                      key={club.id}
                      id={club.id}
                      title={club.title}
                      bookTitle={club.bookTitle ?? undefined}
                      author={club.author ?? undefined}
                      coverUrl={cover}
                      bookCoverUrl={club.bookCoverUrl ?? undefined}
                      description={club.description || undefined}
                      members={0}
                      maxMembers={0}
                      isLive={false}
                      isPrivate={false}
                      type={"standard"}
                      tags={[]}
                    />
                    );
                  })}
                </div>

                <div className="mt-8 text-center md:mt-12">
                  <Button variant="ghost" size="lg" className="w-full sm:w-auto">Загрузить еще</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
