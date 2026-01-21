import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "../../components/layout/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Loader2, TrendingUp, Users, BookOpen, Target, BarChart3, Clock, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface ProjectKPIs {
  // Пользовательские метрики
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  userRetention: number;
  avgSessionDuration: number;
  
  // Контентные метрики
  totalBooks: number;
  personalBooksCount: number;
  booksReadThisMonth: number;
  avgReadingProgress: number;
  completionRate: number;
  
  // Клубные метрики
  totalClubs: number;
  activeClubs: number;
  avgClubSize: number;
  clubEngagement: number;
  
  // Бизнес метрики
  conversionRate: number;
  readerUtilization: number;
  contentGrowth: number;
  
  // Метрики активности
  totalReadingSessions: number;
  totalReadingTime: number;
  avgBooksPerUser: number;
  avgChaptersPerBook: number;
}

interface KPIResponse {
  period: string;
  timestamp: string;
  kpis: ProjectKPIs;
}

export default function KPIDashboard() {
  const [period, setPeriod] = useState('30');

  const { data, isLoading } = useQuery<KPIResponse>({
    queryKey: [`/api/v1/analytics/kpi`, period],
    queryFn: async () => {
      return apiRequest<KPIResponse>(`/api/v1/analytics/kpi?period=${period}`);
    },
  });

  const kpis = data?.kpis;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c'];

  // Данные для графиков
  const userMetricsData = [
    { name: 'Всего пользователей', value: kpis?.totalUsers || 0 },
    { name: 'Активные', value: kpis?.activeUsers || 0 },
    { name: 'Новые за месяц', value: kpis?.newUsersThisMonth || 0 },
  ];

  const contentMetricsData = [
    { name: 'Всего книг', value: kpis?.totalBooks || 0 },
    { name: 'Личные книги', value: kpis?.personalBooksCount || 0 },
    { name: 'Прочитано за месяц', value: kpis?.booksReadThisMonth || 0 },
  ];

  const clubMetricsData = [
    { name: 'Всего клубов', value: kpis?.totalClubs || 0 },
    { name: 'Активные клубы', value: kpis?.activeClubs || 0 },
  ];

  return (
    <AdminLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Эффективность проекта</h1>
            <p className="text-muted-foreground mt-2">
              Ключевые показатели эффективности VoxLibris
            </p>
          </div>
          
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 дней</SelectItem>
              <SelectItem value="30">30 дней</SelectItem>
              <SelectItem value="90">90 дней</SelectItem>
              <SelectItem value="180">180 дней</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Основные KPI карточки */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Активные пользователи</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis?.activeUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                из {kpis?.totalUsers || 0} всего
              </p>
              <div className="mt-2 text-xs text-green-600 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                {((kpis?.activeUsers || 0) / (kpis?.totalUsers || 1) * 100).toFixed(1)}% активности
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Удержание</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis?.userRetention || 0}%</div>
              <p className="text-xs text-muted-foreground">
                пользователей возвращаются
              </p>
              <div className={`mt-2 text-xs ${(kpis?.userRetention || 0) > 50 ? 'text-green-600' : 'text-orange-600'} flex items-center`}>
                <TrendingUp className="h-3 w-3 mr-1" />
                {(kpis?.userRetention || 0) > 50 ? 'Отлично' : 'Требует внимания'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Завершение книг</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis?.completionRate || 0}%</div>
              <p className="text-xs text-muted-foreground">
                прочитано до конца
              </p>
              <div className="mt-2 text-xs text-blue-600 flex items-center">
                <BarChart3 className="h-3 w-3 mr-1" />
                Средний прогресс: {kpis?.avgReadingProgress || 0}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Конверсия</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis?.conversionRate || 0}%</div>
              <p className="text-xs text-muted-foreground">
                пользователей стали читателями
              </p>
              <div className="mt-2 text-xs text-purple-600 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                Утилизация: {kpis?.readerUtilization || 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Секция: Пользовательские метрики */}
        <div className="grid gap-8 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Пользовательские метрики</CardTitle>
              <CardDescription>Активность и вовлеченность пользователей</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={userMetricsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
              
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Средняя сессия</div>
                  <div className="text-xl font-bold flex items-center mt-1">
                    <Clock className="h-4 w-4 mr-2 text-blue-500" />
                    {kpis?.avgSessionDuration || 0} мин
                  </div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Новых за месяц</div>
                  <div className="text-xl font-bold flex items-center mt-1">
                    <Users className="h-4 w-4 mr-2 text-green-500" />
                    {kpis?.newUsersThisMonth || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Контентные метрики</CardTitle>
              <CardDescription>Библиотека и прогресс чтения</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={contentMetricsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {contentMetricsData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Рост контента</div>
                  <div className="text-xl font-bold flex items-center mt-1">
                    <TrendingUp className="h-4 w-4 mr-2 text-green-500" />
                    {kpis?.contentGrowth || 0}%
                  </div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Книг на юзера</div>
                  <div className="text-xl font-bold flex items-center mt-1">
                    <BookOpen className="h-4 w-4 mr-2 text-orange-500" />
                    {kpis?.avgBooksPerUser || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Секция: Клубы и активность */}
        <div className="grid gap-8 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Клубная активность</CardTitle>
              <CardDescription>Статистика книжных клубов</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={clubMetricsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Средний размер</div>
                  <div className="text-xl font-bold">{kpis?.avgClubSize || 0} чел</div>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Активность</div>
                  <div className="text-xl font-bold">{kpis?.clubEngagement || 0} событий</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Активность чтения</CardTitle>
              <CardDescription>Общая статистика чтения</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Всего сессий</div>
                      <div className="text-3xl font-bold mt-1">{kpis?.totalReadingSessions || 0}</div>
                    </div>
                    <Activity className="h-12 w-12 text-blue-500" />
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Время чтения</div>
                      <div className="text-3xl font-bold mt-1">{kpis?.totalReadingTime || 0} ч</div>
                    </div>
                    <Clock className="h-12 w-12 text-green-500" />
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Средне глав/книга</div>
                      <div className="text-3xl font-bold mt-1">{kpis?.avgChaptersPerBook || 0}</div>
                    </div>
                    <BookOpen className="h-12 w-12 text-orange-500" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ссылка на Yandex.Metrika */}
        <Card>
          <CardHeader>
            <CardTitle>Внешняя аналитика</CardTitle>
            <CardDescription>Расширенная веб-аналитика через Yandex.Metrika</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Для детальной аналитики посещаемости, источников трафика и поведенческих факторов
                </p>
                <a 
                  href="https://metrika.yandex.ru/list?id=106167747" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center"
                >
                  Открыть Yandex.Metrika →
                </a>
              </div>
              <img 
                src="/images/ymetrika_logo.png" 
                alt="Yandex.Metrika" 
                className="h-12"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
