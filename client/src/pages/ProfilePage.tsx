import type { ClubWithDetails } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Edit, Loader2, TrendingUp, Users } from "lucide-react";
import * as React from "react";
import { useLocation, useParams } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { Bookshelf } from "@/components/profile/Bookshelf";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken, getUserFromToken } from "@/lib/token-store";

interface UserProfile {
  id: string;
  userId: string;
  displayName: string | null;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  favoriteGenres: string | null;
  isReader: boolean;
  readerRating: number;
  totalReadingSessions: number;
  totalListeners: number;
  createdAt: string;
  updatedAt: string;
}

interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  format: string;
}

export default function ProfilePage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Если ID не указан, используем ID текущего пользователя
  const profileId =
    id ||
    (() => {
      // Пытаемся получить ID из разных источников
      const userId = getUserFromToken(getAccessToken() || '')?.userId || null;
      return userId || "current";
    })();
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      if (import.meta.env.DEV) {
        console.log("[ProfilePage] Отправляем данные профиля:", {
          hasAvatar: !!data.avatar,
          avatarLength: data.avatar?.length,
          hasCoverImage: !!data.coverImage,
          coverImageLength: data.coverImage?.length,
          ...data,
        });
      }

      const endpoint =
        profileId === "current" ? "/api/users/current/profile" : `/api/users/${profileId}/profile`;
      const token = getAccessToken();

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        if (import.meta.env.DEV) {
          console.error("[ProfilePage] Ошибка сохранения:", error);
        }
        throw new Error("Failed to update profile");
      }

      const result = await response.json();
      if (import.meta.env.DEV) {
        console.log("[ProfilePage] Профиль обновлен:", result);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", profileId] });
      toast({ title: "Профиль обновлен" });
    },
    onError: () => {
      toast({
        title: "Ошибка при обновлении профиля",
        variant: "destructive",
      });
    },
  });

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery<UserProfile>({
    queryKey: ["user-profile", profileId],
    queryFn: async () => {
      const endpoint =
        profileId === "current" ? "/api/users/current/profile" : `/api/users/${profileId}/profile`;
      const token = getAccessToken();

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to load profile");
      const data = await response.json();
      if (import.meta.env.DEV) {
        console.log("[ProfilePage] Загружен профиль:", {
          hasAvatar: !!data.profile?.avatar,
          hasCoverImage: !!data.profile?.coverImage,
          coverImageLength: data.profile?.coverImage?.length,
          profile: data.profile,
        });
      }
      return data.profile;
    },
  });

  const { data: currentBooks = [] } = useQuery<Book[]>({
    queryKey: ["user-current-books", profileId],
    queryFn: async () => {
      // Временная заглушка - будет реализовано позже
      return [];
    },
  });

  const { data: clubs = [], isLoading: clubsLoading } = useQuery<ClubWithDetails[]>({
    queryKey: ["user-clubs", profileId],
    queryFn: async () => {
      const endpoint =
        profileId === "current" ? "/api/users/current/clubs" : `/api/users/${profileId}/clubs`;
      const token = getAccessToken();

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  if (profileLoading) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загружаем профиль...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (profileError || !profile) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12 text-center">
          <p className="text-muted-foreground">Профиль не найден</p>
          <Button variant="outline" onClick={() => setLocation("/")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            На главную
          </Button>
        </div>
      </MainLayout>
    );
  }

  const genres = profile.favoriteGenres
    ? profile.favoriteGenres.split(",").filter((g) => g.trim())
    : [];
  const currentUserId = getUserFromToken(getAccessToken() || '')?.userId || null;
  const isOwnProfile = !id || currentUserId === id || profileId === "current";

  if (import.meta.env.DEV) {
    console.log("[ProfilePage Render] Профиль:", {
      hasCoverImage: !!profile.coverImage,
      coverImagePreview: profile.coverImage?.substring(0, 50),
      hasAvatar: !!profile.avatar,
    });
  }

  return (
    <MainLayout>
      {/* Header / Banner с обложкой */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        {profile.coverImage ? (
          <img
            src={profile.coverImage}
            alt={`Обложка профиля ${profile.displayName}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/60 to-accent/70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />

        <div className="container relative h-full flex flex-col justify-between py-6 px-6 md:px-12">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="text-white hover:bg-white/20 backdrop-blur-sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
          </div>

          {/* Блок профиля внизу обложки */}
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
            <Avatar className="h-32 w-32 border-4 border-background shadow-2xl">
              <AvatarImage src={profile.avatar || ""} />
              <AvatarFallback className="text-3xl bg-primary/20 text-white">
                {profile.displayName?.[0] || "П"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-2 text-white drop-shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                  {profile.displayName || "Пользователь"}
                </h1>
                {profile.isReader && (
                  <Badge
                    variant="secondary"
                    className="w-fit bg-white/90 text-primary hover:bg-white"
                  >
                    🎙️ Чтец
                  </Badge>
                )}
              </div>

              {profile.bio && <p className="text-white/90 text-lg max-w-2xl">{profile.bio}</p>}
            </div>

            {isOwnProfile && (
              <EditProfileDialog
                profile={profile}
                onSave={(data) => updateProfileMutation.mutate(data)}
                isLoading={updateProfileMutation.isPending}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="backdrop-blur-sm bg-white/90 hover:bg-white"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Редактировать
                </Button>
              </EditProfileDialog>
            )}
          </div>
        </div>
      </div>

      <div className="container py-8 px-6 md:px-12">
        {/* Жанры и статистика */}
        <div className="mb-6 space-y-4">
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {genres.map((genre: string) => (
                <Badge key={genre} variant="outline" className="text-sm">
                  {genre}
                </Badge>
              ))}
            </div>
          )}

          {/* Статистика */}
          <div className="grid grid-cols-3 gap-4 p-6 rounded-xl border bg-card">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {profile.totalReadingSessions}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Сессий чтения</div>
            </div>
            <div className="text-center border-x">
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {profile.totalListeners}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Слушателей</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {(profile.readerRating / 100).toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Рейтинг</div>
            </div>
          </div>
        </div>

        {/* Табы с контентом */}
        <Tabs defaultValue="reading" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="reading" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Чтение</span>
            </TabsTrigger>
            <TabsTrigger value="clubs" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Клубы</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Статистика</span>
            </TabsTrigger>
          </TabsList>

          {/* Читательская полка и статус */}
          <TabsContent value="reading">
            <Card>
              <CardHeader>
                <CardTitle>Чтение</CardTitle>
              </CardHeader>
              <CardContent>
                <Bookshelf userId={profileId} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Социальный слой: клубы */}
          <TabsContent value="clubs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Клубы
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clubsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : clubs.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">
                      {isOwnProfile
                        ? "Вы пока не состоите в клубах"
                        : "Пользователь не состоит в клубах"}
                    </p>
                    {isOwnProfile && (
                      <Button
                        variant="outline"
                        onClick={() => setLocation("/catalog")}
                        className="mt-4"
                      >
                        Найти клубы
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {clubs.map((club) => (
                      <Card
                        key={club.id}
                        className="hover:shadow-md transition-all cursor-pointer border-2 hover:border-primary/50"
                        onClick={() => setLocation(`/clubs/${club.id}`)}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-lg">{club.title}</h3>
                                {club.owner?.id === currentUserId && (
                                  <Badge variant="default" className="text-xs">
                                    Создатель
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                            {club.description}
                          </p>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {club.memberCount}
                            </span>
                            {club.book && (
                              <span className="flex items-center gap-1 flex-1 truncate">
                                <BookOpen className="h-4 w-4 flex-shrink-0" />
                                <span className="truncate">{club.book.title}</span>
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Базовая статистика */}
          <TabsContent value="stats">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Статистика чтения
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">2026 год</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-muted-foreground">Прочитано книг</span>
                        <span className="font-semibold text-lg">0</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-muted-foreground">Часов аудио</span>
                        <span className="font-semibold text-lg">0</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                        <span className="font-medium">Цель на год</span>
                        <span className="font-semibold text-lg text-primary">12 книг</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Любимые жанры</h3>
                    <div className="space-y-3">
                      {genres.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">Жанры не указаны</p>
                      ) : (
                        genres.map((genre: string) => (
                          <div
                            key={genre}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <span className="font-medium">{genre}</span>
                            <Badge variant="outline" className="text-xs">
                              0 книг
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
