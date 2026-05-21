import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  MoreHorizontal, 
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
  Eye,
  MessageSquare,
  User,
  Users2,
  BookOpen,
  Flag,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";

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

const DM_CATEGORY_LABELS: Record<string, string> = {
  spam: 'Спам',
  harassment: 'Харассмент',
  threats: 'Угрозы',
  other: 'Другое',
};

interface DmReport {
  report: {
    id: string;
    messageId: string;
    reporterId: string;
    category: string;
    comment: string | null;
    status: 'pending' | 'reviewed' | 'dismissed';
    reviewedBy: string | null;
    reviewedAt: string | null;
    createdAt: string;
  };
  message: {
    id: string;
    body: string;
    senderId: string;
    conversationId: string;
    isDeleted: boolean;
    createdAt: string;
  };
  reporter: { id: string; username: string };
}

async function fetchReports(filters: ReportsFilters): Promise<ReportsResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.type && filters.type !== 'all') params.append('type', filters.type);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  return apiRequest<ReportsResponse>(`/api/v1/admin/reports?${params.toString()}`);
}

async function updateReportStatus(reportId: string, status: string, notes?: string): Promise<void> {
  await apiRequest(`/api/v1/admin/reports/${reportId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, admin_notes: notes }),
  });
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

// ─── Объединённый компонент для всех типов жалоб ────────────────────────────

function UnifiedReportsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reason, setReason] = useState('');
  const [viewConv, setViewConv] = useState<{ reportId: string; conversationId: string } | null>(null);
  const [convMessages, setConvMessages] = useState<{ body: string; senderId: string; createdAt: string; isDeleted: boolean }[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);

  // Загружаем оба типа жалоб параллельно
  const { data: dmData, isLoading: dmLoading, error: dmError } = useQuery<{ reports: DmReport[] }>({
    queryKey: ['admin-dm-reports', statusFilter],
    queryFn: () => apiRequest(`/api/v1/admin/dm/reports?status=${statusFilter}`),
    refetchInterval: 30_000,
  });

  const { data: generalData, isLoading: generalLoading, error: generalError } = useQuery<ReportsResponse>({
    queryKey: ['admin-reports', statusFilter],
    queryFn: () => fetchReports({ search: '', type: 'all', status: statusFilter, page: 1, limit: 100 }),
    refetchInterval: 30_000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: 'reviewed' | 'dismissed' }) =>
      apiRequest(`/api/v1/admin/dm/reports/${reportId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-dm-reports'] });
    },
  });

  const generalReviewMutation = useMutation({
    mutationFn: ({ reportId, status, notes }: { reportId: string; status: string; notes?: string }) =>
      updateReportStatus(reportId, status, notes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
  });

  const openConversation = async (reportId: string, conversationId: string) => {
    if (!reason.trim() || reason.trim().length < 5) {
      alert('Укажите причину просмотра (мин. 5 символов)');
      return;
    }
    setLoadingConv(true);
    try {
      const params = new URLSearchParams({ reason: reason.trim(), reportId });
      const res = await apiRequest<{ messages: typeof convMessages }>(
        `/api/v1/admin/dm/conversations/${conversationId}?${params.toString()}`
      );
      setConvMessages(res.messages ?? []);
      setViewConv({ reportId, conversationId });
    } finally {
      setLoadingConv(false);
    }
  };

  const isLoading = dmLoading || generalLoading;
  const hasError = dmError || generalError;

  // Объединяем жалобы в один массив с флагом типа
  const allReports: Array<{ isDm: boolean; id: string; createdAt: string; data: DmReport | Report }> = [
    ...(dmData?.reports ?? []).map(r => ({ isDm: true, id: r.report.id, createdAt: r.report.createdAt, data: r })),
    ...(generalData?.reports ?? []).map(r => ({ isDm: false, id: r.id, createdAt: r.created_at, data: r })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalCount = allReports.length;
  const pendingCount = allReports.filter(r => {
    if (r.isDm) return (r.data as DmReport).report.status === 'pending';
    return (r.data as Report).status === 'new';
  }).length;

  return (
    <div className="space-y-4">
      {/* Статистика */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Всего жалоб</p>
                <p className="text-2xl font-bold">{totalCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ожидают обработки</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Фильтр */}
      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Ожидают обработки</SelectItem>
            <SelectItem value="reviewed">Проверены</SelectItem>
            <SelectItem value="dismissed">Отклонены</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Причина просмотра ЛС */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium">Причина просмотра переписки ЛС <span className="text-destructive">*</span></p>
          <Textarea
            placeholder="Обязательно укажите причину прежде чем открыть переписку..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="resize-none"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">Каждый просмотр переписки фиксируется в аудит-логе.</p>
        </CardContent>
      </Card>

      {/* Таблица */}
      <Card>
        <CardContent className="p-0">
          {(() => {
            if (isLoading) {
              return (
                <div className="p-8 text-center text-muted-foreground">
                  <Clock className="h-6 w-6 animate-spin mx-auto mb-2" />Загрузка...
                </div>
              );
            }
            if (hasError) {
              return (
                <div className="p-8 text-center text-destructive">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
                  <p className="text-sm">Ошибка загрузки жалоб</p>
                </div>
              );
            }
            if (totalCount === 0) {
              return (
                <div className="p-12 text-center text-muted-foreground">
                  <Flag className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Жалоб нет</p>
                </div>
              );
            }
            return (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm">Жалоба</th>
                  <th className="text-left p-4 font-medium text-sm">Тип</th>
                  <th className="text-left p-4 font-medium text-sm">Дата</th>
                  <th className="text-right p-4 font-medium text-sm">Действия</th>
                </tr>
              </thead>
              <tbody>
                {allReports.map((item) => {
                  if (item.isDm) {
                    const { report, message, reporter } = item.data as DmReport;
                    return (
                      <tr key={`dm-${report.id}`} className="border-b hover:bg-muted/30">
                        <td className="p-4">
                          <div className="max-w-xs">
                            <Badge variant="outline" className="mb-1">ЛС</Badge>
                            {message.isDeleted ? (
                              <span className="text-sm italic text-muted-foreground block">Сообщение удалено</span>
                            ) : (
                              <span className="text-sm truncate block">{message.body}</span>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">
                              Категория: {DM_CATEGORY_LABELS[report.category] ?? report.category}
                            </div>
                            {report.comment && (
                              <div className="text-xs text-muted-foreground">Комментарий: {report.comment}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-sm">@{reporter.username}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(report.createdAt).toLocaleDateString('ru')}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={loadingConv || !reason.trim()}
                              onClick={() => openConversation(report.id, message.conversationId)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Переписка
                            </Button>
                            {report.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  disabled={reviewMutation.isPending}
                                  onClick={() => reviewMutation.mutate({ reportId: report.id, status: 'reviewed' })}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground"
                                  disabled={reviewMutation.isPending}
                                  onClick={() => reviewMutation.mutate({ reportId: report.id, status: 'dismissed' })}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  } else {
                    const r = item.data as Report;
                    return (
                      <tr key={`gen-${r.id}`} className="border-b hover:bg-muted/30">
                        <td className="p-4">
                          <div>
                            <ReportTypeBadge type={r.type} />
                            <div className="font-medium text-sm mt-1">{r.title}</div>
                            <div className="text-xs text-muted-foreground max-w-xs truncate">{r.description}</div>
                            <div className="text-xs text-muted-foreground">Причина: {r.reason}</div>
                          </div>
                        </td>
                        <td className="p-4 text-sm">{r.reported_by}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString('ru')}
                        </td>
                        <td className="p-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.status === 'new' && (
                                <DropdownMenuItem
                                  onClick={() => generalReviewMutation.mutate({ reportId: r.id, status: 'in_progress' })}
                                >
                                  <Clock className="w-4 h-4 mr-2" />Взять в работу
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => generalReviewMutation.mutate({ reportId: r.id, status: 'resolved' })}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />Решить
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => generalReviewMutation.mutate({ reportId: r.id, status: 'dismissed' })}
                              >
                                <X className="w-4 h-4 mr-2" />Отклонить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>
            );
          })()}
        </CardContent>
      </Card>

      {/* Dialog для просмотра переписки */}
      {viewConv && (
        <Dialog open={!!viewConv} onOpenChange={(open) => !open && setViewConv(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Переписка (жалоба #{viewConv.reportId.slice(0, 8)})</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-4">
              {convMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Сообщений нет</p>
              ) : (
                convMessages.map((msg) => (
                  <div key={`${msg.senderId}-${msg.createdAt}`} className="text-sm border rounded p-2">
                    {msg.isDeleted ? (
                      <span className="italic text-muted-foreground">Сообщение удалено</span>
                    ) : (
                      msg.body
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.createdAt).toLocaleString('ru')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function AdminReports() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Жалобы и модерация</h1>
          <p className="text-sm text-muted-foreground mt-1">Все жалобы на платформе: ЛС, пользователи, клубы, чат и др.</p>
        </div>
        <UnifiedReportsTab />
      </div>
    </AdminLayout>
  );
}
