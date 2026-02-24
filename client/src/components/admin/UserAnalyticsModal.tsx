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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, CheckCircle2, Clock, Activity, Users } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface UserAnalyticsModalProps {
  userId: string | null;
  username?: string;
  period: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserAnalyticsData {
  userId: string;
  username: string;
  period: string;
  totalBooksStarted: number;
  totalBooksCompleted: number;
  totalReadingTime: number; // минуты
  avgSessionDuration: number; // секунды
  books: Array<{
    bookId: string;
    title: string;
    author?: string;
    progress: number;
    events: number;
    started: boolean;
    completed: boolean;
    lastActivityAt: string | null;
  }>;
  clubs: Array<{
    clubId: string;
    clubTitle: string;
    role: string;
    events: number;
    lastActivityAt: string | null;
  }>;
  activityTrend: Array<{ date: string; events: number }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    bookTitle: string | null;
    clubTitle: string | null;
    createdAt: string;
  }>;
}

const eventTypeLabels: Record<string, string> = {
  book_open: 'Открытие книги',
  chapter_start: 'Начало главы',
  chapter_complete: 'Завершение главы',
  reading_session: 'Сессия чтения',
  bookmark_create: 'Создание закладки',
  note_create: 'Создание заметки',
  book_complete: 'Завершение книги',
  club_join: 'Вступление в клуб',
  club_leave: 'Выход из клуба',
  book_upload: 'Загрузка книги',
};

const roleLabels: Record<string, string> = {
  owner: 'Владелец',
  moderator: 'Модератор',
  member: 'Участник',
};

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return '0 мин';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours} ч ${rem} мин`;
}

function formatEventType(value: string) {
  return eventTypeLabels[value] || value;
}

export function UserAnalyticsModal({
  userId,
  username,
  period,
  open,
  onOpenChange,
}: UserAnalyticsModalProps) {
  const { data, isLoading } = useQuery<UserAnalyticsData>({
    queryKey: ['/api/v1/analytics/user', userId, period],
    queryFn: async () => {
      return apiRequest<UserAnalyticsData>(`/api/v1/analytics/user/${userId}?period=${period}`);
    },
    enabled: Boolean(userId && open),
  });

  if (!userId) return null;

  const userDisplayName = username || data?.username || 'Пользователь';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Профиль пользователя</DialogTitle>
          <DialogDescription>{userDisplayName}</DialogDescription>
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
                  <CardTitle className="text-sm font-medium">Книг начато</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.totalBooksStarted.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Книг завершено</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.totalBooksCompleted.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Время чтения</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.totalReadingTime.toLocaleString()} мин</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Средняя сессия</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatDuration(data.avgSessionDuration)}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Книги и прогресс</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-2">
                    <div className="space-y-3">
                      {data.books.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Нет данных по книгам</div>
                      ) : (
                        data.books.map((book) => (
                          <div key={book.bookId} className="rounded-md border p-2.5">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{book.title}</div>
                                {book.author && (
                                  <div className="text-xs text-muted-foreground truncate">{book.author}</div>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-semibold tabular-nums">{book.progress}%</div>
                                {book.completed && (
                                  <Badge variant="secondary" className="text-[10px] mt-1">Завершена</Badge>
                                )}
                              </div>
                            </div>
                            <Progress value={book.progress} className="h-2" />
                            <div className="text-xs text-muted-foreground mt-2">
                              {book.events.toLocaleString()} событий
                              {book.lastActivityAt
                                ? ` • Последняя активность: ${new Date(book.lastActivityAt).toLocaleString('ru-RU')}`
                                : ''}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Клубы пользователя
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-2">
                    <div className="space-y-2">
                      {data.clubs.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Нет активных клубов</div>
                      ) : (
                        data.clubs.map((club) => (
                          <div key={club.clubId} className="rounded-md border p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium truncate">{club.clubTitle}</div>
                              <Badge variant="outline" className="text-[10px]">
                                {roleLabels[club.role] || club.role}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Активность: {club.events.toLocaleString()} событий
                              {club.lastActivityAt
                                ? ` • ${new Date(club.lastActivityAt).toLocaleString('ru-RU')}`
                                : ''}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Активность по дням</CardTitle>
              </CardHeader>
              <CardContent>
                {data.activityTrend.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Нет событий за выбранный период</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data.activityTrend}>
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
                      <Line type="monotone" dataKey="events" stroke="#16a34a" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Последние события пользователя</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[280px] pr-2">
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
                            {event.bookTitle ? `Книга: ${event.bookTitle}` : 'Без привязки к книге'}
                            {event.clubTitle ? ` • Клуб: ${event.clubTitle}` : ''}
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
          <div className="text-sm text-muted-foreground">Не удалось загрузить профиль пользователя</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
