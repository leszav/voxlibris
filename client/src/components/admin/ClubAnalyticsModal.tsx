import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, Activity, LogIn, LogOut, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
} from "recharts";
import { Bar } from "recharts/es6/cartesian/Bar";

interface ClubAnalyticsModalProps {
  clubId: string | null;
  clubTitle?: string;
  period: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClubAnalyticsDetails {
  clubId: string;
  clubTitle: string;
  period: string;
  totalEvents: number;
  joinEvents: number;
  leaveEvents: number;
  totalSessions: number;
  activeMembers: number;
  lastActivityAt: string | null;
  eventsTrend: Array<{ date: string; count: number }>;
  eventsByType: Array<{ eventType: string; count: number }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    username: string | null;
    bookTitle: string | null;
  }>;
}

const eventTypeLabels: Record<string, string> = {
  club_join: 'Вступление',
  club_leave: 'Выход',
  reading_session: 'Сессия чтения',
};

function formatDateTime(value: string | null) {
  if (!value) return 'Нет активности';
  return new Date(value).toLocaleString('ru-RU');
}

function formatEventType(value: string) {
  return eventTypeLabels[value] || value;
}

export function ClubAnalyticsModal({
  clubId,
  clubTitle,
  period,
  open,
  onOpenChange,
}: ClubAnalyticsModalProps) {
  const { data, isLoading } = useQuery<ClubAnalyticsDetails>({
    queryKey: ['/api/v1/analytics/club', clubId, period],
    queryFn: async () => {
      return apiRequest<ClubAnalyticsDetails>(`/api/v1/analytics/club/${clubId}?period=${period}`);
    },
    enabled: Boolean(clubId && open),
  });

  if (!clubId) return null;

  const displayTitle = clubTitle || data?.clubTitle || 'Клуб';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Клубная аналитика</DialogTitle>
          <DialogDescription>{displayTitle}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Всего событий</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.totalEvents.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Активные участники</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.activeMembers.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Сессии чтения</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.totalSessions.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Последняя активность</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-medium">{formatDateTime(data.lastActivityAt)}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Вступления</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-muted-foreground" />
                    {data.joinEvents.toLocaleString()}
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Выходы</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="h-4 w-4 text-muted-foreground" />
                    {data.leaveEvents.toLocaleString()}
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Сессии чтения</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold tabular-nums">
                  {data.totalSessions.toLocaleString()}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Динамика активности клуба</CardTitle>
              </CardHeader>
              <CardContent>
                {data.eventsTrend.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Нет данных за выбранный период</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data.eventsTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) =>
                          new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
                        }
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU')}
                        formatter={(value?: number) => [value || 0, 'События']}
                      />
                      <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Распределение по типам</CardTitle>
              </CardHeader>
              <CardContent>
                {data.eventsByType.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Нет данных за выбранный период</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.eventsByType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="eventType"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatEventType(value)}
                      />
                      <YAxis />
                      <Tooltip
                        formatter={(value?: number) => [value || 0, 'События']}
                        labelFormatter={(value) => formatEventType(value)}
                      />
                      <Bar dataKey="count" fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Последние события клуба</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[260px] pr-2">
                  <div className="space-y-2">
                    {data.recentEvents.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Нет событий за выбранный период</div>
                    ) : (
                      data.recentEvents.map((event) => (
                        <div key={event.id} className="rounded-md border p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">{formatEventType(event.eventType)}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(event.createdAt).toLocaleString('ru-RU')}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {event.username ? `Пользователь: ${event.username}` : 'Пользователь не определен'}
                            {event.bookTitle ? ` • Книга: ${event.bookTitle}` : ''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Не удалось загрузить данные по клубу</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
