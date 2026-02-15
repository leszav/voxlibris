import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
  Download,
  KeyRound,
  MoreHorizontal,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { modalAlert } from "@/hooks/use-toast";

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: "user" | "moderator" | "admin";
  status: "active" | "pending" | "suspended" | "deleted";
  created_at: string | null;
  last_active: string | null;
  books_read: number;
  clubs_joined: number;
  clubs_created: number;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

interface UsersFilters {
  search: string;
  role: string;
  status: string;
  page: number;
  limit: number;
}

async function fetchUsers(filters: UsersFilters): Promise<UsersResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.append("search", filters.search);
  if (filters.role && filters.role !== "all") params.append("role", filters.role);
  if (filters.status && filters.status !== "all") params.append("status", filters.status);
  params.append("page", filters.page.toString());
  params.append("limit", filters.limit.toString());

  return apiRequest<UsersResponse>(`/api/v1/admin/users?${params.toString()}`);
}

async function updateUserRole(username: string, role: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${username}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

async function updateUserStatus(username: string, status: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${username}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

async function deleteUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}`, {
    method: "DELETE",
  });
}

async function restoreUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/restore`, {
    method: "PUT",
  });
}

async function permanentDeleteUser(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/permanent`, {
    method: "DELETE",
  });
}

async function resetUserPassword(userId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/users/${userId}/reset-password`, {
    method: "POST",
  });
}

async function fetchDeletedUsers(): Promise<UsersResponse> {
  const data = await apiRequest<{ users: User[] }>("/api/v1/admin/users/deleted");
  return {
    users: data.users,
    total: data.users.length,
    page: 1,
    limit: data.users.length,
  };
}

function UserStatusBadge({ status }: Readonly<{ status: User["status"] }>) {
  switch (status) {
    case "active":
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Активный
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Ожидает
        </Badge>
      );
    case "suspended":
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          <Ban className="w-3 h-3 mr-1" />
          Заблокирован
        </Badge>
      );
    case "deleted":
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          <Trash2 className="w-3 h-3 mr-1" />
          Удален
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function UserRoleBadge({ role }: Readonly<{ role: User["role"] }>) {
  switch (role) {
    case "admin":
      return (
        <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
          <ShieldCheck className="w-3 h-3 mr-1" />
          Администратор
        </Badge>
      );
    case "moderator":
      return (
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
          <Shield className="w-3 h-3 mr-1" />
          Модератор
        </Badge>
      );
    case "user":
      return (
        <Badge variant="outline">
          <UserIcon className="w-3 h-3 mr-1" />
          Пользователь
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

function UserActionsMenu({ user }: Readonly<{ user: User }>) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const updateRoleMutation = useMutation({
    mutationFn: ({ username, role }: { username: string; role: string }) =>
      updateUserRole(username, role),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      const roleNames = {
        admin: "Администратор",
        moderator: "Модератор",
        user: "Пользователь"
      };
      void modalAlert({
        title: "Роль изменена",
        description: `Пользователь ${variables.username} теперь ${roleNames[variables.role as keyof typeof roleNames]}.`,
      });
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Не удалось изменить роль",
        description: error instanceof Error ? error.message : "Произошла ошибка при изменении роли",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ username, status }: { username: string; status: string }) =>
      updateUserStatus(username, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
      setShowDeleteDialog(false);
    },
  });

  const restoreUserMutation = useMutation({
    mutationFn: (userId: string) => restoreUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
    },
  });

  const permanentDeleteUserMutation = useMutation({
    mutationFn: (userId: string) => permanentDeleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deleted-users"] });
      setShowPermanentDeleteDialog(false);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: () => {
      setShowResetDialog(false);
      void modalAlert({
        title: "Письмо отправлено",
        description: `Инструкция по сбросу пароля отправлена пользователю ${user.username}.`,
      });
    },
    onError: (error: unknown) => {
      void modalAlert({
        title: "Не удалось отправить письмо",
        description: error instanceof Error ? error.message : "Ошибка сброса пароля",
        variant: "destructive",
      });
    },
  });

  // Если пользователь удален, показываем только опции восстановления и окончательного удаления
  // Статус 'deleted' теперь типизирован в интерфейсе User
  if (user.status === "deleted") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => restoreUserMutation.mutate(user.id)}
              disabled={restoreUserMutation.isPending}
              className="text-green-600"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Восстановить
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowPermanentDeleteDialog(true)}
              disabled={permanentDeleteUserMutation.isPending}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить окончательно
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog open={showPermanentDeleteDialog} onOpenChange={setShowPermanentDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Окончательное удаление</AlertDialogTitle>
              <AlertDialogDescription>
                Вы уверены, что хотите <strong>окончательно удалить</strong> пользователя{" "}
                <strong>{user.username}</strong>?
                <br />
                <br />
                <span className="text-red-600 font-semibold">
                  Это действие невозможно отменить! Все данные пользователя будут удалены навсегда.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={permanentDeleteUserMutation.isPending}>
                Отмена
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => permanentDeleteUserMutation.mutate(user.id)}
                disabled={permanentDeleteUserMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {permanentDeleteUserMutation.isPending ? "Удаление..." : "Удалить окончательно"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Для обычных пользователей показываем стандартное меню
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user.status === "pending" && (
            <DropdownMenuItem
              onClick={() =>
                updateStatusMutation.mutate({ username: user.username, status: "active" })
              }
              disabled={updateStatusMutation.isPending}
              className="text-green-600"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Активировать
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              updateRoleMutation.mutate({ username: user.username, role: "admin" })
            }
            disabled={user.role === "admin" || updateRoleMutation.isPending}
            className="text-purple-600"
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Сделать администратором
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updateRoleMutation.mutate({ username: user.username, role: "moderator" })
            }
            disabled={user.role === "moderator" || updateRoleMutation.isPending}
          >
            <Shield className="h-4 w-4 mr-2" />
            Сделать модератором
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => updateRoleMutation.mutate({ username: user.username, role: "user" })}
            disabled={user.role === "user" || updateRoleMutation.isPending}
          >
            <UserIcon className="h-4 w-4 mr-2" />
            Сделать пользователем
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updateStatusMutation.mutate({
                username: user.username,
                status: user.status === "suspended" ? "active" : "suspended",
              })
            }
            disabled={updateStatusMutation.isPending}
            className={user.status === "suspended" ? "text-green-600" : "text-orange-600"}
          >
            {user.status === "suspended" ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Разблокировать
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Заблокировать
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowResetDialog(true)}
            disabled={resetPasswordMutation.isPending}
            className="text-orange-600"
          >
            <KeyRound className="h-4 w-4 mr-2" />
            Сбросить пароль
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteUserMutation.isPending}
            className="text-red-600"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтверждение удаления</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить пользователя <strong>{user.username}</strong>?
              Пользователь будет помечен как удаленный и перемещен в список удаленных. Вы сможете
              восстановить его позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserMutation.mutate(user.id)}
              disabled={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteUserMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сброс пароля</AlertDialogTitle>
            <AlertDialogDescription>
              Отправить пользователю <strong>{user.username}</strong> письмо со ссылкой для сброса пароля?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPasswordMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetPasswordMutation.mutate(user.id)}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? "Отправляем..." : "Отправить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UsersTable({ users }: Readonly<{ users: User[] }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Пользователь</th>
            <th className="text-left p-4 font-medium text-gray-600">Роль</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Активность</th>
            <th className="text-left p-4 font-medium text-gray-600">Статистика</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-gray-50">
              <td className="p-4">
                <div>
                  <div className="font-medium text-gray-900">{user.full_name || user.username}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                  <div className="text-xs text-gray-400">@{user.username}</div>
                </div>
              </td>
              <td className="p-4">
                <UserRoleBadge role={user.role} />
              </td>
              <td className="p-4">
                <UserStatusBadge status={user.status} />
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div>
                    Регистрация:{" "}
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("ru") : "-"}
                  </div>
                  <div className="text-gray-500">
                    Последний вход:{" "}
                    {user.last_active && !Number.isNaN(new Date(user.last_active).getTime())
                      ? new Date(user.last_active).toLocaleDateString("ru")
                      : "Никогда"}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div>{user.books_read ?? 0} книг прочитано</div>
                  <div className="text-gray-500">
                    Создал: {user.clubs_created ?? 0} / Участник: {user.clubs_joined ?? 0}
                  </div>
                </div>
              </td>
              <td className="p-4 text-right">
                <UserActionsMenu user={user} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Пользователь</th>
            <th className="text-left p-4 font-medium text-gray-600">Роль</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Активность</th>
            <th className="text-left p-4 font-medium text-gray-600">Статистика</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, idx) => ({ id: `skeleton-${idx}` })).map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
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
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-32" />
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

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState("active");
  const [filters, setFilters] = useState<UsersFilters>({
    search: "",
    role: "all",
    status: "all",
    page: 1,
    limit: 20,
  });

  const { data, isLoading, error } = useQuery<UsersResponse>({
    queryKey: ["admin-users", filters],
    queryFn: () => fetchUsers(filters),
    enabled: activeTab === "active",
  });

  const {
    data: deletedData,
    isLoading: deletedLoading,
    error: deletedError,
  } = useQuery<UsersResponse>({
    queryKey: ["admin-deleted-users"],
    queryFn: fetchDeletedUsers,
    enabled: activeTab === "deleted",
  });

  const handleSearchChange = (search: string) => {
    setFilters((prev) => ({ ...prev, search, page: 1 }));
  };

  const handleRoleChange = (role: string) => {
    setFilters((prev) => ({ ...prev, role, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters((prev) => ({ ...prev, status, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const currentData = activeTab === "deleted" ? deletedData : data;
  const currentLoading = activeTab === "deleted" ? deletedLoading : isLoading;
  const currentError = activeTab === "deleted" ? deletedError : error;

  const renderUsersTable = () => {
    if (currentLoading) {
      return <UsersTableSkeleton />;
    }
    if (currentData && currentData.users.length > 0) {
      return <UsersTable users={currentData.users} />;
    }
    return (
      <div className="text-center py-12">
        <UserIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Пользователи не найдены</h3>
        <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
      </div>
    );
  };

  const renderDeletedTabContent = () => {
    if (currentLoading) {
      return <UsersTableSkeleton />;
    }
    if (currentData && currentData.users.length > 0) {
      return (
        <>
          <div className="p-4 bg-red-50 border-b border-red-200">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-semibold">Удаленные пользователи</p>
            </div>
            <p className="text-sm text-red-600 mt-1">
              Эти пользователи помечены как удаленные. Вы можете восстановить их или удалить
              окончательно.
            </p>
          </div>
          <UsersTable users={currentData.users} />
        </>
      );
    }
    return (
      <div className="text-center py-12">
        <Trash2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Нет удаленных пользователей</h3>
        <p className="text-gray-600 mt-2">Все удаленные пользователи будут отображаться здесь</p>
      </div>
    );
  };

  if (currentError) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить пользователей</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Управление пользователями</h1>
            <p className="text-gray-600 mt-2">
              {currentData ? `Найдено ${currentData.total} пользователей` : "Загрузка..."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Экспорт
            </Button>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Добавить пользователя
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">Активные пользователи</TabsTrigger>
            <TabsTrigger value="deleted" className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Удаленные
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-6">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Поиск пользователей..."
                        value={filters.search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <Select value={filters.role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Роль" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все роли</SelectItem>
                      <SelectItem value="user">Пользователи</SelectItem>
                      <SelectItem value="moderator">Модераторы</SelectItem>
                      <SelectItem value="admin">Администраторы</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      <SelectItem value="active">Активные</SelectItem>
                      <SelectItem value="pending">Ожидают</SelectItem>
                      <SelectItem value="suspended">Заблокированные</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Users Table */}
            <Card>
              <CardContent className="p-0">{renderUsersTable()}</CardContent>
            </Card>

            {/* Pagination */}
            {currentData && currentData.total > filters.limit && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Показано {Math.min(filters.limit, currentData.total)} из {currentData.total}{" "}
                  пользователей
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
                    Страница {filters.page} из {Math.ceil(currentData.total / filters.limit)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={filters.page >= Math.ceil(currentData.total / filters.limit)}
                    onClick={() => handlePageChange(filters.page + 1)}
                  >
                    Следующая
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="deleted" className="space-y-4 mt-6">
            <Card>
              <CardContent className="p-0">{renderDeletedTabContent()}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
