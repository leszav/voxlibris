import { Bell, MessageCircle, Rss, Sparkles, UserRoundSearch } from 'lucide-react';
import { useLocation } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import { ActivityFeed } from '@/components/feed/ActivityFeed';
import { FindFriendsTab } from '@/components/social/FindFriendsTab';
import { FeedUnseenBadge } from '@/components/feed/FeedUnseenBadge';
import { MessagesPanel } from '@/pages/MessagesPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecommendationSection } from '@/components/recommendations/RecommendationSection';
import { useFeed, useMarkFeedSeen } from '@/hooks/use-feed';
import { useNotificationSettings, useUpdateNotificationSettings } from '@/hooks/use-notifications';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';

const DASHBOARD_TABS = ['feed', 'people', 'messages', 'recommendations', 'notifications'] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

function isDashboardTab(value: string | null): value is DashboardTab {
  return !!value && DASHBOARD_TABS.includes(value as DashboardTab);
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useFeed(
    20,
    user?.id,
  );
  const { data: notificationSettings } = useNotificationSettings(!!user);
  const { mutate: updateNotificationSettings } = useUpdateNotificationSettings();
  const { mutate: markSeen } = useMarkFeedSeen();

  const search = globalThis.window?.location?.search ?? '';
  const queryTab = new URLSearchParams(search).get('tab');
  const [activeTab, setActiveTab] = useState<DashboardTab>(isDashboardTab(queryTab) ? queryTab : 'feed');

  useEffect(() => {
    if (isDashboardTab(queryTab)) {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  useEffect(() => {
    if (user) {
      markSeen();
    }
  }, [user, markSeen]);

  const handleTabChange = (value: string) => {
    if (!isDashboardTab(value)) {
      return;
    }

    setActiveTab(value);
    setLocation(`/dashboard?tab=${value}`);
  };

  return (
    <MainLayout>
      <div className="container max-w-6xl px-4 py-6 sm:px-6 md:px-12 md:py-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Личный кабинет</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Персональное пространство для вашей активности, социальных связей и других функций,
              завязанных на вашем аккаунте.
            </p>
          </div>

          <div className="w-full md:max-w-xs xl:min-w-[280px]">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">Новые события</p>
                  <p className="text-xs text-muted-foreground">Лента и обновления от подписок</p>
                </div>
                <FeedUnseenBadge className="text-primary" />
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl p-1 sm:w-fit md:grid-cols-5">
            <TabsTrigger value="feed" className="flex min-h-10 items-center gap-2 px-4">
              <Rss className="h-4 w-4" />
              <span>Лента</span>
            </TabsTrigger>
            <TabsTrigger value="people" className="flex min-h-10 items-center gap-2 px-4">
              <UserRoundSearch className="h-4 w-4" />
              <span>Найти людей</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex min-h-10 items-center gap-2 px-4">
              <MessageCircle className="h-4 w-4" />
              <span>Сообщения</span>
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="flex min-h-10 items-center gap-2 px-4">
              <Sparkles className="h-4 w-4" />
              <span>Рекомендации</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex min-h-10 items-center gap-2 px-4">
              <Bell className="h-4 w-4" />
              <span>Настройка уведомлений</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rss className="h-5 w-5 text-primary" />
                  Лента активности
                </CardTitle>
                <CardDescription>
                  События от людей и сообществ, за которыми вы следите.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityFeed
                  data={data}
                  isLoading={isLoading}
                  isFetchingNextPage={isFetchingNextPage}
                  hasNextPage={hasNextPage ?? false}
                  fetchNextPage={fetchNextPage}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="people">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRoundSearch className="h-5 w-5 text-primary" />
                  Найти людей
                </CardTitle>
                <CardDescription>
                  Ищите чтецов и слушателей, чтобы развивать свою персональную сеть внутри VoxLibris.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FindFriendsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  Сообщения
                </CardTitle>
                <CardDescription>
                  Личные диалоги с другими пользователями платформы.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <MessagesPanel initialConvId={null} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recommendations">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Рекомендации
                </CardTitle>
                <CardDescription>
                  Персональные рекомендации клубов, чтецов, книг и live-сессий.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecommendationSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  Настройка уведомлений
                </CardTitle>
                <CardDescription>
                  Управляйте подпиской на типы уведомлений и каналами доставки.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Каналы доставки</h3>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-email" className="text-sm">Email уведомления</Label>
                    <Switch
                      id="notif-email"
                      checked={notificationSettings?.emailEnabled ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ emailEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-push" className="text-sm">Push уведомления</Label>
                    <Switch
                      id="notif-push"
                      checked={notificationSettings?.pushEnabled ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ pushEnabled: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Типы уведомлений</h3>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-message" className="text-sm">Личные сообщения</Label>
                    <Switch
                      id="notif-message"
                      checked={notificationSettings?.notifyMessage ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ notifyMessage: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-mention" className="text-sm">Упоминания</Label>
                    <Switch
                      id="notif-mention"
                      checked={notificationSettings?.notifyMention ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ notifyMention: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-reply" className="text-sm">Ответы на комментарии</Label>
                    <Switch
                      id="notif-reply"
                      checked={notificationSettings?.notifyReply ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ notifyReply: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-chapter-ready" className="text-sm">Готовность главы</Label>
                    <Switch
                      id="notif-chapter-ready"
                      checked={notificationSettings?.notifyChapterReady ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ notifyChapterReady: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="notif-plan-update" className="text-sm">Обновления плана чтения</Label>
                    <Switch
                      id="notif-plan-update"
                      checked={notificationSettings?.notifyPlanUpdate ?? true}
                      onCheckedChange={(checked) => updateNotificationSettings({ notifyPlanUpdate: checked })}
                    />
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
