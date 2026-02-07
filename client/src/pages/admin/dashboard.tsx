import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  BookOpen, 
  Users2, 
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  BarChart3
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AdminStats {
  users: {
    total: number;
    active: number;
    pending: number;
    suspended: number;
    admins: number;
    moderators: number;
  };
  books: {
    total: number;
    active: number;
    blocked: number;
  };
  clubs: {
    total: number;
    active: number;
    recruiting: number;
    completed: number;
    archived: number;
  };
  timestamp: string;
}

async function fetchAdminStats(): Promise<AdminStats> {
  return apiRequest<AdminStats>('/api/v1/admin/stats/overview');
}

function StatCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = "blue" 
}: Readonly<{
  title: string;
  value: string | number;
  change?: string;
  icon: any;
  color?: string;
}>) {
  const getColorClasses = (color: string): string => {
    switch (color) {
      case 'blue': return 'bg-blue-50 text-blue-600';
      case 'green': return 'bg-green-50 text-green-600';
      case 'orange': return 'bg-orange-50 text-orange-600';
      case 'purple': return 'bg-purple-50 text-purple-600';
      default: return 'bg-gray-50 text-gray-600';
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold">{value}</p>
              {change && (
                <Badge variant="secondary" className="text-xs">
                  {change}
                </Badge>
              )}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${getColorClasses(color)}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBreakdown({ 
  title, 
  data, 
  total 
}: Readonly<{ 
  title: string; 
  data: Array<{label: string; value: number; color: string}>; 
  total: number;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold">{item.value}</span>
              <div className="w-20">
                <Progress 
                  value={total > 0 ? (item.value / total) * 100 : 0} 
                  className="h-1"
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  const statKeys = ['stat-sk-1', 'stat-sk-2', 'stat-sk-3', 'stat-sk-4'];
  const breakdownKeys = ['breakdown-sk-1', 'breakdown-sk-2', 'breakdown-sk-3'];
  const itemKeys = ['item-sk-1', 'item-sk-2', 'item-sk-3', 'item-sk-4'];
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statKeys.map((key) => (
          <Card key={key}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-12 w-12 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {breakdownKeys.map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {itemKeys.map((itemKey) => (
                <div key={`${key}-${itemKey}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-3 h-3 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-1 w-20" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading, error } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: fetchAdminStats,
    refetchInterval: 5 * 60 * 1000, // Обновляем каждые 5 минут
  });

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить статистику</p>
            <Button className="mt-4" onClick={() => globalThis.location.reload()}>
              Попробовать снова
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Панель управления</h1>
            <p className="text-gray-600 mt-2">Обзор системы и ключевые метрики</p>
          </div>
          <StatsSkeleton />
        </div>
      </AdminLayout>
    );
  }

  if (!stats) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Нет данных</h3>
            <p className="text-gray-600 mt-2">Статистика недоступна</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const userStatusData = [
    { label: 'Активные', value: stats.users.active, color: 'bg-green-500' },
    { label: 'Ожидают', value: stats.users.pending, color: 'bg-yellow-500' },
    { label: 'Заблокированные', value: stats.users.suspended, color: 'bg-red-500' },
  ];

  const bookStatusData = [
    { label: 'Активные', value: stats.books.active, color: 'bg-green-500' },
    { label: 'Заблокированные', value: stats.books.blocked, color: 'bg-red-500' },
  ];

  const clubStatusData = [
    { label: 'Активные', value: stats.clubs.active, color: 'bg-green-500' },
    { label: 'Набор участников', value: stats.clubs.recruiting, color: 'bg-blue-500' },
    { label: 'Завершенные', value: stats.clubs.completed, color: 'bg-gray-500' },
    { label: 'Архивированные', value: stats.clubs.archived, color: 'bg-gray-400' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Панель управления</h1>
          <p className="text-gray-600 mt-2">
            Обзор системы и ключевые метрики
            {' '}
            <span className="ml-2 text-sm">
              Обновлено: {new Date(stats.timestamp).toLocaleString('ru')}
            </span>
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Всего пользователей"
            value={stats.users.total}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Всего книг"
            value={stats.books.total}
            icon={BookOpen}
            color="green"
          />
          <StatCard
            title="Всего клубов"
            value={stats.clubs.total}
            icon={Users2}
            color="purple"
          />
          <StatCard
            title="Администраторы"
            value={stats.users.admins + stats.users.moderators}
            icon={TrendingUp}
            color="orange"
          />
        </div>

        {/* Status Breakdowns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <StatusBreakdown
            title="Статус пользователей"
            data={userStatusData}
            total={stats.users.total}
          />
          <StatusBreakdown
            title="Статус книг"
            data={bookStatusData}
            total={stats.books.total}
          />
          <StatusBreakdown
            title="Статус клубов"
            data={clubStatusData}
            total={stats.clubs.total}
          />
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Быстрые действия</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Управление пользователями
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Модерация книг
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <Users2 className="h-4 w-4" />
                Управление клубами
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Проверить отчеты
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}