import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "../../components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Loader2, TrendingUp, Users, BookOpen, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface AnalyticsStats {
  period: string;
  totalEvents: number;
  eventsByType: Array<{ eventType: string; count: number }>;
  topBooks: Array<{ bookId: string; title: string; author: string; events: number }>;
  topUsers: Array<{ userId: string; username: string; events: number }>;
  clubStats: Array<{ clubId: string; events: number }>;
  avgReadingTime: number;
  eventsTrend: Array<{ date: string; count: number }>;
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('7d');

  const { data: stats, isLoading } = useQuery<AnalyticsStats>({
    queryKey: [`/api/v1/analytics/stats`, period],
    queryFn: async () => {
      return apiRequest<AnalyticsStats>(`/api/v1/analytics/stats?period=${period}`);
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  // Показываем сообщение если нет данных
  if (!stats || stats.totalEvents === 0) {
    return (
      <AdminLayout>
        <div className="container mx-auto py-8 px-4">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">Аналитика платформы</h1>
              <p className="text-muted-foreground mt-2">
                Статистика активности пользователей и популярности контента
              </p>
            </div>
            
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Выберите период" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Последние 7 дней</SelectItem>
                <SelectItem value="30d">Последние 30 дней</SelectItem>
                <SelectItem value="90d">Последние 90 дней</SelectItem>
                <SelectItem value="all">За всё время</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <TrendingUp className="h-16 w-16 text-muted-foreground mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Нет данных за выбранный период</h2>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Данные аналитики собираются автоматически при чтении книг в ридере.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl">
                <h3 className="font-semibold text-blue-900 mb-3">Как начать собирать статистику:</h3>
                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                  <li>Загрузите книгу в личную библиотеку или клуб</li>
                  <li>Откройте книгу через Reader (кнопка "Читать")</li>
                  <li>Начните чтение - события будут отправляться автоматически каждые 30 секунд</li>
                  <li>Вернитесь на эту страницу через минуту - данные появятся</li>
                </ol>
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <p className="text-xs text-blue-700">
                    <strong>Отслеживаемые события:</strong> открытие книги, начало/завершение главы, 
                    сессии чтения, создание закладок и заметок
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  // Форматируем данные для графиков
  const eventTypeColors: Record<string, string> = {
    book_open: '#8884d8',
    chapter_start: '#82ca9d',
    chapter_complete: '#ffc658',
    reading_session: '#ff7c7c',
    bookmark_create: '#a78bfa',
    note_create: '#fb923c',
  };

  const eventTypeLabels: Record<string, string> = {
    book_open: 'Открытие книги',
    chapter_start: 'Начало главы',
    chapter_complete: 'Завершение главы',
    reading_session: 'Сессия чтения',
    bookmark_create: 'Закладка',
    note_create: 'Заметка',
    book_complete: 'Завершение книги',
    club_join: 'Вступление в клуб',
    club_leave: 'Выход из клуба',
    book_upload: 'Загрузка книги',
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
  };

  return (
    <AdminLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Аналитика платформы</h1>
            <p className="text-muted-foreground mt-2">
              Статистика активности пользователей и популярности контента
            </p>
          </div>
          
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Выберите период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Последние 7 дней</SelectItem>
              <SelectItem value="30d">Последние 30 дней</SelectItem>
              <SelectItem value="90d">Последние 90 дней</SelectItem>
              <SelectItem value="all">За всё время</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Основные метрики */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Всего событий</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                События пользователей
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Активных пользователей</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.topUsers.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Пользователи с активностью
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Популярных книг</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.topBooks.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Книги с активностью
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Среднее время чтения</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? formatTime(stats.avgReadingTime) : '-'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                За сессию
              </p>
            </CardContent>
          </Card>
        </div>

        {/* График активности по дням */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Динамика активности</CardTitle>
            <CardDescription>Количество событий по дням</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats?.eventsTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU')}
                  formatter={(value?: number) => [value || 0, 'События']}
                />
                <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* События по типам */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Распределение событий по типам</CardTitle>
            <CardDescription>Какие действия совершают пользователи</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.eventsByType || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="eventType" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => eventTypeLabels[value] || value}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value?: number) => [value || 0, 'События']}
                  labelFormatter={(value) => eventTypeLabels[value] || value}
                />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Топ книг */}
          <Card>
            <CardHeader>
              <CardTitle>Топ-10 популярных книг</CardTitle>
              <CardDescription>По количеству событий</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.topBooks.map((book, index) => (
                  <div key={book.bookId} className="flex items-center">
                    <div className="font-bold text-muted-foreground mr-4 w-6">
                      #{index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{book.title}</div>
                      <div className="text-sm text-muted-foreground truncate">{book.author}</div>
                    </div>
                    <div className="text-sm font-medium ml-4">
                      {book.events} событий
                    </div>
                  </div>
                ))}
                {(!stats?.topBooks || stats.topBooks.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет данных за выбранный период
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Топ пользователей */}
          <Card>
            <CardHeader>
              <CardTitle>Топ-10 активных пользователей</CardTitle>
              <CardDescription>По количеству событий</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats?.topUsers.map((user, index) => (
                  <div key={user.userId} className="flex items-center">
                    <div className="font-bold text-muted-foreground mr-4 w-6">
                      #{index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.username}</div>
                    </div>
                    <div className="text-sm font-medium ml-4">
                      {user.events} событий
                    </div>
                  </div>
                ))}
                {(!stats?.topUsers || stats.topUsers.length === 0) && (
                  <div className="text-center text-muted-foreground py-8">
                    Нет данных за выбранный период
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Яндекс.Метрика */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Яндекс.Метрика</CardTitle>
            <CardDescription>
              Полная веб-аналитика с Вебвизором и картой кликов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Счетчик Яндекс.Метрики установлен на всех страницах сайта. 
              Для просмотра подробной статистики перейдите в личный кабинет Метрики.
            </p>
            <a 
              href="https://metrika.yandex.ru/dashboard?id=106167747" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Открыть Яндекс.Метрику
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
