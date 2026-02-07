import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MoreHorizontal, 
  Search, 
  Download,
  Users2,
  Plus,
  Eye,
  CheckCircle,
  AlertTriangle,
  Calendar,
  User,
  Archive,
  Settings
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAccessToken } from "@/lib/token-store";

interface Club {
  id: string;
  name: string;
  description: string | null;
  book_id: string;
  book_title: string;
  book_author: string;
  creator_username: string;
  status: 'recruiting' | 'active' | 'completed' | 'archived';
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  max_participants: number;
  current_participants: number;
  reading_schedule: any;
  is_public: boolean;
}

interface ClubsResponse {
  clubs: Club[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface ClubsFilters {
  search: string;
  status: string;
  page: number;
  limit: number;
}

async function fetchClubs(filters: ClubsFilters): Promise<ClubsResponse> {
  const token = getAccessToken();
  if (!token) throw new Error('No auth token');

  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  const response = await fetch(`/api/v1/admin/clubs?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch clubs');
  }

  return response.json();
}

async function deleteClub(clubId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('No auth token');

  const response = await fetch(`/api/v1/admin/clubs/${clubId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete club');
  }
}

async function updateClubStatus(clubId: string, status: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('No auth token');

  const response = await fetch(`/api/v1/admin/clubs/${clubId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error('Failed to update club status');
  }
}

async function updateClubMaxMembers(clubId: string, maxMembers: number): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('No auth token');

  const response = await fetch(`/api/v1/admin/clubs/${clubId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ maxMembers }),
  });

  if (!response.ok) {
    throw new Error('Failed to update club');
  }
}

function ClubStatusBadge({ status }: Readonly<{ status: Club['status'] }>) {
  switch (status) {
    case 'recruiting':
      return (
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
          <Users2 className="w-3 h-3 mr-1" />
          Набор участников
        </Badge>
      );
    case 'active':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Активный
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="secondary" className="bg-gray-50 text-gray-700 border-gray-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Завершен
        </Badge>
      );
    case 'archived':
      return (
        <Badge variant="secondary" className="bg-gray-50 text-gray-500 border-gray-200">
          <Archive className="w-3 h-3 mr-1" />
          Архивирован
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function ClubActionsMenu({ club, onEditMaxMembers }: Readonly<{ club: Club; onEditMaxMembers: (club: Club) => void }>) {
  const queryClient = useQueryClient();

  const deleteClubMutation = useMutation({
    mutationFn: (clubId: string) => deleteClub(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ clubId, status }: { clubId: string; status: string }) =>
      updateClubStatus(clubId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
  });

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
        <DropdownMenuItem onClick={() => onEditMaxMembers(club)}>
          <Settings className="w-4 h-4 mr-2" />
          Изменить лимит участников
        </DropdownMenuItem>
        {club.status === 'recruiting' && (
          <DropdownMenuItem
            onClick={() => updateStatusMutation.mutate({ clubId: club.id, status: 'active' })}
            disabled={updateStatusMutation.isPending}
            className="text-green-600"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Активировать
          </DropdownMenuItem>
        )}
        {club.status === 'active' && (
          <DropdownMenuItem
            onClick={() => updateStatusMutation.mutate({ clubId: club.id, status: 'completed' })}
            disabled={updateStatusMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Завершить
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => updateStatusMutation.mutate({ 
            clubId: club.id, 
            status: club.status === 'archived' ? 'active' : 'archived' 
          })}
          disabled={updateStatusMutation.isPending}
          className={club.status === 'archived' ? 'text-green-600' : 'text-gray-600'}
        >
          {club.status === 'archived' ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Восстановить
            </>
          ) : (
            <>
              <Archive className="w-4 h-4 mr-2" />
              Архивировать
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => deleteClubMutation.mutate(club.id)}
          disabled={deleteClubMutation.isPending}
          className="text-red-600"
        >
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClubsTable({ clubs, onEditMaxMembers }: Readonly<{ clubs: Club[]; onEditMaxMembers: (club: Club) => void }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Клуб</th>
            <th className="text-left p-4 font-medium text-gray-600">Книга</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Участники</th>
            <th className="text-left p-4 font-medium text-gray-600">Даты</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <tr key={club.id} className="border-b hover:bg-gray-50">
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{club.name}</div>
                  <div className="text-sm text-gray-500 max-w-xs truncate">
                    {club.description}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <User className="w-3 h-3" />
                      {club.creator_username}
                    </div>
                    {club.is_public ? (
                      <Badge variant="outline" className="text-xs">
                        Публичный
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Приватный
                      </Badge>
                    )}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{club.book_title}</div>
                  <div className="text-sm text-gray-500">{club.book_author}</div>
                </div>
              </td>
              <td className="p-4">
                <ClubStatusBadge status={club.status} />
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div className="font-medium">
                    {club.current_participants} / {club.max_participants}
                  </div>
                  <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ 
                        width: `${Math.min((club.current_participants / club.max_participants) * 100, 100)}%` 
                      }}
                    />
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="w-3 h-3" />
                    Создан: {new Date(club.created_at).toLocaleDateString('ru')}
                  </div>
                  {club.start_date && (
                    <div className="text-gray-500">
                      Старт: {new Date(club.start_date).toLocaleDateString('ru')}
                    </div>
                  )}
                  {club.end_date && (
                    <div className="text-gray-500">
                      Конец: {new Date(club.end_date).toLocaleDateString('ru')}
                    </div>
                  )}
                </div>
              </td>
              <td className="p-4 text-right">
                <ClubActionsMenu club={club} onEditMaxMembers={onEditMaxMembers} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClubsTableSkeleton() {
  const skeletonKeys = ['club-sk-1', 'club-sk-2', 'club-sk-3', 'club-sk-4', 'club-sk-5'];
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Клуб</th>
            <th className="text-left p-4 font-medium text-gray-600">Книга</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Участники</th>
            <th className="text-left p-4 font-medium text-gray-600">Даты</th>
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
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-24" />
              </td>
              <td className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-2 w-20" />
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-24" />
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

export default function AdminClubs() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ClubsFilters>({
    search: '',
    status: 'all',
    page: 1,
    limit: 20,
  });
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [newMaxMembers, setNewMaxMembers] = useState<number>(50);

  const { data, isLoading, error } = useQuery<ClubsResponse>({
    queryKey: ['admin-clubs', filters],
    queryFn: () => fetchClubs(filters),
  });

  const updateMaxMembersMutation = useMutation({
    mutationFn: ({ clubId, maxMembers }: { clubId: string; maxMembers: number }) =>
      updateClubMaxMembers(clubId, maxMembers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      setEditingClub(null);
    },
  });

  const handleEditMaxMembers = (club: Club) => {
    setEditingClub(club);
    setNewMaxMembers(club.max_participants);
  };

  const handleSaveMaxMembers = () => {
    if (editingClub) {
      updateMaxMembersMutation.mutate({ clubId: editingClub.id, maxMembers: newMaxMembers });
    }
  };

  const handleSearchChange = (search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить клубы</p>
            <p className="text-sm text-gray-500 mt-1">{errorMessage}</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Управление клубами</h1>
            <p className="text-gray-600 mt-2">
              {data && `Найдено ${data.pagination.total} клубов`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Экспорт
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать клуб
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Всего клубов</p>
                  <p className="text-2xl font-bold">{data?.pagination.total || 0}</p>
                </div>
                <Users2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Активные</p>
                  <p className="text-2xl font-bold text-green-600">
                    {data?.clubs.filter(c => c.status === 'active').length || 0}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Набирают участников</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {data?.clubs.filter(c => c.status === 'recruiting').length || 0}
                  </p>
                </div>
                <Users2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Завершенные</p>
                  <p className="text-2xl font-bold text-gray-600">
                    {data?.clubs.filter(c => c.status === 'completed').length || 0}
                  </p>
                </div>
                <Archive className="h-8 w-8 text-gray-500" />
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
                    placeholder="Поиск клубов..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={filters.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="recruiting">Набор участников</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="completed">Завершенные</SelectItem>
                  <SelectItem value="archived">Архивированные</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Clubs Table */}
        <Card>
          <CardContent className="p-0">
            {(() => {
              if (isLoading) {
                return <ClubsTableSkeleton />;
              }
              
              if (data && data.clubs.length > 0) {
                return <ClubsTable clubs={data.clubs} onEditMaxMembers={handleEditMaxMembers} />;
              }
              
              return (
                <div className="text-center py-12">
                  <Users2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">Клубы не найдены</h3>
                  <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.pagination.total > filters.limit && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Показано {Math.min(filters.limit, data.pagination.total)} из {data.pagination.total} клубов
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
                Страница {filters.page} из {Math.ceil(data.pagination.total / filters.limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= Math.ceil(data.pagination.total / filters.limit)}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Следующая
              </Button>
            </div>
          </div>
        )}

        {/* Modal for editing max members */}
        <Dialog open={!!editingClub} onOpenChange={(open) => !open && setEditingClub(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Изменить лимит участников</DialogTitle>
              <DialogDescription>
                Клуб: {editingClub?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="maxMembers">Максимальное количество участников</Label>
                <Input
                  id="maxMembers"
                  type="number"
                  min={2}
                  max={2000}
                  value={newMaxMembers}
                  onChange={(e) => setNewMaxMembers(Number.parseInt(e.target.value) || 2)}
                />
                <p className="text-sm text-muted-foreground">
                  Текущее количество участников: {editingClub?.current_participants || 0}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingClub(null)}>
                Отмена
              </Button>
              <Button 
                onClick={handleSaveMaxMembers}
                disabled={updateMaxMembersMutation.isPending}
              >
                {updateMaxMembersMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}