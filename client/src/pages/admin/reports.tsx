import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MoreHorizontal, 
  Search, 
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  Eye,
  MessageSquare,
  User,
  Users2,
  BookOpen
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getAccessToken } from "@/lib/token-store";

interface Report {
  id: string;
  type: 'user' | 'club' | 'book' | 'chat';
  status: 'new' | 'in_progress' | 'resolved' | 'dismissed';
  reported_by: string;
  reported_user_id?: string;
  reported_club_id?: string;
  reported_book_id?: string;
  reported_chat_id?: string;
  title: string;
  description: string;
  reason: string;
  created_at: string;
  updated_at: string;
  assigned_to?: string;
  admin_notes?: string;
}

interface ReportsResponse {
  reports: Report[];
  total: number;
  page: number;
  limit: number;
}

interface ReportsFilters {
  search: string;
  type: string;
  status: string;
  page: number;
  limit: number;
}

async function fetchReports(filters: ReportsFilters): Promise<ReportsResponse> {
  const token = getAccessToken();
  if (!token) throw new Error('No auth token');

  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.type && filters.type !== 'all') params.append('type', filters.type);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  const response = await fetch(`/api/v1/admin/reports?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch reports');
  }

  return response.json();
}

async function updateReportStatus(reportId: string, status: string, notes?: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('No auth token');

  const response = await fetch(`/api/v1/admin/reports/${reportId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status, admin_notes: notes }),
  });

  if (!response.ok) {
    throw new Error('Failed to update report status');
  }
}

function ReportStatusBadge({ status }: Readonly<{ status: Report['status'] }>) {
  switch (status) {
    case 'new':
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Новая
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          В работе
        </Badge>
      );
    case 'resolved':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Решена
        </Badge>
      );
    case 'dismissed':
      return (
        <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
          <X className="w-3 h-3 mr-1" />
          Отклонена
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function ReportTypeBadge({ type }: Readonly<{ type: Report['type'] }>) {
  switch (type) {
    case 'user':
      return (
        <Badge variant="outline">
          <User className="w-3 h-3 mr-1" />
          Пользователь
        </Badge>
      );
    case 'club':
      return (
        <Badge variant="outline">
          <Users2 className="w-3 h-3 mr-1" />
          Клуб
        </Badge>
      );
    case 'book':
      return (
        <Badge variant="outline">
          <BookOpen className="w-3 h-3 mr-1" />
          Книга
        </Badge>
      );
    case 'chat':
      return (
        <Badge variant="outline">
          <MessageSquare className="w-3 h-3 mr-1" />
          Чат
        </Badge>
      );
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

function ReportActionsMenu({ report }: Readonly<{ report: Report }>) {
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: ({ reportId, status, notes }: { reportId: string; status: string; notes?: string }) =>
      updateReportStatus(reportId, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
  });

  const handleUpdateStatus = (status: string) => {
    updateStatusMutation.mutate({ reportId: report.id, status });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Eye className="w-4 h-4 mr-2" />
          Просмотреть детали
        </DropdownMenuItem>
        {report.status === 'new' && (
          <DropdownMenuItem
            onClick={() => handleUpdateStatus('in_progress')}
            disabled={updateStatusMutation.isPending}
            className="text-blue-600"
          >
            <Clock className="w-4 h-4 mr-2" />
            Взять в работу
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => handleUpdateStatus('resolved')}
          disabled={updateStatusMutation.isPending}
          className="text-green-600"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Решить
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleUpdateStatus('dismissed')}
          disabled={updateStatusMutation.isPending}
          className="text-gray-600"
        >
          <X className="w-4 h-4 mr-2" />
          Отклонить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReportsTable({ reports }: Readonly<{ reports: Report[] }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Жалоба</th>
            <th className="text-left p-4 font-medium text-gray-600">Тип</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Подана</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} className="border-b hover:bg-gray-50">
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{report.title}</div>
                  <div className="text-sm text-gray-500 max-w-xs truncate">
                    {report.description}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Причина: {report.reason}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <ReportTypeBadge type={report.type} />
              </td>
              <td className="p-4">
                <ReportStatusBadge status={report.status} />
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div>{new Date(report.created_at).toLocaleDateString('ru')}</div>
                  <div className="text-gray-500">от {report.reported_by}</div>
                  {report.assigned_to && (
                    <div className="text-xs text-blue-600">Назначена: {report.assigned_to}</div>
                  )}
                </div>
              </td>
              <td className="p-4 text-right">
                <ReportActionsMenu report={report} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsTableSkeleton() {
  const skeletonKeys = ['report-sk-1', 'report-sk-2', 'report-sk-3', 'report-sk-4', 'report-sk-5'];
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Жалоба</th>
            <th className="text-left p-4 font-medium text-gray-600">Тип</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Подана</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {skeletonKeys.map((key) => (
            <tr key={key} className="border-b">
              <td className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-20" />
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-20" />
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </td>
              <td className="p-4 text-right">
                <Skeleton className="h-8 w-8" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminReports() {
  const [filters, setFilters] = useState<ReportsFilters>({
    search: '',
    type: 'all',
    status: 'all',
    page: 1,
    limit: 20,
  });

  const { data, isLoading, error } = useQuery<ReportsResponse>({
    queryKey: ['admin-reports', filters],
    queryFn: () => fetchReports(filters),
  });

  const handleSearchChange = (search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 }));
  };

  const handleTypeChange = (type: string) => {
    setFilters(prev => ({ ...prev, type, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить жалобы</p>
            <Button className="mt-4" onClick={() => globalThis.location.reload()}>
              Попробовать снова
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Жалобы и модерация</h1>
            <p className="text-gray-600 mt-2">
              {data && `Найдено ${data.total} жалоб`}
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Всего жалоб</p>
                  <p className="text-2xl font-bold">{data?.total || 0}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Новые</p>
                  <p className="text-2xl font-bold text-red-600">
                    {data?.reports.filter(r => r.status === 'new').length || 0}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">В работе</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {data?.reports.filter(r => r.status === 'in_progress').length || 0}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Решенные</p>
                  <p className="text-2xl font-bold text-green-600">
                    {data?.reports.filter(r => r.status === 'resolved').length || 0}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск жалоб..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={filters.type} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="user">Пользователи</SelectItem>
                  <SelectItem value="club">Клубы</SelectItem>
                  <SelectItem value="book">Книги</SelectItem>
                  <SelectItem value="chat">Чаты</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="new">Новые</SelectItem>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="resolved">Решенные</SelectItem>
                  <SelectItem value="dismissed">Отклоненные</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Reports Table */}
        <Card>
          <CardContent className="p-0">
            {(() => {
              if (isLoading) {
                return <ReportsTableSkeleton />;
              }
              
              if (data && data.reports.length > 0) {
                return <ReportsTable reports={data.reports} />;
              }
              
              return (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">Жалобы не найдены</h3>
                  <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.total > filters.limit && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Показано {Math.min(filters.limit, data.total)} из {data.total} жалоб
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Предыдущая
              </Button>
              <span className="text-sm text-gray-600">
                Страница {filters.page} из {Math.ceil(data.total / filters.limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= Math.ceil(data.total / filters.limit)}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Следующая
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}