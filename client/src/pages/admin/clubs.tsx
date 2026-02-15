import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Settings,
  UserCog,
  Loader2,
  Lock,
  Unlock
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { modalAlert, modalConfirm } from "@/hooks/use-toast";

interface Club {
  id: string;
  name: string;
  description: string | null;
  book_id: string;
  book_title: string;
  book_author: string;
  creator_username: string;
  status: 'pending' | 'recruiting' | 'active' | 'completed' | 'archived';
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  max_participants: number;
  current_participants: number;
  reading_schedule: unknown;
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
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  return apiRequest<ClubsResponse>(`/api/v1/admin/clubs?${params.toString()}`);
}

async function deleteClub(clubId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}`, {
    method: 'DELETE',
  });
}

async function updateClubStatus(clubId: string, status: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

async function updateClubMaxMembers(clubId: string, maxMembers: number): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}`, {
    method: 'PUT',
    body: JSON.stringify({ maxMembers }),
  });
}

async function approveClub(clubId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/approve`, {
    method: 'PUT',
  });
}

async function rejectClub(clubId: string, reason: string): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/reject`, {
    method: 'PUT',
    body: JSON.stringify({ reason }),
  });
}

async function updateClubPrivacy(clubId: string, isPublic: boolean): Promise<void> {
  await apiRequest(`/api/v1/admin/clubs/${clubId}/privacy`, {
    method: 'PUT',
    body: JSON.stringify({ isPublic }),
  });
}

interface ClubMember {
  id: string;
  username: string;
  role: 'owner' | 'moderator' | 'member';
  joinedAt: Date;
  status: string;
  emailConfirmed: boolean;
  createdAt: Date;
}

async function fetchClubMembers(clubId: string): Promise<ClubMember[]> {
  return apiRequest<ClubMember[]>(`/api/clubs/${clubId}/members`);
}

async function transferClubOwnership(clubId: string, newOwnerId: string): Promise<void> {
  await apiRequest(`/api/clubs/${clubId}/transfer-ownership`, {
    method: 'POST',
    body: JSON.stringify({ newOwnerId }),
  });
}

function ClubStatusBadge({ status }: Readonly<{ status: Club['status'] }>) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          На модерации
        </Badge>
      );
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

function ClubActionsMenu({ 
  club, 
  onEditMaxMembers, 
  onTransferOwnership 
}: Readonly<{ 
  club: Club; 
  onEditMaxMembers: (club: Club) => void;
  onTransferOwnership: (club: Club) => void;
}>) {
  const queryClient = useQueryClient();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

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

  const approveClubMutation = useMutation({
    mutationFn: (clubId: string) => approveClub(clubId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      void modalAlert({
        title: "Клуб одобрен",
        description: "Клуб успешно одобрен и теперь доступен для пользователей",
      });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectClubMutation = useMutation({
    mutationFn: ({ clubId, reason }: { clubId: string; reason: string }) => 
      rejectClub(clubId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      setRejectDialogOpen(false);
      setRejectReason("");
      void modalAlert({
        title: "Клуб отклонён",
        description: "Клуб отклонён, владелец уведомлён по email, клуб удалён",
      });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePrivacyMutation = useMutation({
    mutationFn: ({ clubId, isPublic }: { clubId: string; isPublic: boolean }) =>
      updateClubPrivacy(clubId, isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
    onError: (error: Error) => {
      void modalAlert({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) {
      void modalAlert({
        title: "Ошибка",
        description: "Пожалуйста, укажите причину отклонения",
        variant: "destructive",
      });
      return;
    }
    rejectClubMutation.mutate({ clubId: club.id, reason: rejectReason });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/clubs/${club.id}`} target="_blank" rel="noopener noreferrer">
              <Eye className="w-4 h-4 mr-2" />
              Просмотреть детали
            </a>
          </DropdownMenuItem>

          {/* Переключение приватности клуба */}
          <DropdownMenuItem
            onClick={() => togglePrivacyMutation.mutate({
              clubId: club.id,
              isPublic: !club.is_public
            })}
            disabled={togglePrivacyMutation.isPending}
            className={club.is_public ? "text-amber-600" : "text-green-600"}
          >
            {club.is_public ? (
              <Lock className="w-4 h-4 mr-2" />
            ) : (
              <Unlock className="w-4 h-4 mr-2" />
            )}
            {club.is_public ? "Сделать приватным" : "Сделать публичным"}
          </DropdownMenuItem>

          {/* Кнопки модерации для pending клубов */}
          {club.status === 'pending' && (
            <>
              <DropdownMenuItem
                onClick={() => approveClubMutation.mutate(club.id)}
                disabled={approveClubMutation.isPending}
                className="text-green-600"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Одобрить клуб
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRejectDialogOpen(true)}
                disabled={rejectClubMutation.isPending}
                className="text-red-600"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Отклонить клуб
              </DropdownMenuItem>
            </>
          )}
          
          {/* Обычные действия для других статусов */}
          {club.status !== 'pending' && (
            <>
              <DropdownMenuItem onClick={() => onEditMaxMembers(club)}>
                <Settings className="w-4 h-4 mr-2" />
                Изменить лимит участников
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTransferOwnership(club)}>
                <UserCog className="w-4 h-4 mr-2" />
                Передать владельца
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => updateStatusMutation.mutate({ clubId: club.id, status: 'pending' })}
                disabled={updateStatusMutation.isPending}
                className="text-amber-600"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Отправить на модерацию
              </DropdownMenuItem>
            </>
          )}
          
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
          {club.status !== 'pending' && (
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
          )}
          <DropdownMenuItem
            onClick={() => deleteClubMutation.mutate(club.id)}
            disabled={deleteClubMutation.isPending}
            className="text-red-600"
          >
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Диалог отклонения клуба */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить клуб "{club.name}"</DialogTitle>
            <DialogDescription>
              Укажите причину отклонения. Эта информация будет сохранена и может быть отправлена создателю клуба.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reject-reason">Причина отклонения</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Клуб не соответствует правилам сообщества..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
              }}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={rejectClubMutation.isPending}
            >
              {rejectClubMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Отклоняем...
                </>
              ) : (
                "Отклонить клуб"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClubsTable({ 
  clubs, 
  onEditMaxMembers, 
  onTransferOwnership 
}: Readonly<{ 
  clubs: Club[]; 
  onEditMaxMembers: (club: Club) => void;
  onTransferOwnership: (club: Club) => void;
}>) {
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
                <ClubActionsMenu 
                  club={club} 
                  onEditMaxMembers={onEditMaxMembers}
                  onTransferOwnership={onTransferOwnership}
                />
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
  const [transferringClub, setTransferringClub] = useState<Club | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

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

  const handleTransferOwnership = (club: Club) => {
    setTransferringClub(club);
    setSelectedMemberId(null);
  };

  const { data: clubMembers } = useQuery<ClubMember[]>({
    queryKey: ['club-members', transferringClub?.id],
    queryFn: () => fetchClubMembers(transferringClub!.id),
    enabled: !!transferringClub,
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: ({ clubId, newOwnerId }: { clubId: string; newOwnerId: string }) =>
      transferClubOwnership(clubId, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clubs'] });
      setTransferringClub(null);
      setSelectedMemberId(null);
      void modalAlert({
        title: "Владелец передан",
        description: "Права владельца клуба успешно переданы",
      });
    },
    onError: (error) => {
      void modalAlert({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось передать права",
        variant: "destructive",
      });
    },
  });

  const handleConfirmTransfer = async () => {
    if (!transferringClub || !selectedMemberId) return;

    const selectedMember = clubMembers?.find(m => m.id === selectedMemberId);
    if (!selectedMember) return;

    const confirmed = await modalConfirm({
      title: "Передача прав владельца",
      description:
        `Вы уверены, что хотите передать права владельца клуба "${transferringClub.name}" пользователю ${selectedMember.username}?\n\n` +
        "Это действие нельзя отменить. Текущий владелец станет обычным участником.",
      confirmLabel: "Передать права",
      cancelLabel: "Отмена",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsTransferring(true);
    try {
      await transferOwnershipMutation.mutateAsync({
        clubId: transferringClub.id,
        newOwnerId: selectedMemberId,
      });
    } finally {
      setIsTransferring(false);
    }
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <p className="text-sm text-gray-600">На модерации</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {data?.clubs.filter(c => c.status === 'pending').length || 0}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-500" />
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
                  <SelectItem value="pending">На модерации</SelectItem>
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
                return (
                  <ClubsTable 
                    clubs={data.clubs} 
                    onEditMaxMembers={handleEditMaxMembers}
                    onTransferOwnership={handleTransferOwnership}
                  />
                );
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

        {/* Modal for transferring ownership */}
        <Dialog open={!!transferringClub} onOpenChange={(open) => !open && setTransferringClub(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Передать права владельца</DialogTitle>
              <DialogDescription>
                Клуб: {transferringClub?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Предупреждение */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Внимание!</p>
                    <p className="mt-1">
                      После передачи прав текущий владелец станет обычным участником клуба.
                      Это действие нельзя отменить.
                    </p>
                  </div>
                </div>
              </div>

              {/* Список участников */}
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Выберите нового владельца:
                </span>
                {(() => {
                  if (!clubMembers) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        Загрузка участников...
                      </div>
                    );
                  }

                  const eligibleMembers = clubMembers.filter(m => m.role !== 'owner');
                  if (eligibleMembers.length === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        В клубе нет других участников для передачи прав
                      </div>
                    );
                  }

                  return (
                    <ScrollArea className="h-[300px] border rounded-lg">
                      <div className="p-2 space-y-2">
                        {eligibleMembers.map((member) => (
                          <button
                            key={member.id}
                            onClick={() => setSelectedMemberId(member.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                              selectedMemberId === member.id
                                ? 'bg-primary/10 border-2 border-primary'
                                : 'hover:bg-muted border-2 border-transparent'
                            }`}
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                {member.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left">
                              <p className="font-medium">{member.username}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {member.role === 'moderator' ? 'Модератор' : 'Участник'}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  );
                })()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferringClub(null)}>
                Отмена
              </Button>
              <Button 
                onClick={handleConfirmTransfer}
                disabled={!selectedMemberId || isTransferring}
              >
                {isTransferring ? 'Передача...' : 'Передать права'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
