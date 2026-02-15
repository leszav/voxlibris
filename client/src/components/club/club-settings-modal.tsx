import { useState, useEffect, useRef } from "react";
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
}

export function ClubSettingsModal({ club }: ClubSettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const updateClubMutation = useUpdateClub();

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
      setIsPrivate(club.isPrivate || false);
      setSchedule(parsedSchedule);
      setNewSchedule({
        id: "",
        title: "",
        date: "",
        time: "",
        description: "",
      });
    }
  }, [isOpen, club.settings]);

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
      });
      const scheduleJson = JSON.stringify(schedule);

      const updateData: { settings: string; schedule: string; coverImage?: string | null; isPrivate?: boolean } = {
        settings: settingsJson,
        schedule: scheduleJson,
        isPrivate,
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
      <DialogContent className="sm:max-w-2xl md:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Настройки клуба</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 w-full shrink-0">
            <TabsTrigger value="appearance">Оформление</TabsTrigger>
            <TabsTrigger value="welcome">Приветствие</TabsTrigger>
            <TabsTrigger value="rules">Правила</TabsTrigger>
            <TabsTrigger value="schedule">Расписание</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 -mx-4 px-4">
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
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
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
