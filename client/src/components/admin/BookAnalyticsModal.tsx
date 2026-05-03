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
import { Loader2, BookOpen, Clock, Users, TrendingUp, List } from "lucide-react";
import {
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Bar } from "recharts/es6/cartesian/Bar";

interface BookAnalyticsModalProps {
  bookId: string | null;
  bookTitle?: string;
  bookAuthor?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BookAnalytics {
  bookId: string;
  period: string;
  book: {
    title: string;
    author: string;
    coverUrl: string | null;
  } | null;
  opens: number;
  completions: number;
  uniqueReaders: number;
  avgReadingTime: number;
  avgProgress: number;
  completionRate: number;
  popularChapters: Array<{
    chapterNumber: number;
    starts: number;
    completions: number;
    completionRate: number;
  }>;
  eventsTrend: Array<{ date: string; count: number }>;
  dailyEvents: Array<{
    date: string;
    [key: string]: number | string;
  }>;
  topReaders: Array<{
    userId: string;
    username: string;
    events: number;
  }>;
}

// Русские названия типов событий
const eventTypeLabels: Record<string, string> = {
  book_open: 'Открытия',
  chapter_start: 'Начало главы',
  chapter_complete: 'Завершение главы',
  reading_session: 'Сессии чтения',
  bookmark_create: 'Закладки',
  note_create: 'Заметки',
  book_complete: 'Завершения книги',
  club_join: 'Вступления в клуб',
  club_leave: 'Выходы из клуба',
  book_upload: 'Загрузки книги',
};

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
};

export function BookAnalyticsModal({
  bookId,
  bookTitle,
  bookAuthor,
  open,
  onOpenChange,
}: BookAnalyticsModalProps) {
  const { data: analytics, isLoading } = useQuery<BookAnalytics>({
    queryKey: [`/api/v1/analytics/book/${bookId}`],
    queryFn: async () => {
      return apiRequest<BookAnalytics>(`/api/v1/analytics/book/${bookId}`);
    },
    enabled: !!bookId && open,
  });

  // Показываем название книги сразу при открытии модалки (из пропсов)
  const bookDisplayTitle = bookTitle || analytics?.book?.title || "Загрузка...";
  const bookDisplayAuthor = bookAuthor || analytics?.book?.author;

  // Не рендерим если нет bookId
  if (!bookId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Аналитика книги</DialogTitle>
          <DialogDescription>
            {bookDisplayTitle}
            {bookDisplayAuthor && ` — ${bookDisplayAuthor}`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Загрузка данных...</p>
          </div>
        ) : analytics ? (
          <div className="space-y-6">
            {/* Основные метрики */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Открытий</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics.opens.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analytics.uniqueReaders.toLocaleString()} уникальных читателей
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Завершений</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics.completions.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analytics.completionRate}% от открытий
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Среднее время</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatTime(analytics.avgReadingTime)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    За сессию чтения
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Средний прогресс</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.avgProgress}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    При завершении
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Активность по дням - график и список */}
            {analytics.eventsTrend.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Активность по дням
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-2">
                      {analytics.dailyEvents
                        .slice()
                        .reverse()
                        .map((day) => {
                          // Собираем все события за день
                          const total = Object.entries(day)
                            .filter(([key]) => key !== 'date')
                            .reduce((sum, [, val]) => sum + (val as number), 0) as number;

                          const eventDetails = Object.entries(day)
                            .filter(([key]) => key !== 'date')
                            .map(([type, count]) => ({
                              type: eventTypeLabels[type] || type,
                              count: count as number,
                            }))
                            .sort((a, b) => b.count - a.count);

                          return (
                            <div
                              key={day.date}
                              className="border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-medium">
                                  {new Date(day.date).toLocaleDateString('ru-RU', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                                <span className="text-sm font-semibold text-primary">
                                  {total} событий
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {eventDetails.map((event) => (
                                  <span
                                    key={event.type}
                                    className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full"
                                  >
                                    <span className="text-muted-foreground">{event.type}:</span>
                                    <span className="font-medium">{event.count}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* График по главам */}
            {analytics.popularChapters.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Активность по главам</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.popularChapters}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="chapterNumber"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `Глава ${value}`}
                      />
                      <YAxis />
                      <Tooltip
                        formatter={(value?: number) => [value || 0, "События"]}
                        labelFormatter={(value) => `Глава ${value}`}
                      />
                      <Legend />
                      <Bar
                        dataKey="starts"
                        fill="#8884d8"
                        name="Начали"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="completions"
                        fill="#82ca9d"
                        name="Завершили"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Топ читателей */}
            {analytics.topReaders.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Топ читателей</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.topReaders.map((reader, index) => (
                      <div key={reader.userId} className="flex items-center">
                        <div className="font-bold text-muted-foreground mr-4 w-6">
                          #{index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {reader.username}
                          </div>
                        </div>
                        <div className="text-sm font-medium ml-4">
                          {reader.events} событий
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Нет данных для отображения
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
