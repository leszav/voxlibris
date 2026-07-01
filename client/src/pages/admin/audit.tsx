import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Eye,
  Filter,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  User as UserIcon,
  AlertTriangle,
  CheckCircle,
  Settings
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativePickerInput } from "@/components/ui/native-picker-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AdminAction {
  id: string;
  adminId: string;
  adminUsername: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason?: string;
  previousValue?: string;
  newValue?: string;
  metadata?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface AuditStats {
  totalActions: number;
  actionsByType: Record<string, number>;
  actionsByAdmin: Record<string, { count: number; username: string }>;
  impersonationCount: number;
  recentActions: AdminAction[];
}

interface SecuritySettings {
  'security.impersonation.enabled': string;
  'security.impersonation.log_retention_days': string;
  'security.admin_session_timeout': string;
}

const ACTION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  impersonate: { label: 'Имперсонация', icon: <UserIcon className="h-3 w-3" />, variant: 'outline' },
  block_user: { label: 'Блокировка пользователя', icon: <ShieldAlert className="h-3 w-3" />, variant: 'destructive' },
  unblock_user: { label: 'Разблокировка пользователя', icon: <ShieldCheck className="h-3 w-3" />, variant: 'secondary' },
  change_user_role: { label: 'Изменение роли', icon: <Settings className="h-3 w-3" />, variant: 'default' },
  change_user_status: { label: 'Изменение статуса', icon: <Settings className="h-3 w-3" />, variant: 'default' },
  delete_user: { label: 'Удаление пользователя', icon: <AlertTriangle className="h-3 w-3" />, variant: 'destructive' },
  reset_password: { label: 'Сброс пароля', icon: <Shield className="h-3 w-3" />, variant: 'outline' },
  update_settings: { label: 'Обновление настроек', icon: <Settings className="h-3 w-3" />, variant: 'default' },
};

export default function AuditPage() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    action: 'all',
    adminId: '',
    targetType: 'all',
    dateFrom: '',
    dateTo: ''
  });


  // Загрузка логов
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['admin-audit-logs', currentPage, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all'))
      });
      return apiRequest<{
        success: boolean;
        data: {
          logs: AdminAction[];
          pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
          };
        };
      }>(`/api/v1/admin/audit-logs?${params}`);
    },
  });

  // Загрузка статистики
  const { data: statsData } = useQuery({
    queryKey: ['admin-audit-stats'],
    queryFn: async () => {
      return apiRequest<{
        success: boolean;
        data: AuditStats;
      }>('/api/v1/admin/audit-stats?days=30');
    },
  });

  // Загрузка настроек безопасности
  const { data: securityData, refetch: refetchSecurity } = useQuery({
    queryKey: ['admin-security-settings'],
    queryFn: async () => {
      return apiRequest<{
        success: boolean;
        settings: SecuritySettings;
      }>('/api/v1/admin/security-settings');
    },
  });

  // Обновление настроек безопасности
  const updateSecurityMutation = useMutation({
    mutationFn: async (settings: {
      impersonationEnabled: boolean;
      logRetentionDays: number;
      adminSessionTimeout: number;
    }) => {
      return apiRequest('/api/v1/admin/security-settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      toast({
        title: "Настройки обновлены",
        description: "Настройки безопасности успешно сохранены",
      });
      refetchSecurity();
      queryClient.invalidateQueries({ queryKey: ['admin-audit-stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logs = logsData?.data?.logs || [];
  const pagination = logsData?.data?.pagination;
  const stats = statsData?.data;
  const securitySettings = securityData?.settings;

  const handleExportLogs = () => {
    toast({
      title: "Экспорт",
      description: "Функция экспорта будет добавлена в следующем обновлении",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const getActionBadge = (actionType: string) => {
    const config = ACTION_TYPE_LABELS[actionType] || {
      label: actionType,
      icon: <Settings className="h-3 w-3" />,
      variant: 'default' as const
    };

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Аудит системы</h1>
            <p className="text-muted-foreground">
              Мониторинг административных действий и настройки безопасности
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetchLogs()} disabled={logsLoading}>
              <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Button variant="outline" onClick={handleExportLogs}>
              <Download className="h-4 w-4" />
              Экспорт
            </Button>
          </div>
        </div>

        <Tabs defaultValue="logs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="logs">Журнал действий</TabsTrigger>
            <TabsTrigger value="stats">Статистика</TabsTrigger>
            <TabsTrigger value="security">Настройки безопасности</TabsTrigger>
          </TabsList>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Фильтры
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="action-filter">Тип действия</Label>
                    <Select value={filters.action} onValueChange={(value) => setFilters(prev => ({ ...prev, action: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Все действия" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все действия</SelectItem>
                        <SelectItem value="impersonate">Имперсонация</SelectItem>
                        <SelectItem value="block_user">Блокировка пользователя</SelectItem>
                        <SelectItem value="change_user_role">Изменение роли</SelectItem>
                        <SelectItem value="update_settings">Обновление настроек</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="target-filter">Тип цели</Label>
                    <Select value={filters.targetType} onValueChange={(value) => setFilters(prev => ({ ...prev, targetType: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Все типы" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все типы</SelectItem>
                        <SelectItem value="user">Пользователь</SelectItem>
                        <SelectItem value="club">Клуб</SelectItem>
                        <SelectItem value="settings">Настройки</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="date-from">Дата от</Label>
                    <NativePickerInput
                      id="date-from"
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="date-to">Дата до</Label>
                    <NativePickerInput
                      id="date-to"
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-end">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setFilters({ action: 'all', adminId: '', targetType: 'all', dateFrom: '', dateTo: '' });
                        setCurrentPage(1);
                      }}
                      className="w-full"
                    >
                      Очистить
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logs Table */}
            <Card>
              <CardHeader>
                <CardTitle>Журнал административных действий</CardTitle>
                <CardDescription>
                  Полный журнал всех действий администраторов в системе
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата/время</TableHead>
                          <TableHead>Администратор</TableHead>
                          <TableHead>Действие</TableHead>
                          <TableHead>Цель</TableHead>
                          <TableHead>IP адрес</TableHead>
                          <TableHead>Детали</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              Логи не найдены
                            </TableCell>
                          </TableRow>
                        ) : (
                          logs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="font-mono text-sm">
                                {formatDate(log.createdAt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <UserIcon className="h-4 w-4" />
                                  {log.adminUsername}
                                </div>
                              </TableCell>
                              <TableCell>
                                {getActionBadge(log.actionType)}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div className="font-medium">{log.targetType}</div>
                                  <div className="text-muted-foreground truncate max-w-32">
                                    {log.targetId}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {log.ipAddress || '-'}
                              </TableCell>
                              <TableCell>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>Детали административного действия</DialogTitle>
                                      <DialogDescription>
                                        Подробная информация о действии {log.actionType}
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <Label>ID действия</Label>
                                          <div className="font-mono bg-muted p-2 rounded">{log.id}</div>
                                        </div>
                                        <div>
                                          <Label>Дата/время</Label>
                                          <div>{formatDate(log.createdAt)}</div>
                                        </div>
                                        <div>
                                          <Label>Администратор</Label>
                                          <div>{log.adminUsername} ({log.adminId})</div>
                                        </div>
                                        <div>
                                          <Label>IP адрес</Label>
                                          <div className="font-mono">{log.ipAddress || 'Не записан'}</div>
                                        </div>
                                      </div>
                                      
                                      {log.reason && (
                                        <div>
                                          <Label>Причина</Label>
                                          <div className="bg-muted p-2 rounded">{log.reason}</div>
                                        </div>
                                      )}
                                      
                                      {log.previousValue && (
                                        <div>
                                          <Label>Предыдущее значение</Label>
                                          <div className="bg-muted p-2 rounded font-mono text-sm">
                                            {log.previousValue}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {log.newValue && (
                                        <div>
                                          <Label>Новое значение</Label>
                                          <div className="bg-muted p-2 rounded font-mono text-sm">
                                            {log.newValue}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {log.userAgent && (
                                        <div>
                                          <Label>User Agent</Label>
                                          <div className="bg-muted p-2 rounded font-mono text-xs break-all">
                                            {log.userAgent}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {log.metadata && (
                                        <div>
                                          <Label>Метаданные</Label>
                                          <div className="bg-muted p-2 rounded font-mono text-sm">
                                            <pre>{JSON.stringify(JSON.parse(log.metadata), null, 2)}</pre>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {pagination && pagination.pages > 1 && (
                      <div className="flex items-center justify-between mt-6">
                        <div className="text-sm text-muted-foreground">
                          Показано {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} из {pagination.total}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={pagination.page <= 1}
                          >
                            Назад
                          </Button>
                          <div className="text-sm">
                            Страница {pagination.page} из {pagination.pages}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(pagination.pages, prev + 1))}
                            disabled={pagination.page >= pagination.pages}
                          >
                            Вперед
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-6">
            {stats && (
              <>
                {/* Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Всего действий</CardTitle>
                      <Settings className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stats.totalActions}</div>
                      <p className="text-xs text-muted-foreground">За последние 30 дней</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Имперсонации</CardTitle>
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stats.impersonationCount}</div>
                      <p className="text-xs text-muted-foreground">Входов под другими пользователями</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Активных админов</CardTitle>
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{Object.keys(stats.actionsByAdmin).length}</div>
                      <p className="text-xs text-muted-foreground">Администраторов с активностью</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Типов действий</CardTitle>
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{Object.keys(stats.actionsByType).length}</div>
                      <p className="text-xs text-muted-foreground">Различных типов действий</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Action Types Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Действия по типам</CardTitle>
                    <CardDescription>Распределение административных действий по типам</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(stats.actionsByType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([actionType, count]) => (
                          <div key={actionType} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getActionBadge(actionType)}
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="w-32 bg-secondary h-2 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${(count / stats.totalActions) * 100}%` }}
                                />
                              </div>
                              <div className="text-sm font-medium min-w-8 text-right">{count}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Security Settings Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Настройки безопасности
                </CardTitle>
                <CardDescription>
                  Управление функциями безопасности и политиками аудита
                </CardDescription>
              </CardHeader>
              <CardContent>
                {securitySettings && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      updateSecurityMutation.mutate({
                        impersonationEnabled: formData.get('impersonation') === 'on',
                        logRetentionDays: Number.parseInt(formData.get('retention') as string) || 90,
                        adminSessionTimeout: Number.parseInt(formData.get('timeout') as string) || 60,
                      });
                    }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="impersonation"
                          name="impersonation"
                          defaultChecked={securitySettings['security.impersonation.enabled'] === 'true'}
                        />
                        <Label htmlFor="impersonation" className="font-medium">
                          Разрешить имперсонацию
                        </Label>
                      </div>
                      <p className="text-sm text-muted-foreground ml-6">
                        Позволяет администраторам входить в систему от имени других пользователей для диагностики проблем.
                        Все случаи имперсонации записываются в журнал аудита.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="retention">Срок хранения логов (дни)</Label>
                      <Input
                        id="retention"
                        name="retention"
                        type="number"
                        min="1"
                        max="365"
                        defaultValue={securitySettings['security.impersonation.log_retention_days']}
                        className="max-w-32"
                      />
                      <p className="text-sm text-muted-foreground">
                        Количество дней для хранения журналов аудита. Рекомендуется: 90 дней.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timeout">Таймаут сессии админа (минуты)</Label>
                      <Input
                        id="timeout"
                        name="timeout"
                        type="number"
                        min="15"
                        max="480"
                        defaultValue={securitySettings['security.admin_session_timeout']}
                        className="max-w-32"
                      />
                      <p className="text-sm text-muted-foreground">
                        Время неактивности до автоматического выхода администратора. Рекомендуется: 60 минут.
                      </p>
                    </div>

                    <Button type="submit" disabled={updateSecurityMutation.isPending}>
                      {updateSecurityMutation.isPending && (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Сохранить настройки
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* Security Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  Рекомендации по безопасности
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <div className="font-medium">Регулярно проверяйте журналы аудита</div>
                      <div className="text-sm text-muted-foreground">
                        Рекомендуется еженедельно просматривать журналы административных действий для выявления подозрительной активности.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <div className="font-medium">Ограничьте использование имперсонации</div>
                      <div className="text-sm text-muted-foreground">
                        Используйте имперсонацию только для диагностики критических проблем. Все случаи автоматически логируются.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <div className="font-medium">Настройте резервное копирование логов</div>
                      <div className="text-sm text-muted-foreground">
                        Экспортируйте важные журналы во внешнее хранилище для долгосрочного архивирования.
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
