import type { ClubWithDetails } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CreditCard, Loader2, TrendingUp, Users, Shield, KeyRound, MessageCircle } from "lucide-react";
import * as React from "react";
import { useLocation, useParams } from "wouter";
import { AchievementShowcase } from "@/components/gamification/AchievementShowcase";
import { MainLayout } from "@/components/layout/MainLayout";
import { Bookshelf } from "@/components/profile/Bookshelf";
import { ProfileClubsContent } from "@/components/profile/ProfileClubsContent";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ReadingStatsPanel } from "@/components/profile/ReadingStatsPanel";
import { ReaderProfileTab } from "@/components/profile/ReaderProfileTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, authFetch } from "@/lib/queryClient";
import type { ProfileGamificationResponse } from "@/types/gamification";
import { PrivacySettingsPanel } from "@/components/social/PrivacySettingsPanel";

interface UserProfile {
  id: string;
  userId: string;
  displayName: string | null;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  profileQuote?: string | null;
  profileQuoteAuthor?: string | null;
  favoriteGenres: string | null;
  isReader: boolean;
  readerRating: number;
  totalReadingSessions: number;
  totalListeners: number;
  createdAt: string;
  updatedAt: string;
}

interface UserSubscription {
  entitlementId: string;
  featureKey: string;
  status: string;
  renewalStatus: "active" | "cancel_at_period_end";
  renewalCancelledAt: string | null;
  startsAt: string;
  endsAt: string | null;
  providerPaymentId: string | null;
  receiptUrl: string | null;
  productTitle: string;
  amountRub: number;
  period: "one_time" | "week" | "month" | "quarter" | "year";
}

function periodLabel(period: UserSubscription["period"]) {
  return { one_time: "разово", week: "неделя", month: "месяц", quarter: "квартал", year: "год" }[period];
}

function formatDate(value: string | null) {
  if (!value) return "Без срока окончания";
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function ProfilePage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();

  // Если ID не указан, используем ID текущего пользователя
  const profileId = id || user?.id || "current";
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      const endpoint =
        profileId === "current" ? "/api/users/current/profile" : `/api/users/${profileId}/profile`;

      const response = await authFetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      return response.json();
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

      const response = await authFetch(endpoint, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to load profile");
      const data = await response.json();
      // debug logs removed
      return data.profile;
    },
  });

  const { data: clubs = [], isLoading: clubsLoading } = useQuery<ClubWithDetails[]>({
    queryKey: ["user-clubs", profileId],
    queryFn: async () => {
      const endpoint =
        profileId === "current" ? "/api/users/current/clubs" : `/api/users/${profileId}/clubs`;

      const response = await authFetch(endpoint, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useQuery<UserSubscription[]>({
    queryKey: ["my-commerce-subscriptions"],
    queryFn: () => apiRequest<UserSubscription[]>("/api/commerce/me/subscriptions"),
    enabled: !id,
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: (entitlementId: string) => apiRequest(`/api/commerce/me/subscriptions/${entitlementId}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-commerce-subscriptions"] });
      toast({ title: "Продление отменено", description: "Доступ сохранён до конца оплаченного периода." });
    },
    onError: () => toast({ title: "Не удалось отменить продление", variant: "destructive" }),
  });

  const {
    data: gamification,
    isLoading: gamificationLoading,
    isError: gamificationError,
  } = useQuery<ProfileGamificationResponse>({
    queryKey: ["profile-gamification", profileId],
    queryFn: async () => {
      const endpoint = profileId === "current"
        ? "/api/gamification/me/achievements"
        : `/api/gamification/users/${profileId}/achievements`;

      return apiRequest<ProfileGamificationResponse>(endpoint);
    },
  });

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [newPasswordError, setNewPasswordError] = React.useState("");
  const passwordAllowedCharsRegex = /^[A-Za-z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]*$/;
  
  // Определяем isOwnProfile здесь, перед использованием
  const currentUserId = user?.id || null;
  const isOwnProfile = !id || currentUserId === id || profileId === "current";

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || 'Не удалось сменить пароль');
      }
      return payload as { message?: string };
    },
    onSuccess: async (data) => {
      toast({
        title: "Пароль обновлен",
        description: data.message || "Войдите снова для продолжения работы",
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      await logout();
      setLocation('/auth/login');
    },
    onError: (error) => {
      toast({
        title: "Ошибка смены пароля",
        description: error instanceof Error ? error.message : "Попробуйте позже",
        variant: "destructive",
      });
    },
  });

  const handlePasswordSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Заполните все поля",
        description: "Для смены пароля требуется заполнить все поля формы",
        variant: "destructive",
      });
      return;
    }

    if (!passwordAllowedCharsRegex.test(newPassword)) {
      toast({
        title: "Некорректный пароль",
        description: "Пароль может содержать только латинские буквы, цифры и спецсимволы",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Пароль слишком короткий",
        description: "Минимальная длина пароля — 8 символов",
        variant: "destructive",
      });
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      toast({
        title: "Пароль слишком простой",
        description: "Пароль должен содержать буквы и цифры",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Пароли не совпадают",
        description: "Проверьте подтверждение нового пароля",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  if (profileLoading) {
    return (
      <MainLayout>
        <div className="container px-4 py-8 sm:px-6 md:px-12 md:py-12">
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
        <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
          <p className="text-muted-foreground">Профиль не найден</p>
          <Button variant="outline" onClick={() => setLocation("/")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            На главную
          </Button>
        </div>
      </MainLayout>
    );
  }

  let tabsListClassName = "grid h-auto w-full gap-1 rounded-xl p-1 grid-cols-3";
  if (isOwnProfile) {
    tabsListClassName = "grid h-auto w-full gap-1 rounded-xl p-1 grid-cols-3 sm:grid-cols-7";
  } else if (profile.isReader) {
    tabsListClassName = "grid h-auto w-full gap-1 rounded-xl p-1 grid-cols-4";
  }

  const genres = profile.favoriteGenres
    ? profile.favoriteGenres.split(",").filter((g) => g.trim())
    : [];

  return (
    <MainLayout>
      {/* Header / Banner с обложкой */}
      <div className="relative min-h-[19rem] w-full overflow-hidden md:min-h-[22rem]">
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

        <div className="container relative flex h-full flex-col justify-between px-4 py-6 sm:px-6 md:px-12">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="h-9 w-full justify-center text-white backdrop-blur-sm hover:bg-white/20 sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
          </div>

          <ProfileHeader
            profile={profile}
            profileId={profileId}
            isOwnProfile={isOwnProfile}
            currentUserId={currentUserId}
            onSaveProfile={(data) => updateProfileMutation.mutate(data)}
            savePending={updateProfileMutation.isPending}
            onStartDm={async () => {
              try {
                const res = await authFetch('/api/dm/conversations', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ recipientId: profileId }),
                });
                const data = await res.json();
                const convId = data.conversation?.id;
                if (convId) {
                  setLocation(`/dashboard?tab=messages&conv=${convId}`);
                } else if (!res.ok) {
                  toast({ title: 'Нельзя написать этому пользователю', variant: 'destructive' });
                }
              } catch {
                toast({ title: 'Не удалось открыть диалог', variant: 'destructive' });
              }
            }}
          />
        </div>
      </div>

      <div className="container px-4 py-6 sm:px-6 md:px-12 md:py-8">
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
          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 sm:gap-4 sm:p-6">
            <div className="rounded-lg bg-muted/30 p-3 text-center sm:bg-transparent sm:p-0">
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {profile.totalReadingSessions}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Сессий чтения</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center sm:rounded-none sm:bg-transparent sm:p-0 sm:border-x">
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {profile.totalListeners}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Слушателей</div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center sm:bg-transparent sm:p-0">
              <div className="text-2xl md:text-3xl font-bold text-primary">
                {(profile.readerRating / 100).toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Рейтинг</div>
            </div>
          </div>

          <AchievementShowcase gamification={gamification} isLoading={gamificationLoading} isError={gamificationError} />

        </div>

        {/* Табы с контентом */}
        <Tabs defaultValue="reading" className="space-y-6">
          <TabsList className={tabsListClassName}>
            <TabsTrigger value="reading" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
              <BookOpen className="h-4 w-4" />
              <span>Чтение</span>
            </TabsTrigger>
            <TabsTrigger value="clubs" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span>Клубы</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
              <TrendingUp className="h-4 w-4" />
              <span>Статистика</span>
            </TabsTrigger>
            {!isOwnProfile && profile.isReader && (
              <TabsTrigger value="reader" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
                <MessageCircle className="h-4 w-4" />
                <span>Чтец</span>
              </TabsTrigger>
            )}
            {isOwnProfile && (
              <TabsTrigger value="subscription" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
                <CreditCard className="h-4 w-4" />
                <span>Подписка</span>
              </TabsTrigger>
            )}
            {isOwnProfile && (
              <TabsTrigger value="security" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
                <Shield className="h-4 w-4" />
                <span>Безопасность</span>
              </TabsTrigger>
            )}
            {isOwnProfile && (
              <TabsTrigger value="privacy" className="flex min-h-10 items-center gap-2 px-2 text-xs sm:text-sm">
                <KeyRound className="h-4 w-4" />
                <span>Приватность</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Читательская полка и статус */}
          <TabsContent value="reading">
            <div className="space-y-4">
              {isOwnProfile && (
                <Card>
                  <CardHeader>
                    <CardTitle>Чтение</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Bookshelf userId={profileId} />
                  </CardContent>
                </Card>
              )}
              {!isOwnProfile && (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    Раздел чтения доступен владельцу профиля.
                  </CardContent>
                </Card>
              )}
            </div>
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
                <ProfileClubsContent
                  clubsLoading={clubsLoading}
                  clubs={clubs}
                  isOwnProfile={isOwnProfile}
                  currentUserId={currentUserId}
                  setLocation={setLocation}
                />
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
                <ReadingStatsPanel userId={profileId} streak={gamification?.streak} />
              </CardContent>
            </Card>
          </TabsContent>

          {!isOwnProfile && profile.isReader && (
            <TabsContent value="reader">
              <ReaderProfileTab
                readerRating={profile.readerRating}
                totalReadingSessions={profile.totalReadingSessions}
                totalListeners={profile.totalListeners}
                gamification={gamification}
              />
            </TabsContent>
          )}

          {isOwnProfile && (
            <TabsContent value="subscription">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Моя подписка
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscriptionsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загружаем подписки...</div>
                  ) : subscriptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Активных платформенных подписок пока нет.</div>
                  ) : subscriptions.map((subscription) => {
                    const renewalCancelled = subscription.renewalStatus === "cancel_at_period_end";
                    return <div key={subscription.entitlementId} className="rounded-lg border p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-semibold">{subscription.productTitle}</div>
                          <div className="text-sm text-muted-foreground">{subscription.amountRub.toLocaleString("ru-RU")} ₽ / {periodLabel(subscription.period)}</div>
                        </div>
                        <Badge variant={renewalCancelled ? "secondary" : "default"}>{renewalCancelled ? "Продление отменено" : "Активна"}</Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <div>Начало: {formatDate(subscription.startsAt)}</div>
                        <div>Окончание: {formatDate(subscription.endsAt)}</div>
                        {renewalCancelled && subscription.renewalCancelledAt && <div>Отмена продления: {formatDate(subscription.renewalCancelledAt)}</div>}
                        {subscription.providerPaymentId && <div>Платёж: {subscription.providerPaymentId}</div>}
                        {subscription.receiptUrl && <a className="text-primary underline" href={subscription.receiptUrl} target="_blank" rel="noreferrer">Открыть чек</a>}
                      </div>
                      <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                        {renewalCancelled ? `Автопродление уже отменено. Доступ сохранён до ${formatDate(subscription.endsAt)}.` : "Можно отменить только следующее продление. Текущий оплаченный доступ сохранится до конца периода."}
                      </div>
                      <Button variant="destructive" onClick={() => cancelSubscriptionMutation.mutate(subscription.entitlementId)} disabled={renewalCancelled || cancelSubscriptionMutation.isPending}>
                        {renewalCancelled ? "Продление уже отменено" : cancelSubscriptionMutation.isPending ? "Отменяем..." : "Отказаться от продления"}
                      </Button>
                    </div>
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isOwnProfile && (
            <TabsContent value="security">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Настройки безопасности
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">Смена пароля</h3>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="current-password">Текущий пароль</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        autoComplete="current-password"
                        disabled={changePasswordMutation.isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new-password">Новый пароль</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!passwordAllowedCharsRegex.test(value)) {
                            setNewPasswordError('Недопустимые символы. Используйте латинские буквы, цифры и спецсимволы');
                            return;
                          }
                          setNewPasswordError('');
                          setNewPassword(value);
                        }}
                        autoComplete="new-password"
                        disabled={changePasswordMutation.isPending}
                      />
                      {newPasswordError && (
                        <p className="text-sm text-red-600">{newPasswordError}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Подтвердите новый пароль</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        disabled={changePasswordMutation.isPending}
                      />
                    </div>

                    <Button type="submit" disabled={changePasswordMutation.isPending} className="w-full sm:w-auto">
                      {changePasswordMutation.isPending ? 'Сохранение...' : 'Сменить пароль'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isOwnProfile && (
            <TabsContent value="privacy">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    Настройки приватности
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PrivacySettingsPanel />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}
