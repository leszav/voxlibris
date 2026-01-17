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
import { X, Plus, Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const profileEditSchema = z.object({
  displayName: z.string().min(1, "Имя обязательно"),
  avatar: z.string().optional().or(z.literal("")),
  coverImage: z.string().optional().or(z.literal("")),
  bio: z.string().max(200, "Слишком длинное описание").optional(),
  favoriteGenres: z.string().optional(),
  isReader: z.boolean(),
});

type ProfileEditForm = z.infer<typeof profileEditSchema>;

interface UserProfile {
  displayName: string | null;
  avatar: string | null;
  coverImage?: string | null;
  bio: string | null;
  favoriteGenres: string | null;
  isReader: boolean;
}

interface EditProfileDialogProps {
  readonly profile: UserProfile;
  readonly children: React.ReactNode;
  readonly onSave: (data: ProfileEditForm) => void;
  readonly isLoading?: boolean;
}

const commonGenres = [
  "Фантастика", "Детектив", "Роман", "Научная фантастика", "Фэнтези", 
  "Исторический роман", "Биография", "Психология", "Бизнес", "Художественная литература"
];

export function EditProfileDialog({ profile, children, onSave, isLoading }: EditProfileDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [newGenre, setNewGenre] = React.useState("");
  const [avatarPreview, setAvatarPreview] = React.useState(profile.avatar || "");
  const [coverPreview, setCoverPreview] = React.useState(profile.coverImage || "");
  const { toast } = useToast();
  
  const form = useForm<ProfileEditForm>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      displayName: profile.displayName || "",
      avatar: profile.avatar || "",
      coverImage: profile.coverImage || "",
      bio: profile.bio || "",
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

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 5 МБ",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setAvatarPreview(base64);
      form.setValue("avatar", base64);
      toast({
        title: "Аватар загружен",
        description: "Изображение будет сохранено при нажатии 'Сохранить'",
      });
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

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 5 МБ",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setCoverPreview(base64);
      form.setValue("coverImage", base64);
      toast({
        title: "Обложка загружена",
        description: "Изображение будет сохранено при нажатии 'Сохранить'",
      });
    };
    reader.readAsDataURL(file);
  };

  const currentGenres = form.watch("favoriteGenres") 
    ? form.watch("favoriteGenres")!.split(",").filter(g => g.trim())
    : [];

  const addGenre = (genre: string) => {
    const genres = [...currentGenres];
    if (!genres.includes(genre)) {
      genres.push(genre);
      form.setValue("favoriteGenres", genres.join(","));
    }
    setNewGenre("");
  };

  const removeGenre = (genreToRemove: string) => {
    const genres = currentGenres.filter(g => g !== genreToRemove);
    form.setValue("favoriteGenres", genres.join(","));
  };

  const handleAddCustomGenre = () => {
    if (newGenre.trim() && !currentGenres.includes(newGenre.trim())) {
      addGenre(newGenre.trim());
    }
  };

  const onSubmit = (data: ProfileEditForm) => {
    onSave(data);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex-1"
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
              name="favoriteGenres"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Любимые жанры</FormLabel>
                  <div className="space-y-2">
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
                    </div>
                    
                    <div className="flex gap-2">
                      <Input
                        placeholder="Добавить жанр"
                        value={newGenre}
                        onChange={(e) => setNewGenre(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddCustomGenre();
                          }
                        }}
                      />
                      <Button type="button" size="sm" onClick={handleAddCustomGenre}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {commonGenres.map((genre) => (
                        <Button
                          key={genre}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addGenre(genre)}
                          disabled={currentGenres.includes(genre)}
                        >
                          {genre}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <input type="hidden" {...field} />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isReader"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
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

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}