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
import { ArrowLeft, Loader2, Users } from "lucide-react";

export default function CreateClub() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createClubMutation = useCreateClub();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    isPrivate: false,
    maxMembers: 50,
    type: "standard" as const,
  });

  const [errorDialog, setErrorDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
  }>({ open: false, title: "", description: "" });

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
      toast({
        title: "Успешно!",
        description: "Клуб создан. Теперь загрузите книгу для чтения.",
      });
      setLocation(`/clubs/${club.id}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось создать клуб";
      setErrorDialog({
        open: true,
        title: "Ошибка создания клуба",
        description: errorMessage,
      });
    }
  };

  return (
    <MainLayout>
      <div className="container max-w-2xl py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => setLocation("/clubs")}
          className="mb-6"
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
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Рекомендуется 10-50 участников для комфортного общения
                </p>
              </div>

              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label htmlFor="isPrivate">Приватный клуб</Label>
                  <p className="text-sm text-muted-foreground">
                    Только по приглашениям
                  </p>
                </div>
                <Switch
                  id="isPrivate"
                  checked={formData.isPrivate}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPrivate: checked })}
                />
              </div>

              <div className="flex gap-4 pt-4">
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
    </MainLayout>
  );
}
