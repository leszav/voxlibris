import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ClubBook } from "@/hooks/use-books-v2";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const clubBookEditSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
  coverUrl: z.string().optional().or(z.literal("")),
  genre: z.string().optional(),
  language: z.string().optional(),
  publicationYear: z.string().optional(),
});

type ClubBookEditForm = z.infer<typeof clubBookEditSchema>;

interface EditClubBookDialogProps {
  readonly book: ClubBook;
  readonly clubId: string;
  readonly children?: React.ReactNode;
  readonly onSave?: () => void;
}

export function EditClubBookDialog({ book, clubId, children, onSave }: EditClubBookDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [coverPreview, setCoverPreview] = React.useState(book.coverUrl || "");
  const [isCoverModified, setIsCoverModified] = React.useState(false);
  const [selectedCoverFile, setSelectedCoverFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputId = React.useId();
  const { toast } = useToast();

  const form = useForm<ClubBookEditForm>({
    resolver: zodResolver(clubBookEditSchema),
    defaultValues: {
      title: book.title || "",
      description: book.description || "",
      coverUrl: book.coverUrl || "",
      genre: book.genre || "",
      language: book.language || "",
      publicationYear: book.publicationYear?.toString() || "",
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        title: book.title || "",
        description: book.description || "",
        coverUrl: book.coverUrl || "",
        genre: book.genre || "",
        language: book.language || "",
        publicationYear: book.publicationYear?.toString() || "",
      });
      setCoverPreview(book.coverUrl || "");
      setIsCoverModified(false);
      setSelectedCoverFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open, book, form]);

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

    const previewUrl = URL.createObjectURL(file);
    setCoverPreview((previousPreview) => {
      if (previousPreview.startsWith("blob:")) {
        URL.revokeObjectURL(previousPreview);
      }
      return previewUrl;
    });
    setSelectedCoverFile(file);
    form.setValue("coverUrl", "");
    setIsCoverModified(true);
    toast({
      title: "Обложка выбрана",
      description: "Изображение будет сохранено при нажатии 'Сохранить'",
    });
  };

  const removeCover = () => {
    if (coverPreview.startsWith("blob:")) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverPreview("");
    form.setValue("coverUrl", "");
    setIsCoverModified(true);
    setSelectedCoverFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onSubmit = async (data: ClubBookEditForm) => {
    try {
      if (selectedCoverFile) {
        const body = new FormData();
        body.set("title", data.title);
        body.set("description", data.description ?? "");
        body.set("genre", data.genre ?? "");
        body.set("genres", JSON.stringify(data.genre?.trim() ? [data.genre.trim()] : []));
        body.set("language", data.language ?? "");
        body.set("publicationYear", data.publicationYear ?? "");
        body.set("cover", selectedCoverFile);

        await apiRequest(`/api/v1/clubs/${clubId}/books/${book.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        const { coverUrl, ...bookData } = data;
        const payload = {
          ...bookData,
          ...(isCoverModified ? { coverUrl: coverUrl ?? "" } : {}),
          genres: data.genre?.trim() ? [data.genre.trim()] : [],
        };

        await apiRequest(`/api/v1/clubs/${clubId}/books/${book.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      toast({
        title: "Успешно",
        description: "Книга обновлена",
      });

      setOpen(false);
      onSave?.();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось обновить книгу",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Edit2 className="w-4 h-4 mr-2" />
            Редактировать
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[95%] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактировать книгу</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input placeholder="Название книги" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Автор
                </label>
                <Input value={book.author || ""} disabled className="bg-muted" />
              </div>
              <FormField
                control={form.control}
                name="publicationYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Год издания</FormLabel>
                    <FormControl>
                      <Input placeholder="2024" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Описание книги..."
                      className="resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="coverUrl"
              render={({ field }) => (
                <FormItem>
                  <label className="text-sm font-medium leading-none">Обложка</label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="relative w-24 h-32 rounded-md overflow-hidden border bg-muted shrink-0">
                        {coverPreview ? (
                          <img
                            src={coverPreview}
                            alt="Предпросмотр обложки"
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
                          <Button type="button" variant="outline" size="sm" onClick={openFilePicker}>
                            <Upload className="w-4 h-4 mr-2" />
                            Загрузить
                          </Button>
                          <input
                            id={fileInputId}
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleCoverUpload}
                          />
                          {coverPreview && (
                            <Button type="button" variant="ghost" size="sm" onClick={removeCover}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <FormControl>
                          <Input
                            placeholder="или URL обложки..."
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              setCoverPreview(e.target.value);
                              setIsCoverModified(true);
                              setSelectedCoverFile(null);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = "";
                              }
                            }}
                          />
                        </FormControl>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Рекомендуемый размер: 300x450px, макс. 5 МБ
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="genre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Жанр</FormLabel>
                    <FormControl>
                      <Input placeholder="Фантастика" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Язык</FormLabel>
                    <FormControl>
                      <Input placeholder="ru" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Сохранить
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
