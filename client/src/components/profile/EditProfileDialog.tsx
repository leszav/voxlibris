import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, X, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { useGenresCatalog } from "@/hooks/use-books-v2";

const profileEditSchema = z.object({
  displayName: z.string().min(1, "Имя обязательно"),
  avatar: z.string().optional().or(z.literal("")),
  coverImage: z.string().optional().or(z.literal("")),
  bio: z.string().max(200, "Слишком длинное описание").optional(),
  profileQuote: z.string().max(280, "Слишком длинная цитата").optional(),
  profileQuoteAuthor: z.string().max(80, "Слишком длинное имя автора").optional(),
  favoriteGenres: z.string().optional(),
  isReader: z.boolean(),
});

type ProfileEditForm = z.infer<typeof profileEditSchema>;

interface UserProfile {
  displayName: string | null;
  avatar: string | null;
  coverImage?: string | null;
  bio: string | null;
  profileQuote?: string | null;
  profileQuoteAuthor?: string | null;
  favoriteGenres: string | null;
  isReader: boolean;
}

interface EditProfileDialogProps {
  readonly profile: UserProfile;
  readonly children: React.ReactNode;
  readonly onSave: (data: ProfileEditForm) => void;
  readonly isLoading?: boolean;
}

function splitGenres(genresValue: string | null | undefined): string[] {
  if (!genresValue) {
    return [];
  }

  return genresValue
    .split(/[;,\n]+/u)
    .map((genre) => genre.trim())
    .filter(Boolean);
}

export function EditProfileDialog({ profile, children, onSave, isLoading }: EditProfileDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [genresPopoverOpen, setGenresPopoverOpen] = React.useState(false);
  const [avatarPreview, setAvatarPreview] = React.useState(profile.avatar || "");
  const [coverPreview, setCoverPreview] = React.useState(profile.coverImage || "");
  
  // Состояния для crop диалогов
  const [showAvatarCrop, setShowAvatarCrop] = React.useState(false);
  const [showCoverCrop, setShowCoverCrop] = React.useState(false);
  const [tempAvatarImage, setTempAvatarImage] = React.useState("");
  const [tempCoverImage, setTempCoverImage] = React.useState("");
  
  const { toast } = useToast();
  const { data: genresCatalog = [], isLoading: isGenresCatalogLoading } = useGenresCatalog();
  const catalogLabelSet = React.useMemo(
    () => new Set(genresCatalog.map((genre) => genre.label)),
    [genresCatalog],
  );
  
  const form = useForm<ProfileEditForm>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      displayName: profile.displayName || "",
      avatar: profile.avatar || "",
      coverImage: profile.coverImage || "",
      bio: profile.bio || "",
      profileQuote: profile.profileQuote || "",
      profileQuoteAuthor: profile.profileQuoteAuthor || "",
      favoriteGenres: profile.favoriteGenres || "",
      isReader: profile.isReader,
    },
  });

  // Обновляем превью при изменении формы
  React.useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "avatar" && value.avatar) {
        setAvatarPreview(value.avatar);
      }
      if (name === "coverImage" && value.coverImage) {
        setCoverPreview(value.coverImage);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Синхронизируем форму когда profile загрузился/обновился извне (RHF defaultValues статичны)
  React.useEffect(() => {
    form.reset({
      displayName: profile.displayName || "",
      avatar: profile.avatar || "",
      coverImage: profile.coverImage || "",
      bio: profile.bio || "",
      profileQuote: profile.profileQuote || "",
      profileQuoteAuthor: profile.profileQuoteAuthor || "",
      favoriteGenres: splitGenres(profile.favoriteGenres).join(", "),
      isReader: profile.isReader,
    });
    setAvatarPreview(profile.avatar || "");
    setCoverPreview(profile.coverImage || "");
  }, [profile]);

  React.useEffect(() => {
    if (catalogLabelSet.size === 0) {
      return;
    }

    const current = splitGenres(form.getValues("favoriteGenres"));
    const normalizedFromCatalog = current.filter((genre) => catalogLabelSet.has(genre));

    if (normalizedFromCatalog.length !== current.length) {
      form.setValue("favoriteGenres", normalizedFromCatalog.join(", "), { shouldDirty: true });
    }
  }, [catalogLabelSet, form]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setTempAvatarImage(base64);
      setShowAvatarCrop(true);
    };
    reader.readAsDataURL(file);
  };

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

  const handleAvatarCropped = (croppedImage: string) => {
    setAvatarPreview(croppedImage);
    form.setValue("avatar", croppedImage);
    toast({
      title: "Аватар загружен",
      description: "Изображение будет сохранено при нажатии 'Сохранить'",
    });
  };

  const handleCoverCropped = (croppedImage: string) => {
    setCoverPreview(croppedImage);
    form.setValue("coverImage", croppedImage);
    toast({
      title: "Фон загружен",
      description: "Изображение будет сохранено при нажатии 'Сохранить'",
    });
  };

  const currentGenres = splitGenres(form.watch("favoriteGenres"));

  const availableCatalogGenres = React.useMemo(
    () => genresCatalog.filter((genre) => !currentGenres.includes(genre.label)),
    [genresCatalog, currentGenres],
  );

  let addGenreButtonLabel = "Добавить жанр из справочника";
  if (isGenresCatalogLoading) {
    addGenreButtonLabel = "Загрузка справочника жанров...";
  } else if (availableCatalogGenres.length === 0) {
    addGenreButtonLabel = "Все жанры выбраны";
  }

  const addGenre = (genre: string) => {
    if (catalogLabelSet.has(genre) && !currentGenres.includes(genre)) {
      form.setValue("favoriteGenres", [...currentGenres, genre].join(", "));
    }
  };

  const removeGenre = (genreToRemove: string) => {
    const genres = currentGenres.filter(g => g !== genreToRemove);
    form.setValue("favoriteGenres", genres.join(", "));
  };

  const onSubmit = (data: ProfileEditForm) => {
    onSave(data);
    setOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Редактировать профиль</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Имя</FormLabel>
                  <FormControl>
                    <Input placeholder="Ваше имя" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="avatar"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Аватар</FormLabel>
                  <div className="space-y-3">
                    {/* Превью аватара */}
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-muted">
                        {avatarPreview ? (
                          <img
                            src={avatarPreview}
                            alt="Предпросмотр аватара"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <label className="cursor-pointer">
                              <Upload className="w-4 h-4 mr-2" />
                              Загрузить файл
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarUpload}
                              />
                            </label>
                          </Button>
                          {avatarPreview && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAvatarPreview("");
                                form.setValue("avatar", "");
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <FormControl>
                          <Input 
                            placeholder="или вставьте URL..." 
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              setAvatarPreview(e.target.value);
                            }}
                          />
                        </FormControl>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Квадратное изображение, макс. 5 МБ
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="coverImage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Обложка профиля</FormLabel>
                  <div className="space-y-3">
                    {/* Превью обложки */}
                    <div className="relative w-full h-32 rounded-lg overflow-hidden border-2 border-border bg-muted">
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="Предпросмотр обложки"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <ImageIcon className="w-8 h-8 mb-2" />
                          <p className="text-sm">Обложка не загружена</p>
                        </div>
                      )}
                    </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            className="w-full sm:flex-1"
                          >
                        <label className="cursor-pointer">
                          <Upload className="w-4 h-4 mr-2" />
                          Загрузить файл
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCoverUpload}
                          />
                        </label>
                      </Button>
                      {coverPreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCoverPreview("");
                            form.setValue("coverImage", "");
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <FormControl>
                      <Input 
                        placeholder="или вставьте URL..." 
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          setCoverPreview(e.target.value);
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Рекомендуемый размер: 1200x320px, макс. 5 МБ
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>О себе</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Расскажите о себе..." 
                      className="resize-none" 
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profileQuote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Любимая цитата</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Добавьте цитату для профиля"
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profileQuoteAuthor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Автор цитаты</FormLabel>
                  <FormControl>
                    <Input placeholder="Например: А. П. Чехов" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="favoriteGenres"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Любимые жанры</FormLabel>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                      {currentGenres.map((genre) => (
                        <Badge key={genre} variant="secondary" className="pr-1">
                          {genre}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1 ml-1 hover:bg-transparent"
                            onClick={() => removeGenre(genre)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                      {currentGenres.length === 0 && (
                        <p className="text-sm text-muted-foreground">Жанры не выбраны</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Popover open={genresPopoverOpen} onOpenChange={setGenresPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={genresPopoverOpen}
                            className="w-full justify-between"
                            disabled={isGenresCatalogLoading || availableCatalogGenres.length === 0}
                          >
                            {addGenreButtonLabel}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Поиск жанра..." />
                            <CommandList>
                              <CommandEmpty>Жанры не найдены</CommandEmpty>
                              <CommandGroup>
                                {availableCatalogGenres.map((genre) => (
                                  <CommandItem
                                    key={genre.id}
                                    value={genre.label}
                                    onSelect={() => {
                                      addGenre(genre.label);
                                      setGenresPopoverOpen(false);
                                    }}
                                  >
                                    {genre.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {!isGenresCatalogLoading && availableCatalogGenres.length === 0 && (
                        <p className="text-sm text-muted-foreground">Все жанры из справочника уже выбраны</p>
                      )}
                    </div>
                  </div>
                  <input type="hidden" {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isReader"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Статус читателя</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Показывать, что вы читаете вслух
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
                Отмена
              </Button>
              <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                {isLoading ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Диалог обрезки аватара */}
    <ImageCropDialog
      open={showAvatarCrop}
      onOpenChange={setShowAvatarCrop}
      image={tempAvatarImage}
      aspectRatio={1}
      maxWidth={400}
      maxHeight={400}
      onCropComplete={handleAvatarCropped}
      title="Настройка аватара"
    />

    {/* Диалог обрезки фона */}
    <ImageCropDialog
      open={showCoverCrop}
      onOpenChange={setShowCoverCrop}
      image={tempCoverImage}
      aspectRatio={16 / 9}
      maxWidth={1920}
      maxHeight={1080}
      onCropComplete={handleCoverCropped}
      title="Настройка фонового изображения"
    />
    </>
  );
}
