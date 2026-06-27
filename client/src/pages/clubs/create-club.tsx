import { useState } from "react";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { useCreateClub } from "@/hooks/use-clubs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { isUpgradeError, upgradeDescription, upgradeUrl } from "@/lib/upgrade-cta";
import { ArrowLeft, Loader2, Users, CheckCircle, Clock, Mic2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CreateClub() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const createClubMutation = useCreateClub();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    isPrivate: false,
    maxMembers: 50,
    type: "standard" as "standard" | "reader-led",
  });

  const isReaderLedClub = formData.type === "reader-led";
  const canCreateReaderLedClubs = user?.canCreateReaderLedClubs === true;

  const handleReaderLedChange = (checked: boolean) => {
    if (checked && !canCreateReaderLedClubs) {
      return;
    }

    setFormData((current) => ({
      ...current,
      type: checked ? "reader-led" : "standard",
      isPrivate: checked ? true : current.isPrivate,
    }));
  };

  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
  }>({ open: false, title: "", description: "" });

  const [successDialog, setSuccessDialog] = useState<{
    open: boolean;
    isPending: boolean;
    clubId: string;
  }>({ open: false, isPending: false, clubId: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setErrorDialog({
        open: true,
        title: "Название клуба обязательно",
        description: "Пожалуйста, введите название для вашего клуба.",
      });
      return;
    }

    try {
      const club = await createClubMutation.mutateAsync(formData);
      
      const isPending = club.status === 'pending';
      
      // Показываем соответствующее модальное окно
      setSuccessDialog({
        open: true,
        isPending,
        clubId: club.id,
      });
      
      // Если не требуется модерация, показываем обычный toast
      if (!isPending) {
        toast({
          title: "Успешно!",
          description: "Клуб создан. Теперь загрузите книгу для чтения.",
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось создать клуб";
      if (isUpgradeError(error)) {
        toast({
          title: "Нужен другой тариф",
          description: upgradeDescription(error, errorMessage),
          variant: "destructive",
        });
        setLocation(upgradeUrl(error));
      }
      setErrorDialog({
        open: true,
        title: "Ошибка создания клуба",
        description: errorMessage,
      });
    }
  };

  const handleSuccessDialogClose = () => {
    setSuccessDialog({ open: false, isPending: false, clubId: "" });
    
    if (successDialog.isPending) {
      // Если клуб на модерации, возвращаемся к списку клубов
      setLocation("/clubs");
    } else {
      // Если клуб создан и активен, переходим на страницу клуба
      setLocation(`/clubs/${successDialog.clubId}`);
    }
  };

  return (
    <MainLayout>
      <div className="container max-w-2xl px-4 py-6 sm:px-6 md:py-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/clubs")}
          className="mb-5 w-full justify-center sm:mb-6 sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад к клубам
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Создать книжный клуб</CardTitle>
            <CardDescription>
              Создайте новый клуб для совместного чтения книг
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Название клуба *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Любители классики"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Расскажите о вашем клубе..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxMembers">Максимум участников</Label>
                <Input
                  id="maxMembers"
                  type="number"
                  min={2}
                  max={2000}
                  value={formData.maxMembers}
                  onChange={(e) => setFormData({ ...formData, maxMembers: Number.parseInt(e.target.value, 10) })}
                />
                <p className="flex items-start gap-1 text-sm text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Рекомендуется 10-50 участников для комфортного общения
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isReaderLed" className="flex items-center gap-2">
                    <Mic2 className="h-4 w-4" />
                    Клуб чтецов
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {canCreateReaderLedClubs
                      ? "Аудио-клуб: книгу читает владелец, слушатели подключаются к эфиру"
                      : "Доступно после одобрения заявки ПРО-чтеца администратором"}
                  </p>
                </div>
                <Switch
                  id="isReaderLed"
                  checked={isReaderLedClub}
                  disabled={!canCreateReaderLedClubs}
                  onCheckedChange={handleReaderLedChange}
                />
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isPrivate">Приватный клуб</Label>
                  <p className="text-sm text-muted-foreground">
                    {isReaderLedClub ? "Клуб чтецов всегда приватный" : "Только по приглашениям"}
                  </p>
                </div>
                <Switch
                  id="isPrivate"
                  checked={formData.isPrivate}
                  disabled={isReaderLedClub}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPrivate: checked })}
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:gap-4 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/clubs")}
                  className="flex-1"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={createClubMutation.isPending}
                  className="flex-1"
                >
                  {createClubMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Создаем...
                    </>
                  ) : (
                    "Создать клуб"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <ErrorDialog
        open={errorDialog.open}
        onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}
        title={errorDialog.title}
        description={errorDialog.description}
      />

      {/* Success Dialog - разные сообщения для pending и одобренных клубов */}
      <Dialog open={successDialog.open} onOpenChange={handleSuccessDialogClose}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex items-start gap-3">
              {successDialog.isPending ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              )}
              <DialogTitle className="text-xl">
                {successDialog.isPending ? "Клуб отправлен на модерацию" : "Клуб успешно создан!"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-base pt-2">
              {successDialog.isPending ? (
                <>
                  <p className="mb-3">
                    Ваш клуб <strong>"{formData.title}"</strong> был успешно создан и отправлен на проверку администраторам.
                  </p>
                  <p className="mb-3">
                    После одобрения клуб станет доступен для других пользователей, и вы сможете:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                    <li>Загрузить книгу для совместного чтения</li>
                    <li>Пригласить участников</li>
                    <li>Начать сессии чтения</li>
                  </ul>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Мы уведомим вас по email о результате модерации.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Клуб <strong>"{formData.title}"</strong> создан и готов к использованию!
                  </p>
                  <p className="mt-2">
                    Теперь вы можете загрузить книгу для чтения и пригласить участников.
                  </p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleSuccessDialogClose} className="w-full">
              {successDialog.isPending ? "Вернуться к клубам" : "Перейти к клубу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
