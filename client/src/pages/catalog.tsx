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
import { useToast } from "@/hooks/use-toast";

interface CatalogClubSettings {
  shortDescription?: string;
}

const parseSettings = (settings: string | null): CatalogClubSettings => {
  if (!settings) return {};
  try {
    return JSON.parse(settings) as CatalogClubSettings;
  } catch {
    return {};
  }
};

export default function Catalog() {
  const { data: clubsData, isLoading, error } = useCatalogClubs();
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const clubs = Array.isArray(clubsData) ? clubsData : [];

  return (
    <MainLayout>
      <div className="container py-12 px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-primary">Каталог Клубов</h1>
            <p className="text-muted-foreground mt-1">Найдите свое следующее книжное приключение.</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {isAuthenticated && (
              <Button 
                onClick={() => setLocation("/clubs/create")} 
                className="whitespace-nowrap"
              >
                <Plus className="h-4 w-4 mr-2" />
                Создать клуб
              </Button>
            )}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск жанров, книг..." className="pl-9 bg-background" />
            </div>
            <Button variant="outline" size="icon">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Баннер активации аккаунта */}
        <AccountActivationBanner />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:col-span-1 space-y-8">
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Filter className="w-4 h-4" /> Фильтры
              </h3>
              <Separator />

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
                <select id="genre-select" className="w-full px-3 py-2 border rounded-md bg-background text-foreground">
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
          </aside>

          {/* Results Grid */}
          <div className="lg:col-span-3">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clubs.map((club) => {
                    const parsed = parseSettings(club.settings);
                    const cover = club.coverImage || undefined;
                    const bookCover = club.book?.coverUrl || undefined;
                    const description = parsed.shortDescription || club.description || club.book?.description;
                    return (
                    <ClubCard
                      key={club.id}
                      id={club.id}
                      title={club.title}
                      bookTitle={club.book?.title}
                      author={club.book?.author}
                      coverUrl={cover}
                      bookCoverUrl={bookCover}
                      description={description || undefined}
                      members={club.memberCount}
                      maxMembers={club.maxMembers}
                      isLive={club.isLive}
                      isPrivate={club.isPrivate}
                      type={club.type}
                      tags={club.tags}
                    />
                    );
                  })}
                </div>

                <div className="mt-12 text-center">
                  <Button variant="ghost" size="lg">Загрузить еще</Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
