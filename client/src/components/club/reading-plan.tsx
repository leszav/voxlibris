import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  BookOpen, 
  Users, 
  Calendar, 
  CheckCircle, 
  Circle, 
  Clock,
  Plus,
  Edit,
  Trash2
} from "lucide-react";
import { clubReaderApi, type ClubReadingPlan } from "@/api/club-reader";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ReadingPlanFormData {
  title: string;
  description?: string;
  orderIndex: number;
  startChapter?: number;
  endChapter?: number;
  targetDate?: string;
}

interface ReadingPlanProps {
  readonly clubId: string;
  readonly isOwner?: boolean;
}

export function ReadingPlan({ clubId, isOwner = false }: ReadingPlanProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ClubReadingPlan | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Получение плана чтения
  const { data: planData, isLoading } = useQuery({
    queryKey: ["club", clubId, "reading-plan"],
    queryFn: () => clubReaderApi.getReadingPlan(clubId),
  });

  // Получение прогресса участников
  const { data: membersProgress } = useQuery({
    queryKey: ["club", clubId, "members-progress"],
    queryFn: () => clubReaderApi.getMembersProgress(clubId),
  });

  // Мутации для владельца клуба
  const createPlanMutation = useMutation({
    mutationFn: (data: Omit<Parameters<typeof clubReaderApi.createReadingPlan>[1], 0>) =>
      clubReaderApi.createReadingPlan(clubId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club", clubId, "reading-plan"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Этап добавлен",
        description: "Новый этап плана чтения успешно создан",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: (data: { planId: string; updates: Parameters<typeof clubReaderApi.updateReadingPlan>[2] }) =>
      clubReaderApi.updateReadingPlan(clubId, data.planId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club", clubId, "reading-plan"] });
      setEditingPlan(null);
      toast({
        title: "Этап обновлен",
        description: "Этап плана чтения успешно обновлен",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: (planId: string) => clubReaderApi.deleteReadingPlan(clubId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club", clubId, "reading-plan"] });
      toast({
        title: "Этап удален",
        description: "Этап плана чтения успешно удален",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Мутация для обновления статуса этапа
  const updateStatusMutation = useMutation({
    mutationFn: (data: { planId: string; status: 'not_started' | 'in_progress' | 'completed' }) =>
      clubReaderApi.updatePlanStatus(clubId, data.planId, data.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club", clubId, "reading-plan"] });
      toast({
        title: "Статус обновлен",
        description: "Статус этапа успешно изменен",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Получение статуса этапа для пользователя
  const getPlanStageStatus = (planId: string) => {
    const progress = planData?.progress.find(p => p.planId === planId);
    return progress?.status || 'not_started';
  };

  // Получение иконки статуса
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  // Получение текста статуса
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Завершено';
      case 'in_progress':
        return 'В процессе';
      default:
        return 'Не начато';
    }
  };

  // Получение варианта badge для статуса
  const getStatusVariant = (status: string): "default" | "secondary" | "outline" => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'in_progress':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Расчет общего прогресса по плану
  const calculateOverallProgress = () => {
    if (!planData?.plan.length) return 0;
    const completedStages = planData.plan.filter(plan => 
      getPlanStageStatus(plan.id) === 'completed'
    ).length;
    return Math.round((completedStages / planData.plan.length) * 100);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!planData?.clubBook) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Для этого клуба еще не выбрана книга</p>
            {isOwner && (
              <p className="text-sm mt-2">Добавьте книгу в настройках клуба, чтобы создать план чтения</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок с прогрессом */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                План чтения: {planData.clubBook.book?.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {planData.clubBook.book?.author}
              </p>
            </div>
            {isOwner && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить этап
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создать этап плана чтения</DialogTitle>
                  </DialogHeader>
                  <CreatePlanForm 
                    onSubmit={(data) => createPlanMutation.mutate(data)}
                    onCancel={() => setIsCreateDialogOpen(false)}
                    isSubmitting={createPlanMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Общий прогресс по плану</span>
              <span>{calculateOverallProgress()}%</span>
            </div>
            <Progress value={calculateOverallProgress()} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Этапы плана */}
      <div className="space-y-4">
        {planData.plan.map((plan) => {
          const status = getPlanStageStatus(plan.id);
          const isEditing = editingPlan?.id === plan.id;

          return (
            <Card key={plan.id} className="transition-all hover:shadow-md">
              <CardContent className="p-6">
                {isEditing ? (
                  <EditPlanForm
                    plan={plan}
                    onSubmit={(updates) => updatePlanMutation.mutate({ planId: plan.id, updates })}
                    onCancel={() => setEditingPlan(null)}
                    isSubmitting={updatePlanMutation.isPending}
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(status)}
                          <h3 className="font-semibold text-lg">{plan.title}</h3>
                          <Badge variant={getStatusVariant(status)}>
                            {getStatusText(status)}
                          </Badge>
                        </div>
                        
                        {plan.description && (
                          <p className="text-muted-foreground">{plan.description}</p>
                        )}

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {plan.startChapter !== undefined && plan.endChapter !== undefined && (
                            <span>Главы {plan.startChapter}-{plan.endChapter}</span>
                          )}
                          {plan.targetDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(plan.targetDate), 'd MMMM', { locale: ru })}
                            </div>
                          )}
                        </div>

                        {/* Кнопки управления статусом для участников */}
                        <div className="flex items-center gap-2 pt-2">
                          <span className="text-sm text-muted-foreground">Ваш статус:</span>
                          <Button
                            variant={status === 'not_started' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ planId: plan.id, status: 'not_started' })}
                            disabled={updateStatusMutation.isPending}
                          >
                            Не начато
                          </Button>
                          <Button
                            variant={status === 'in_progress' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ planId: plan.id, status: 'in_progress' })}
                            disabled={updateStatusMutation.isPending}
                          >
                            В процессе
                          </Button>
                          <Button
                            variant={status === 'completed' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ planId: plan.id, status: 'completed' })}
                            disabled={updateStatusMutation.isPending}
                          >
                            Завершено
                          </Button>
                        </div>
                      </div>

                      {isOwner && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingPlan(plan)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePlanMutation.mutate(plan.id)}
                            disabled={deletePlanMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Прогресс участников */}
      {membersProgress && membersProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Прогресс участников
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {membersProgress.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {member.displayName?.[0] || member.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{member.displayName || member.username}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.currentChapter ? `Глава ${member.currentChapter}` : 'Не начал(а) читать'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {member.progress ? `${Math.round(member.progress)}%` : '0%'}
                      </div>
                      {member.lastReadAt && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(member.lastReadAt), 'd MMMM', { locale: ru })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Вспомогательная функция для преобразования данных формы
function prepareFormData(formData: {
  title: string;
  description: string;
  orderIndex: number;
  startChapter: string;
  endChapter: string;
  targetDate: string;
}): ReadingPlanFormData {
  return {
    title: formData.title,
    description: formData.description || undefined,
    orderIndex: formData.orderIndex,
    startChapter: formData.startChapter ? Number.parseInt(formData.startChapter) : undefined,
    endChapter: formData.endChapter ? Number.parseInt(formData.endChapter) : undefined,
    targetDate: formData.targetDate || undefined,
  };
}

// Форма создания этапа
function CreatePlanForm({ 
  onSubmit, 
  onCancel, 
  isSubmitting 
}: { 
  readonly onSubmit: (data: ReadingPlanFormData) => void;
  readonly onCancel: () => void;
  readonly isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    orderIndex: 1,
    startChapter: '',
    endChapter: '',
    targetDate: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(prepareFormData(formData));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Название этапа *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Например: Неделя 1: Вступление"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Описание</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Дополнительная информация об этапе"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="orderIndex">Порядок</Label>
          <Input
            id="orderIndex"
            type="number"
            min="1"
            value={formData.orderIndex}
            onChange={(e) => setFormData(prev => ({ ...prev, orderIndex: Number.parseInt(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="startChapter">Начальная глава</Label>
          <Input
            id="startChapter"
            type="number"
            min="1"
            value={formData.startChapter}
            onChange={(e) => setFormData(prev => ({ ...prev, startChapter: e.target.value }))}
            placeholder="1"
          />
        </div>
        <div>
          <Label htmlFor="endChapter">Конечная глава</Label>
          <Input
            id="endChapter"
            type="number"
            min="1"
            value={formData.endChapter}
            onChange={(e) => setFormData(prev => ({ ...prev, endChapter: e.target.value }))}
            placeholder="5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="targetDate">Целевая дата</Label>
        <Input
          id="targetDate"
          type="date"
          value={formData.targetDate}
          onChange={(e) => setFormData(prev => ({ ...prev, targetDate: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Создание...' : 'Создать'}
        </Button>
      </div>
    </form>
  );
}

// Форма редактирования этапа
function EditPlanForm({ 
  plan, 
  onSubmit, 
  onCancel, 
  isSubmitting 
}: { 
  readonly plan: ClubReadingPlan;
  readonly onSubmit: (data: ReadingPlanFormData) => void;
  readonly onCancel: () => void;
  readonly isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState({
    title: plan.title,
    description: plan.description || '',
    orderIndex: plan.orderIndex,
    startChapter: plan.startChapter?.toString() || '',
    endChapter: plan.endChapter?.toString() || '',
    targetDate: plan.targetDate ? new Date(plan.targetDate).toISOString().split('T')[0] : '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(prepareFormData(formData));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="edit-title">Название этапа *</Label>
        <Input
          id="edit-title"
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          required
        />
      </div>

      <div>
        <Label htmlFor="edit-description">Описание</Label>
        <Textarea
          id="edit-description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="edit-orderIndex">Порядок</Label>
          <Input
            id="edit-orderIndex"
            type="number"
            min="1"
            value={formData.orderIndex}
            onChange={(e) => setFormData(prev => ({ ...prev, orderIndex: Number.parseInt(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="edit-startChapter">Начальная глава</Label>
          <Input
            id="edit-startChapter"
            type="number"
            min="1"
            value={formData.startChapter}
            onChange={(e) => setFormData(prev => ({ ...prev, startChapter: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="edit-endChapter">Конечная глава</Label>
          <Input
            id="edit-endChapter"
            type="number"
            min="1"
            value={formData.endChapter}
            onChange={(e) => setFormData(prev => ({ ...prev, endChapter: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="edit-targetDate">Целевая дата</Label>
        <Input
          id="edit-targetDate"
          type="date"
          value={formData.targetDate}
          onChange={(e) => setFormData(prev => ({ ...prev, targetDate: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </form>
  );
}