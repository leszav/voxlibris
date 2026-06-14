import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Headphones, Heart, Mic, Star, Trophy, Users } from "lucide-react";
import soundWaveBg from "@assets/generated_images/abstract_sound_wave_visualization_background.png";

interface ReaderProfile {
  id: string;
  userId: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  favoriteGenres: string | null;
  readerRating: number;
  totalReadingSessions: number;
  totalListeners: number;
  followersCount: number;
}

interface TopReadersResponse {
  readers: ReaderProfile[];
}

function parseFavoriteGenres(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

function getReaderName(reader: ReaderProfile): string {
  return reader.displayName || "Чтец VoxLibris";
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ЧТ";
}

function formatRating(value: number): string {
  return value > 0 ? (value / 100).toFixed(1) : "—";
}

export default function Readers() {
  const { data: readers = [], isLoading, isError } = useQuery({
    queryKey: ["top-readers"],
    queryFn: async () => {
      const response = await apiRequest<TopReadersResponse>("/api/readers/top?limit=12");
      return response.readers;
    },
  });

  return (
    <MainLayout>
      <div className="relative h-64 w-full overflow-hidden bg-stone-900">
        <div className="absolute inset-0 opacity-55">
          <img src={soundWaveBg} alt="Звуковая волна" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900/85 via-stone-900/55 to-transparent" />

        <div className="container relative flex h-full flex-col justify-center space-y-4 px-6 md:px-12">
          <Badge variant="secondary" className="w-fit border-amber-500/20 bg-amber-500/10 text-amber-500">
            <Trophy className="mr-2 h-3.5 w-3.5" />
            Рейтинг чтецов
          </Badge>
          <h1 className="font-serif text-4xl font-bold text-white md:text-5xl">Лучшие Чтецы</h1>
          <p className="max-w-xl text-lg text-stone-300">
            Познакомьтесь с голосами, которые оживляют книги и собирают вокруг историй внимательных слушателей.
          </p>
        </div>
      </div>

      <div className="container px-6 py-12 md:px-12">
        <Tabs defaultValue="all" className="space-y-8">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <TabsList>
                <TabsTrigger value="all">Все чтецы</TabsTrigger>
                <TabsTrigger value="live">Сейчас в эфире</TabsTrigger>
                <TabsTrigger value="rising">Новички</TabsTrigger>
              </TabsList>

            <Button variant="outline" asChild>
              <Link href="/become-reader">Стать чтецом</Link>
            </Button>
          </div>

          <TabsContent value="all" className="space-y-8">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index}>
                    <CardContent className="space-y-4 p-6">
                      <div className="flex gap-4">
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-2/3" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      </div>
                      <Skeleton className="h-12 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center text-sm text-destructive">
                Не удалось загрузить рейтинг чтецов. Попробуйте обновить страницу.
              </div>
            ) : readers.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {readers.map((reader) => (
                  <ReaderCard key={reader.id} reader={reader} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-secondary/20 p-10 text-center text-muted-foreground">
                Рейтинг пока пуст. Первые чтецы появятся после эфиров и заполнения профилей.
              </div>
            )}
          </TabsContent>

          <TabsContent value="live">
            <div className="rounded-xl border border-dashed bg-secondary/20 p-10 text-center text-muted-foreground">
              Сейчас нет активных публичных эфиров в рейтинге. Загляните позже или откройте клубы чтецов.
            </div>
          </TabsContent>

          <TabsContent value="rising">
            <div className="rounded-xl border border-dashed bg-secondary/20 p-10 text-center text-muted-foreground">
              Раздел новичков появится, когда в профилях чтецов будет достаточно свежей статистики.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

function ReaderCard({ reader }: Readonly<{ reader: ReaderProfile }>) {
  const name = getReaderName(reader);
  const genres = parseFavoriteGenres(reader.favoriteGenres);

  return (
    <Card className="overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
              <AvatarImage src={reader.avatar ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold leading-tight">{name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="font-medium text-foreground">{formatRating(reader.readerRating)}</span>
                <span>•</span>
                <span>{reader.followersCount} подписчиков</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-red-500">
            <Heart className="h-4 w-4" />
            <span className="sr-only">Добавить в избранное</span>
          </Button>
        </div>

        <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted-foreground">
          {reader.bio || "Чтец VoxLibris. Ведёт чтения, собирает слушателей и создаёт живое книжное пространство."}
        </p>

        <div className="flex flex-wrap gap-2">
          {genres.length > 0 ? genres.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          )) : (
            <Badge variant="outline" className="text-xs font-normal">Клубное чтение</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            {reader.totalReadingSessions} эфиров
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {reader.totalListeners} слушателей
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/profile/${reader.userId}`}>
              <Headphones className="h-4 w-4" />
              Профиль
            </Link>
          </Button>
          <Button className="gap-2" asChild>
            <Link href={`/profile/${reader.userId}`}>
              <Mic className="h-4 w-4" />
              Слушать
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
