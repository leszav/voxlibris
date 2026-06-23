import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor, type RichTextEditorRef } from "@/components/ui/rich-text-editor";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Settings, Image as ImageIcon, Loader2, Check, Trash2, Calendar, Clock, Type, Upload } from "lucide-react";
import { useUpdateClub } from "@/hooks/use-clubs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ClubWithDetails } from "@shared/schema";

interface ClubSettingsModalProps {
  readonly club: ClubWithDetails;
}

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time: string;
  description?: string;
}

interface ClubSettings {
  welcomeTitle?: string;
  welcomeHtml?: string;
  rulesHtml?: string;
  shortDescription?: string;
  readerJoinRequestsEnabled?: boolean;
}

interface TariffTemplate {
  id: string;
  title: string;
  description: string | null;
  amountRub: number;
  period: "week" | "month" | "quarter" | "year";
  readerShareBps: number;
  acquiringFeeBps: number;
}

interface TariffAssignment {
  id: string;
  productId: string;
  templateId: string | null;
  readerShareBps: number;
  acquiringFeeBps: number;
  productTitle?: string | null;
  productDescription?: string | null;
  amountRub?: number | null;
  period?: "week" | "month" | "quarter" | "year" | null;
}

interface TariffRequest {
  id: string;
  title: string;
  requestedAmountRub: number;
  requestedPeriod: "week" | "month" | "quarter" | "year";
  status: string;
}

interface MonetizationResponse {
  assignment: TariffAssignment | null;
  templates: TariffTemplate[];
  requests: TariffRequest[];
}

const periodLabels = { week: "неделя", month: "месяц", quarter: "квартал", year: "год" };

export function ClubSettingsModal({ club }: ClubSettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateClubMutation = useUpdateClub();
  const isReaderLedClub = club.type === "reader-led";
  const monetizationKey = ["club-monetization", club.id] as const;

  const [coverImage, setCoverImage] = useState(club.coverImage || "");
  const [coverPreview, setCoverPreview] = useState(club.coverImage || "");
  
  // Состояния для crop диалога
  const [showCoverCrop, setShowCoverCrop] = useState(false);
  const [tempCoverImage, setTempCoverImage] = useState("");
  
  const [welcomeTitle, setWelcomeTitle] = useState("");
  const [welcomeHtml, setWelcomeHtml] = useState("");
  const [rulesHtml, setRulesHtml] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [readerJoinRequestsEnabled, setReaderJoinRequestsEnabled] = useState(true);
  const [tariffRequest, setTariffRequest] = useState({ title: "", amountRub: "990", period: "month", message: "" });
  const [expandedTariff, setExpandedTariff] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [newSchedule, setNewSchedule] = useState<ScheduleItem>({
    id: "",
    title: "",
    date: "",
    time: "",
    description: "",
  });

  const welcomeEditorRef = useRef<RichTextEditorRef>(null);
  const rulesEditorRef = useRef<RichTextEditorRef>(null);
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: monetization } = useQuery<MonetizationResponse>({
    queryKey: monetizationKey,
    queryFn: () => apiRequest<MonetizationResponse>(`/api/clubs/${club.id}/monetization`),
    enabled: isOpen && isReaderLedClub,
  });

  const selectTariff = useMutation({
    mutationFn: (templateId: string) => apiRequest(`/api/clubs/${club.id}/monetization/select-template`, {
      method: "POST",
      body: JSON.stringify({ templateId }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: monetizationKey });
      toast({ title: "Тариф подключён" });
    },
    onError: (error) => toast({ title: "Ошибка тарифа", description: error instanceof Error ? error.message : "Не удалось подключить тариф", variant: "destructive" }),
  });

  const createTariffRequest = useMutation({
    mutationFn: () => apiRequest(`/api/clubs/${club.id}/monetization/tariff-requests`, {
      method: "POST",
      body: JSON.stringify({
        title: tariffRequest.title.trim(),
        requestedAmountRub: Number(tariffRequest.amountRub),
        requestedPeriod: tariffRequest.period,
        message: tariffRequest.message.trim() || null,
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: monetizationKey });
      setTariffRequest({ title: "", amountRub: "990", period: "month", message: "" });
      toast({ title: "Заявка отправлена" });
    },
    onError: (error) => toast({ title: "Ошибка заявки", description: error instanceof Error ? error.message : "Не удалось отправить заявку", variant: "destructive" }),
  });

  useEffect(() => {
    if (isOpen) {
      const parsedSettings = club.settings ? JSON.parse(club.settings) as ClubSettings : {};
      const parsedSchedule = club.schedule ? JSON.parse(club.schedule) as ScheduleItem[] : [];

      setCoverImage(club.coverImage || "");
      setCoverPreview(club.coverImage || "");
      setWelcomeTitle(parsedSettings?.welcomeTitle || "");
      setWelcomeHtml(parsedSettings?.welcomeHtml || "");
      setRulesHtml(parsedSettings?.rulesHtml || "");
      setShortDescription(parsedSettings?.shortDescription || "");
      setIsPrivate(isReaderLedClub ? true : club.isPrivate || false);
      setReaderJoinRequestsEnabled(parsedSettings?.readerJoinRequestsEnabled !== false);
      setSchedule(parsedSchedule);
      setNewSchedule({
        id: "",
        title: "",
        date: "",
        time: "",
        description: "",
      });
    }
  }, [isOpen, club.settings, club.isPrivate, isReaderLedClub]);

  useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
    };
  }, []);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 10 МБ",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setTempCoverImage(base64);
      setShowCoverCrop(true);
    };
    reader.readAsDataURL(file);
  };

  const activeTemplate = monetization?.assignment?.templateId
    ? monetization.templates.find((template) => template.id === monetization.assignment?.templateId)
    : undefined;
  const activeTariffTitle = activeTemplate?.title ?? monetization?.assignment?.productTitle ?? "Активный тариф";
  const activeTariffAmount = activeTemplate?.amountRub ?? monetization?.assignment?.amountRub ?? null;
  const activeTariffPeriod = activeTemplate?.period ?? monetization?.assignment?.period ?? null;

  const handleCoverCropped = (croppedImage: string) => {
    setCoverPreview(croppedImage);
    setCoverImage(croppedImage);
    toast({
      title: "Фон загружен",
      description: "Нажмите 'Сохранить изменения' для применения",
    });
  };

  const handleRemoveCover = () => {
    setCoverImage("");
    setCoverPreview("");
    toast({
      title: "Фон удалён",
      description: "Нажмите 'Сохранить изменения' для применения",
    });
  };

  const handleAddSchedule = () => {
    if (newSchedule.title && newSchedule.date && newSchedule.time) {
      setSchedule([
        ...schedule,
        {
          ...newSchedule,
          id: Date.now().toString(),
        },
      ]);
      setNewSchedule({
        id: "",
        title: "",
        date: "",
        time: "",
        description: "",
      });
    }
  };

  const handleRemoveSchedule = (id: string) => {
    setSchedule(schedule.filter(item => item.id !== id));
  };

  const handleSave = async () => {
    try {
      const settingsJson = JSON.stringify({
        welcomeTitle,
        welcomeHtml,
        rulesHtml,
        shortDescription,
        readerJoinRequestsEnabled: isReaderLedClub ? readerJoinRequestsEnabled : undefined,
      });
      const scheduleJson = JSON.stringify(schedule);

      const updateData: { settings: string; schedule: string; coverImage?: string | null; isPrivate?: boolean } = {
        settings: settingsJson,
        schedule: scheduleJson,
        isPrivate: isReaderLedClub ? true : isPrivate,
      };

      if (coverImage && coverImage !== club.coverImage) {
        updateData.coverImage = coverImage;
      } else if (!coverImage && club.coverImage) {
        updateData.coverImage = null;
      }

      await updateClubMutation.mutateAsync({
        clubId: club.id,
        data: updateData,
      });

      toast({
        title: "Настройки сохранены",
        description: "Изменения успешно применены",
      });
      setIsOpen(false);

      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
      reloadTimeoutRef.current = setTimeout(() => {
        globalThis.location.reload();
      }, 500);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить настройки",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-white/10 text-white border-white/20 hover:bg-white/20"
        >
          <Settings className="w-4 h-4 mr-2" />
          Настройки
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-[95%] flex-col overflow-hidden sm:max-w-2xl md:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Настройки клуба</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full shrink-0 overflow-x-auto whitespace-nowrap">
            <TabsTrigger value="appearance">Оформление</TabsTrigger>
            <TabsTrigger value="welcome">Приветствие</TabsTrigger>
            <TabsTrigger value="rules">Правила</TabsTrigger>
            <TabsTrigger value="schedule">Расписание</TabsTrigger>
            {isReaderLedClub ? <TabsTrigger value="monetization">Монетизация</TabsTrigger> : null}
          </TabsList>

          <ScrollArea className="min-h-0 flex-1 -mx-4 px-4 pr-5">
            <TabsContent value="appearance" className="space-y-6 mt-0">
              <div className="space-y-4">
                <Label>Фон клуба</Label>

                <div className="space-y-4">
                  <div className="relative group">
                    <div
                      className={`relative w-full h-48 rounded-lg border-2 border-dashed overflow-hidden ${
                        coverPreview ? "border-transparent" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                      }`}
                    >
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="Предпросмотр фона"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                          <ImageIcon className="w-12 h-12 mb-2" />
                          <p className="text-sm">Нажмите для загрузки изображения</p>
                          <p className="text-xs text-muted-foreground mt-1">или перетащите файл сюда</p>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleCoverUpload}
                      />
                    </div>
                    {coverPreview && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleRemoveCover}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="text-muted-foreground">
                      {coverPreview ? "Изображение выбрано" : "Файл не выбран"}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <label htmlFor="cover-upload" className="cursor-pointer flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Выбрать файл
                      </label>
                    </Button>
                    <input
                      id="cover-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverUpload}
                    />
                  </div>



                  <div className="space-y-2">
                    <Label htmlFor="club-short-description">Краткое описание клуба</Label>
                    <p className="text-xs text-muted-foreground">Это описание будет отображаться в каталоге клубов.</p>
                    <textarea
                      id="club-short-description"
                      className="w-full rounded-md border bg-background p-3 text-sm min-h-[60px] resize-none"
                      placeholder="Коротко опишите идею и атмосферу клуба"
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                    />
                  </div>

                  {!isReaderLedClub ? (
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <Label htmlFor="club-privacy" className="text-base">Тип клуба</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isPrivate ? "Закрытый клуб — только по приглашению" : "Публичный клуб — виден в каталоге"}
                        </p>
                      </div>
                      <Switch
                        id="club-privacy"
                        checked={isPrivate}
                        onCheckedChange={setIsPrivate}
                      />
                    </div>
                  ) : null}

                  {isReaderLedClub ? (
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <Label htmlFor="reader-join-requests" className="text-base">Заявки на вступление</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Если выключить, кнопка заявки исчезнет с карточки клуба.
                        </p>
                      </div>
                      <Switch
                        id="reader-join-requests"
                        checked={readerJoinRequestsEnabled}
                        onCheckedChange={setReaderJoinRequestsEnabled}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="welcome" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="welcome-title">Заголовок приветствия</Label>
                  <Input
                    id="welcome-title"
                    value={welcomeTitle}
                    onChange={(e) => setWelcomeTitle(e.target.value)}
                    placeholder="Добро пожаловать в наш клуб!"
                    className="font-semibold text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="welcome-text">Текст приветствия</Label>
                  <p className="text-xs text-muted-foreground">
                    Используйте панель инструментов для форматирования текста. Сохраняет абзацы, списки и форматирование при вставке.
                  </p>
                  <RichTextEditor
                    ref={welcomeEditorRef}
                    placeholder="Расскажите о целях и атмосфере вашего клуба..."
                    value={welcomeHtml}
                    onChange={setWelcomeHtml}
                    className="min-h-[300px]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rules-text">Правила клуба</Label>
                  <p className="text-xs text-muted-foreground">
                    Используйте визуальный редактор для форматирования правил. Создавайте списки, выделяйте важные моменты жирным текстом.
                  </p>
                  <RichTextEditor
                    ref={rulesEditorRef}
                    placeholder="Правила вашего клуба..."
                    value={rulesHtml}
                    onChange={setRulesHtml}
                    className="min-h-[400px]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-6 mt-0">
              <div className="space-y-4">
                <Label>Расписание заседаний</Label>

                <div className="grid gap-4 p-4 border rounded-lg bg-card">
                  <div className="grid gap-2">
                    <Input
                      placeholder="Название мероприятия"
                      value={newSchedule.title}
                      onChange={(e) => setNewSchedule({ ...newSchedule, title: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="schedule-date" className="text-xs">Дата</Label>
                      <Input
                        id="schedule-date"
                        type="date"
                        value={newSchedule.date}
                        onChange={(e) => setNewSchedule({ ...newSchedule, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="schedule-time" className="text-xs">Время</Label>
                      <Input
                        id="schedule-time"
                        type="time"
                        value={newSchedule.time}
                        onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Input
                      placeholder="Описание (необязательно)"
                      value={newSchedule.description}
                      onChange={(e) => setNewSchedule({ ...newSchedule, description: e.target.value })}
                    />
                  </div>

                  <Button onClick={handleAddSchedule} type="button" className="w-full">
                    <Type className="w-4 h-4 mr-2" />
                    Добавить в расписание
                  </Button>
                </div>

                {schedule.length > 0 ? (
                  <div className="space-y-3">
                    {schedule.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-4 p-4 border rounded-lg bg-card"
                      >
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">{item.title}</h4>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(item.date).toLocaleDateString("ru-RU")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {item.time}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSchedule(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Расписание пустое. Добавьте мероприятия выше.
                  </div>
                )}
              </div>
            </TabsContent>

            {isReaderLedClub ? (
              <TabsContent value="monetization" className="space-y-6 mt-0">
                <div className="space-y-4">
                  <div>
                    <Label>Текущий платный доступ</Label>
                    {monetization?.assignment ? (
                      <div className="mt-2 rounded-lg border bg-muted/40 p-4">
                        <button type="button" className="text-left font-medium underline-offset-4 hover:underline" onClick={() => setExpandedTariff((value) => !value)}>
                          {activeTariffTitle}
                        </button>
                        <p className="mt-1 text-sm text-muted-foreground">Новый выбор заменит активный тариф.</p>
                        {expandedTariff ? (
                          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                            {activeTariffAmount && activeTariffPeriod ? <div>{activeTariffAmount.toLocaleString("ru-RU")} ₽ / {periodLabels[activeTariffPeriod]}</div> : null}
                            <div>Доля чтеца: {monetization.assignment.readerShareBps / 100}%</div>
                            <div>Эквайринг: {monetization.assignment.acquiringFeeBps / 100}%</div>
                            {monetization.assignment.productDescription ? <div>{monetization.assignment.productDescription}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Тариф ещё не подключён.</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Доступные тарифы</Label>
                    {monetization?.templates.map((template) => {
                      const selected = monetization.assignment?.templateId === template.id;
                      return (
                        <div key={template.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                          <div>
                            <div className="font-medium">{template.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {template.amountRub.toLocaleString("ru-RU")} ₽ / {periodLabels[template.period]}, чтецу {template.readerShareBps / 100}%
                            </div>
                          </div>
                          <Button size="sm" onClick={() => selectTariff.mutate(template.id)} disabled={selected || selectTariff.isPending}>
                            {selected ? "Выбран" : "Выбрать"}
                          </Button>
                        </div>
                      );
                    })}
                    {monetization?.templates.length === 0 ? <p className="text-sm text-muted-foreground">Публичных тарифов пока нет.</p> : null}
                  </div>

                  <div className="space-y-3 rounded-lg border p-4">
                    <Label>Запросить индивидуальный тариф</Label>
                    <Input placeholder="Название тарифа" value={tariffRequest.title} onChange={(e) => setTariffRequest({ ...tariffRequest, title: e.target.value })} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input type="number" min="1" value={tariffRequest.amountRub} onChange={(e) => setTariffRequest({ ...tariffRequest, amountRub: e.target.value })} />
                      <select className="rounded-md border bg-background px-3 text-sm" value={tariffRequest.period} onChange={(e) => setTariffRequest({ ...tariffRequest, period: e.target.value })}>
                        <option value="week">Неделя</option>
                        <option value="month">Месяц</option>
                        <option value="quarter">Квартал</option>
                        <option value="year">Год</option>
                      </select>
                    </div>
                    <textarea className="w-full rounded-md border bg-background p-3 text-sm" placeholder="Комментарий для администратора" value={tariffRequest.message} onChange={(e) => setTariffRequest({ ...tariffRequest, message: e.target.value })} />
                    <Button type="button" onClick={() => createTariffRequest.mutate()} disabled={createTariffRequest.isPending || !tariffRequest.title.trim()}>
                      Отправить заявку
                    </Button>
                  </div>

                  {monetization?.requests.length ? (
                    <div className="space-y-2">
                      <Label>Мои заявки</Label>
                      {monetization.requests.map((request) => (
                        <div key={request.id} className="rounded border p-3 text-sm">
                          {request.title}: {request.requestedAmountRub.toLocaleString("ru-RU")} ₽ / {periodLabels[request.requestedPeriod]} — {request.status}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            ) : null}
          </ScrollArea>
        </Tabs>

        <div className="flex shrink-0 justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={updateClubMutation.isPending}>
            {updateClubMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Сохранить изменения
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Диалог обрезки фона */}
    <ImageCropDialog
      open={showCoverCrop}
      onOpenChange={setShowCoverCrop}
      image={tempCoverImage}
      aspectRatio={16 / 9}
      maxWidth={1920}
      maxHeight={1080}
      onCropComplete={handleCoverCropped}
      title="Настройка фонового изображения клуба"
    />
    </>
  );
}
