import {
  ArrowLeft,
  Bookmark,
  Book,
  BookOpen,
  Clock,
  Edit,
  Eye,
  Library as LibraryIcon,
  Loader2,
  LogIn,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AccountActivationBanner } from "@/components/AccountActivationBanner";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HistoryBookCard } from "@/components/ui/history-book-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeletePersonalBook,
  usePersonalBooks,
  useUpdatePersonalBook,
  type PersonalBook,
} from "@/hooks/use-books-v2";
import { useClearReadingHistory, useReadingHistory } from "@/hooks/use-reading-history";
import { toast } from "@/hooks/use-toast";

export default function Library() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { data: userBooksResponse, isLoading, refetch } = usePersonalBooks();
  const books = userBooksResponse || [];

  // Reading history data
  const { data: historyData } = useReadingHistory();
  const clearHistory = useClearReadingHistory();

  // State for book management dialogs
  const [editingBook, setEditingBook] = useState<PersonalBook | null>(null);
  const [deletingBook, setDeletingBook] = useState<PersonalBook | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    description: "",
  });
  const fallbackCover = "/placeholder-book.png";

  // Mutations for book management
  const deleteBookMutation = useDeletePersonalBook();
  const updateBookMutation = useUpdatePersonalBook();

  // Проверка авторизации
  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12 flex justify-center">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <LogIn className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle>Требуется авторизация</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Личная библиотека доступна только авторизованным пользователям. Войдите в систему
                или зарегистрируйтесь, чтобы загружать и читать свои книги.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button asChild>
                  <Link href="/auth/login">
                    <LogIn className="h-4 w-4 mr-2" />
                    Войти / Регистрация
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setLocation("/")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  На главную
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const handleBookUploadSuccess = () => {
    refetch();
  };

  const handleEditBook = (book: PersonalBook) => {
    setEditingBook(book);
    setEditForm({
      title: book.title || "",
      author: book.author || "",
      description: book.description || "",
    });
  };

  const handleUpdateBook = async () => {
    if (!editingBook) return;

    try {
      await updateBookMutation.mutateAsync({
        bookId: editingBook.id,
        updates: editForm,
      });

      toast({
        title: "Успешно",
        description: "Книга обновлена",
      });

      setEditingBook(null);
      refetch();
    } catch (error) {
      console.error("Error updating book:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось обновить книгу",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBook = async () => {
    if (!deletingBook) return;

    try {
      await deleteBookMutation.mutateAsync(deletingBook.id);

      toast({
        title: "Успешно",
        description: "Книга удалена",
      });

      setDeletingBook(null);
      refetch();
    } catch (error) {
      console.error("Error deleting book:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить книгу",
        variant: "destructive",
      });
    }
  };

  const handleReadBook = (book: PersonalBook) => {
    setLocation(`/books/${book.id}/read`);
  };

  return (
    <MainLayout>
      <div className="container py-12 px-6 md:px-12 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-primary">Моя Библиотека</h1>
            <p className="text-muted-foreground mt-1">
              Ваши книги, прогресс и сохраненные моменты.
            </p>
          </div>
          <VoxLibrisUpload
            defaultContext="personal"
            onSuccess={handleBookUploadSuccess}
            buttonText="Загрузить книгу"
          />
        </div>

        {/* Баннер активации аккаунта */}
        <AccountActivationBanner />

        <Tabs defaultValue="current" className="space-y-8">
          <TabsList>
            <TabsTrigger value="current">Читаю сейчас</TabsTrigger>
            <TabsTrigger value="history">История</TabsTrigger>
            <TabsTrigger value="bookmarks">Закладки</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6">
            {(() => {
              if (isLoading) {
                return (
                  <div className="space-y-6">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row gap-6 bg-card p-6 rounded-xl border"
                      >
                        <Skeleton className="w-full sm:w-48 aspect-[2/3] shrink-0 rounded-lg" />
                        <div className="flex-1 space-y-4">
                          <div className="space-y-2">
                            <Skeleton className="h-6 w-2/3" />
                            <Skeleton className="h-4 w-1/3" />
                          </div>
                          <Skeleton className="h-4 w-1/4" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-2 w-full" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              if (books && Array.isArray(books) && books.length > 0) {
                return books.map((book) => (
                <div
                  key={book.id}
                  className="group flex flex-col sm:flex-row gap-6 bg-card p-6 rounded-xl border hover:border-primary/20 transition-all"
                >
                  <div className="w-full sm:w-48 aspect-[2/3] shrink-0 rounded-lg overflow-hidden shadow-md">
                    <img
                      src={book.coverUrl || fallbackCover}
                      alt={book.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = fallbackCover;
                      }}
                    />
                  </div>

                  <div className="flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-serif font-bold">{book.title}</h3>
                          <p className="text-muted-foreground">{book.author}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleReadBook(book)}
                              className="flex items-center gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              Читать
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleEditBook(book)}
                              className="flex items-center gap-2"
                            >
                              <Edit className="h-4 w-4" />
                              Редактировать
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingBook(book)}
                              className="text-destructive flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Удалить из библиотеки
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-sm text-accent-foreground/80 font-medium bg-accent/10 w-fit px-2 py-1 rounded">
                        <LibraryIcon className="w-3.5 h-3.5" />
                        {(() => {
                          if (book.format === "EPUB") return "EPUB";
                          if (book.format === "FB2") return "FB2";
                          return "Книга";
                        })()}
                      </div>

                      {book.description && (
                        <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                          {book.description}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {/* Прогресс чтения */}
                      {book.progress !== undefined && book.progress > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Прогресс</span>
                            <span className="font-medium">{book.progress}%</span>
                          </div>
                          <Progress value={book.progress} className="h-2" />
                        </div>
                      )}

                      <div className="flex justify-end text-sm">
                        <span className="text-muted-foreground">
                          {book.language && <span className="uppercase">{book.language}</span>}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Добавлено: {new Date(book.createdAt ?? book.uploadedAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>

                    <div className="pt-2 flex gap-3">
                      <Button
                        className="flex-1 sm:flex-none gap-2"
                        onClick={() => handleReadBook(book)}
                      >
                        <Book className="w-4 h-4" /> Читать
                      </Button>
                    </div>
                  </div>
                </div>
              ));
              }

              return (
                <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
                  <LibraryIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium">Ваша библиотека пуста</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                    Добавьте свою первую книгу, загрузив файл EPUB или FB2 через кнопку "Загрузить
                    книгу" выше.
                  </p>
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              {historyData?.length === 0 ? (
                <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
                  <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium">Нет прочитанных книг</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                    Книги, которые вы прочитаете до конца, появятся здесь автоматически.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">
                      История чтения ({(historyData || []).length})
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => clearHistory.mutate()}
                      disabled={clearHistory.isPending}
                    >
                      {clearHistory.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Очистить историю
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(historyData || []).map((book) => (
                      <HistoryBookCard
                        key={book.id}
                        bookTitle={book.bookTitle}
                        bookAuthor={book.bookAuthor}
                        bookCoverUrl={book.bookCoverUrl ?? undefined}
                        completedAt={(book.completedAt as unknown as string) || ""}
                        readingTimeMinutes={book.readingTimeMinutes ?? undefined}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="bookmarks">
            <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
              <Bookmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium">Нет сохраненных закладок</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                Вы можете ставить закладки во время живых эфиров, чтобы вернуться к интересным
                моментам.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Book Dialog */}
      <Dialog open={!!editingBook} onOpenChange={() => setEditingBook(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Редактировать книгу</DialogTitle>
            <DialogDescription>
              Измените информацию о книге. Нажмите "Сохранить" для применения изменений.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                Название
              </Label>
              <Input
                id="title"
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="author" className="text-right">
                Автор
              </Label>
              <Input
                id="author"
                value={editForm.author}
                onChange={(e) => setEditForm((prev) => ({ ...prev, author: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Описание
              </Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="col-span-3"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBook(null)}>
              Отмена
            </Button>
            <Button onClick={handleUpdateBook} disabled={updateBookMutation.isPending}>
              {updateBookMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Book Dialog */}
      <Dialog open={!!deletingBook} onOpenChange={() => setDeletingBook(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удалить книгу</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить книгу "{deletingBook?.title}"? Это действие нельзя
              отменить. Все данные о книге и её содержимое будут удалены.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingBook(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBook}
              disabled={deleteBookMutation.isPending}
            >
              {deleteBookMutation.isPending ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
