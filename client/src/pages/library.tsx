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
  CalendarClock,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useAllBookmarks, useDeleteBookmarkEntry } from "@/hooks/use-reader";
import { savePendingReaderBookmarkNavigation } from "@/lib/reader-bookmark-navigation";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

export default function Library() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: userBooksResponse, isLoading, refetch } = usePersonalBooks();
  const books = userBooksResponse || [];
  const { bookmarks, isLoading: bookmarksLoading } = useAllBookmarks();

  // Reading history data
  const { data: historyData } = useReadingHistory();
  const clearHistory = useClearReadingHistory();

  // State for book management dialogs
  const [editingBook, setEditingBook] = useState<PersonalBook | null>(null);
  const [deletingBook, setDeletingBook] = useState<PersonalBook | null>(null);
  const [planningBook, setPlanningBook] = useState<PersonalBook | null>(null);
  const [notInterestedBook, setNotInterestedBook] = useState<PersonalBook | null>(null);
  const [plannedYear, setPlannedYear] = useState<number>(new Date().getFullYear());
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    description: "",
  });
  const fallbackCover = "/placeholder-book.png";

  // Mutations for book management
  const deleteBookMutation = useDeletePersonalBook();
  const updateBookMutation = useUpdatePersonalBook();
  const deleteBookmarkMutation = useDeleteBookmarkEntry();

  const planBookMutation = useMutation({
    mutationFn: async ({ bookId, year }: { bookId: string; year: number }) => {
      await apiRequest('/api/reading-status', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          bookType: 'personal',
          status: 'planned',
          progress: 0,
          notes: JSON.stringify({ plannedYear: year }),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга запланирована',
        description: `Добавили в планы на ${plannedYear} год`,
      });
      setPlanningBook(null);
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось запланировать книгу',
        variant: 'destructive',
      });
    },
  });

  const markAsNotInterestedMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/v1/user/books/${bookId}?markAsAbandoned=true`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/user/books'] });
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга перенесена в «Брошено»',
        description: 'Книга удалена из библиотеки и сохранена в статистике',
      });
      setNotInterestedBook(null);
      refetch();
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить книгу из библиотеки',
        variant: 'destructive',
      });
    },
  });

  // Проверка авторизации
  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="container flex justify-center px-4 py-8 sm:px-6 sm:py-12 md:px-12">
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

  const handlePlanBook = (book: PersonalBook) => {
    setPlanningBook(book);
    setPlannedYear(new Date().getFullYear());
  };

  const handleConfirmPlanBook = () => {
    if (!planningBook) return;
    planBookMutation.mutate({
      bookId: planningBook.id,
      year: plannedYear,
    });
  };

  const handleConfirmNotInterested = () => {
    if (!notInterestedBook) return;
    markAsNotInterestedMutation.mutate(notInterestedBook.id);
  };

  const handleOpenBookmark = (bookmark: {
    bookId: string;
    position: string;
  }) => {
    savePendingReaderBookmarkNavigation({
      bookId: bookmark.bookId,
      position: bookmark.position,
    });
    setLocation(`/books/${bookmark.bookId}/read`);
  };

  const handleDeleteBookmark = async (bookmark: {
    id: string;
    bookId: string;
  }) => {
    try {
      await deleteBookmarkMutation.mutateAsync({
        bookId: bookmark.bookId,
        bookmarkId: bookmark.id,
      });
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить закладку",
        variant: "destructive",
      });
    }
  };

  return (
    <MainLayout>
      <div className="container space-y-6 px-4 py-8 sm:px-6 sm:py-10 md:px-12 md:py-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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

        <Tabs defaultValue="current" className="space-y-6 sm:space-y-8">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-muted/80 p-1 sm:inline-flex sm:h-9 sm:w-auto">
            <TabsTrigger value="current" className="min-h-10 px-2 text-xs sm:text-sm">Читаю сейчас</TabsTrigger>
            <TabsTrigger value="history" className="min-h-10 px-2 text-xs sm:text-sm">История</TabsTrigger>
            <TabsTrigger value="bookmarks" className="min-h-10 px-2 text-xs sm:text-sm">Закладки</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6">
            {(() => {
              if (isLoading) {
                return (
                  <div className="space-y-6">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:gap-6 sm:p-6"
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
                  className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/20 sm:flex-row sm:gap-6 sm:p-6"
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-lg font-serif font-bold sm:text-xl">{book.title}</h3>
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

                    <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
                      <Button
                        className="flex-1 gap-2 sm:flex-none"
                        onClick={() => handleReadBook(book)}
                      >
                        <Book className="w-4 h-4" /> Читать
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 gap-2 sm:flex-none"
                        onClick={() => handlePlanBook(book)}
                      >
                        <CalendarClock className="w-4 h-4" /> Запланировать
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 gap-2 text-muted-foreground hover:text-destructive sm:flex-none"
                        onClick={() => setNotInterestedBook(book)}
                      >
                        <Trash2 className="w-4 h-4" /> Не интересно
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
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold">
                      История чтения ({(historyData || []).length})
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => clearHistory.mutate()}
                      disabled={clearHistory.isPending}
                      className="w-full sm:w-auto"
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
            {(() => {
              if (bookmarksLoading) {
                return (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3 rounded-xl border bg-card p-3 sm:gap-4 sm:p-4">
                        <Skeleton className="w-20 h-28 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-3">
                          <Skeleton className="h-5 w-2/3" />
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-4 w-1/4" />
                          <Skeleton className="h-9 w-32" />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              if (bookmarks.length === 0) {
                return (
                  <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
                    <Bookmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium">Нет сохраненных закладок</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                      Ставьте закладки прямо во время чтения, чтобы быстро возвращаться к важным местам книги.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {bookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/20 sm:flex-row"
                  >
                    <div className="w-20 h-28 rounded-lg overflow-hidden shadow-sm shrink-0 bg-muted">
                      {bookmark.bookCoverUrl ? (
                        <img
                          src={bookmark.bookCoverUrl}
                          alt={bookmark.bookTitle || "Обложка книги"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = fallbackCover;
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <BookOpen className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold line-clamp-2 break-words">
                          {bookmark.title || "Без названия"}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {bookmark.bookTitle || "Книга"}{bookmark.bookAuthor ? ` • ${bookmark.bookAuthor}` : ""}
                        </p>
                        {bookmark.chapterNumber && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Глава {bookmark.chapterNumber}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Создано: {new Date(bookmark.createdAt).toLocaleString("ru-RU")}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button onClick={() => handleOpenBookmark(bookmark)} className="w-full sm:w-auto">
                          <BookOpen className="w-4 h-4 mr-2" />
                          Открыть закладку
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            void handleDeleteBookmark({
                              id: bookmark.id,
                              bookId: bookmark.bookId,
                            });
                          }}
                          disabled={deleteBookmarkMutation.isPending}
                          className="w-full sm:w-auto"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Удалить
                        </Button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Book Dialog */}
      <Dialog open={!!editingBook} onOpenChange={() => setEditingBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Редактировать книгу</DialogTitle>
            <DialogDescription>
              Измените информацию о книге. Нажмите "Сохранить" для применения изменений.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="title" className="sm:text-right">
                Название
              </Label>
              <Input
                id="title"
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="author" className="sm:text-right">
                Автор
              </Label>
              <Input
                id="author"
                value={editForm.author}
                onChange={(e) => setEditForm((prev) => ({ ...prev, author: e.target.value }))}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-start sm:gap-4">
              <Label htmlFor="description" className="sm:pt-2 sm:text-right">
                Описание
              </Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="sm:col-span-3"
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
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

      {/* Plan Book Dialog */}
      <Dialog open={!!planningBook} onOpenChange={() => setPlanningBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Запланировать чтение</DialogTitle>
            <DialogDescription>
              Выберите год, в котором хотите прочитать книгу "{planningBook?.title}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="planned-year">Хочу прочитать в году</Label>
            <Input
              id="planned-year"
              type="number"
              min={new Date().getFullYear()}
              max={new Date().getFullYear() + 15}
              value={plannedYear}
              onChange={(e) => setPlannedYear(Number.parseInt(e.target.value, 10) || new Date().getFullYear())}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanningBook(null)}>
              Отмена
            </Button>
            <Button onClick={handleConfirmPlanBook} disabled={planBookMutation.isPending}>
              {planBookMutation.isPending ? "Сохраняем..." : "Запланировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not Interested Dialog */}
      <Dialog open={!!notInterestedBook} onOpenChange={() => setNotInterestedBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Не интересно</DialogTitle>
            <DialogDescription>
              Книга "{notInterestedBook?.title}" будет удалена из личной библиотеки и сохранена в разделе "Брошено" для статистики.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotInterestedBook(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmNotInterested}
              disabled={markAsNotInterestedMutation.isPending}
            >
              {markAsNotInterestedMutation.isPending ? "Удаляем..." : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
