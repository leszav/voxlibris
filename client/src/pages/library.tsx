import {
  ArrowLeft,
  Bookmark,
  Book,
  BookOpen,
  Layers,
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
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeletePersonalBook,
  useGenresCatalog,
  usePersonalBooks,
  useUpdatePersonalBook,
  type PersonalBook,
} from "@/hooks/use-books-v2";
import { useClearReadingHistory, useReadingHistory } from "@/hooks/use-reading-history";
import { useAllBookmarks, useDeleteBookmarkEntry } from "@/hooks/use-reader";
import { savePendingReaderBookmarkNavigation } from "@/lib/reader-bookmark-navigation";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface ReadingStatusRecord {
  id: string;
  bookId: string;
  bookType: "personal" | "club";
  status: "reading" | "completed" | "planned" | "abandoned";
  notes: string | null;
  completedAt?: string | null;
  updatedAt?: string;
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl?: string | null;
    format?: string;
  } | null;
}

type ShelfSort = "completed_desc" | "completed_asc" | "title_asc" | "title_desc";
type ShelfFormatFilter = "all" | "EPUB" | "FB2";
type LibrarySort = "created_desc" | "created_asc" | "title_asc" | "title_desc" | "author_asc" | "author_desc" | "genre_asc";
type GenreGroupMode = "none" | "primary_genre";

const SHELF_PAGE_SIZE = 9;

function isShelvedCompletedStatus(item: ReadingStatusRecord): boolean {
  if (item.bookType !== "personal" || item.status !== "completed") return false;
  if (!item.notes) return false;

  try {
    const parsed = JSON.parse(item.notes) as { shelved?: boolean };
    return parsed.shelved === true;
  } catch {
    return false;
  }
}

function generateDeleteCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Library() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const futureYears = Array.from({ length: 15 }, (_, index) => currentYear + index + 1);
  const { data: userBooksResponse, isLoading, refetch } = usePersonalBooks();
  const { data: genreCatalog = [] } = useGenresCatalog();
  const books = userBooksResponse || [];
  const { data: completedStatuses = [] } = useQuery<ReadingStatusRecord[]>({
    queryKey: ["reading-status", "completed", "personal"],
    queryFn: async () => apiRequest<ReadingStatusRecord[]>("/api/reading-status?status=completed&bookType=personal"),
    enabled: isAuthenticated,
  });
  const shelvedCompletedStatuses = useMemo(
    () => completedStatuses.filter(isShelvedCompletedStatus),
    [completedStatuses],
  );
  const shelvedCompletedBookIds = useMemo(
    () => new Set(shelvedCompletedStatuses.map((item) => item.bookId)),
    [shelvedCompletedStatuses],
  );
  const visibleBooks = books.filter((book) => !shelvedCompletedBookIds.has(book.id));
  const { bookmarks, isLoading: bookmarksLoading } = useAllBookmarks();

  // Reading history data
  const { data: historyData } = useReadingHistory();
  const clearHistory = useClearReadingHistory();

  // State for book management dialogs
  const [editingBook, setEditingBook] = useState<PersonalBook | null>(null);
  const [deletingBook, setDeletingBook] = useState<PersonalBook | null>(null);
  const [planningBook, setPlanningBook] = useState<PersonalBook | null>(null);
  const [notInterestedBook, setNotInterestedBook] = useState<PersonalBook | null>(null);
  const [shelfDeleteItem, setShelfDeleteItem] = useState<ReadingStatusRecord | null>(null);
  const [shelfDeleteCode, setShelfDeleteCode] = useState<string>("");
  const [shelfDeleteInput, setShelfDeleteInput] = useState<string>("");
  const [shelfDeletionUnlocked, setShelfDeletionUnlocked] = useState(false);
  const [shelfSearch, setShelfSearch] = useState("");
  const [shelfSort, setShelfSort] = useState<ShelfSort>("completed_desc");
  const [shelfFormatFilter, setShelfFormatFilter] = useState<ShelfFormatFilter>("all");
  const [shelfVisibleCount, setShelfVisibleCount] = useState(SHELF_PAGE_SIZE);
  const [plannedYear, setPlannedYear] = useState<number>(currentYear + 1);
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("created_desc");
  const [libraryGenreFilter, setLibraryGenreFilter] = useState<string>("all");
  const [libraryGroupMode, setLibraryGroupMode] = useState<GenreGroupMode>("none");
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    description: "",
    genre: "",
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

  const markAsCompletedMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiRequest('/api/reading-status', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          bookType: 'personal',
          status: 'completed',
          progress: 100,
          notes: JSON.stringify({ shelved: true }),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/books"] });
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга перенесена на полку',
        description: 'Книга отмечена как прочитанная и скрыта из библиотеки',
      });
      refetch();
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось отметить книгу как прочитанную',
        variant: 'destructive',
      });
    },
  });

  const removeFromShelfMutation = useMutation({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/reading-status/${bookId}?bookType=personal`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading-status'] });
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reading-goal'] });
      toast({
        title: 'Книга удалена с полки',
        description: 'Запись о прочитанной книге удалена',
      });
      setShelfDeleteItem(null);
      setShelfDeleteCode("");
      setShelfDeleteInput("");
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить книгу с полки',
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
      genre: book.genre || "",
    });
  };

  const handleUpdateBook = async () => {
    if (!editingBook) return;

    try {
      await updateBookMutation.mutateAsync({
        bookId: editingBook.id,
        updates: {
          ...editForm,
          genres: editForm.genre.trim() ? [editForm.genre.trim()] : [],
        },
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
    setPlannedYear(currentYear + 1);
  };

  const handleConfirmPlanBook = () => {
    if (!planningBook) return;

    if (plannedYear <= currentYear) {
      toast({
        title: 'Некорректный год',
        description: 'Можно выбрать только будущий год',
        variant: 'destructive',
      });
      return;
    }

    planBookMutation.mutate({
      bookId: planningBook.id,
      year: plannedYear,
    });
  };

  const handleMarkAsCompleted = (book: PersonalBook) => {
    markAsCompletedMutation.mutate(book.id);
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

  const shelfItems = useMemo(() => {
    const search = shelfSearch.trim().toLowerCase();

    return shelvedCompletedStatuses
      .filter((item) => {
        if (!item.book) return false;

        if (shelfFormatFilter !== "all" && item.book.format !== shelfFormatFilter) {
          return false;
        }

        if (!search) return true;

        const title = item.book.title.toLowerCase();
        const author = item.book.author.toLowerCase();
        return title.includes(search) || author.includes(search);
      })
      .sort((a, b) => {
        const dateA = new Date(a.completedAt ?? a.updatedAt ?? 0).getTime();
        const dateB = new Date(b.completedAt ?? b.updatedAt ?? 0).getTime();

        if (shelfSort === "completed_desc") return dateB - dateA;
        if (shelfSort === "completed_asc") return dateA - dateB;

        const titleA = a.book?.title ?? "";
        const titleB = b.book?.title ?? "";
        if (shelfSort === "title_desc") return titleB.localeCompare(titleA, "ru");
        return titleA.localeCompare(titleB, "ru");
      });
  }, [shelvedCompletedStatuses, shelfFormatFilter, shelfSearch, shelfSort]);

  useEffect(() => {
    setShelfVisibleCount(SHELF_PAGE_SIZE);
  }, [shelfSearch, shelfSort, shelfFormatFilter]);

  const visibleShelfItems = shelfItems.slice(0, shelfVisibleCount);
  const canLoadMoreShelfItems = shelfVisibleCount < shelfItems.length;

  const handleLoadMoreShelfItems = () => {
    setShelfVisibleCount((prev) => prev + SHELF_PAGE_SIZE);
  };

  const handleAskShelfDelete = (item: ReadingStatusRecord) => {
    setShelfDeleteItem(item);
    setShelfDeleteCode(generateDeleteCode());
    setShelfDeleteInput("");
  };

  const handleCloseShelfDelete = () => {
    setShelfDeleteItem(null);
    setShelfDeleteCode("");
    setShelfDeleteInput("");
  };

  const handleConfirmShelfDelete = () => {
    if (!shelfDeleteItem) return;

    if (shelfDeleteInput !== shelfDeleteCode) {
      toast({
        title: "Неверный код",
        description: "Введите код подтверждения точно как в окне",
        variant: "destructive",
      });
      return;
    }

    removeFromShelfMutation.mutate(shelfDeleteItem.bookId);
  };

  useEffect(() => {
    if (!shelfDeletionUnlocked && shelfDeleteItem) {
      handleCloseShelfDelete();
    }
  }, [shelfDeletionUnlocked, shelfDeleteItem]);

  const filteredAndSortedBooks = useMemo(() => {
    const search = librarySearch.trim().toLowerCase();

    const matchesSearch = (book: PersonalBook) => {
      if (!search) return true;
      const title = (book.title || "").toLowerCase();
      const author = (book.author || "").toLowerCase();
      const genreText = (book.genre || "").toLowerCase();
      const genreLabels = (book.genres || []).map((g) => g.label.toLowerCase()).join(" ");
      return title.includes(search) || author.includes(search) || genreText.includes(search) || genreLabels.includes(search);
    };

    const matchesGenre = (book: PersonalBook) => {
      if (libraryGenreFilter === "all") return true;
      if (libraryGenreFilter === "none") return !book.primaryGenre;
      return book.primaryGenre?.code === libraryGenreFilter || (book.genres || []).some((genre) => genre.code === libraryGenreFilter);
    };

    const sorted = visibleBooks
      .filter(matchesSearch)
      .filter(matchesGenre)
      .sort((left, right) => {
        if (librarySort === "created_desc") {
          return new Date(right.createdAt ?? right.uploadedAt).getTime() - new Date(left.createdAt ?? left.uploadedAt).getTime();
        }
        if (librarySort === "created_asc") {
          return new Date(left.createdAt ?? left.uploadedAt).getTime() - new Date(right.createdAt ?? right.uploadedAt).getTime();
        }
        if (librarySort === "title_asc") return left.title.localeCompare(right.title, "ru");
        if (librarySort === "title_desc") return right.title.localeCompare(left.title, "ru");
        if (librarySort === "author_asc") return left.author.localeCompare(right.author, "ru");
        if (librarySort === "author_desc") return right.author.localeCompare(left.author, "ru");

        const leftGenre = left.primaryGenre?.label || left.genre || "";
        const rightGenre = right.primaryGenre?.label || right.genre || "";
        return leftGenre.localeCompare(rightGenre, "ru");
      });

    return sorted;
  }, [visibleBooks, libraryGenreFilter, librarySearch, librarySort]);

  const groupedBooks = useMemo(() => {
    if (libraryGroupMode !== "primary_genre") {
      return [{ key: "all", label: "Все книги", books: filteredAndSortedBooks }];
    }

    const map = new Map<string, PersonalBook[]>();
    for (const book of filteredAndSortedBooks) {
      const key = book.primaryGenre?.code ?? "none";
      const list = map.get(key) || [];
      list.push(book);
      map.set(key, list);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "ru"))
      .map(([key, grouped]) => ({
        key,
        label: key === "none" ? "Без жанра" : (grouped[0]?.primaryGenre?.label || grouped[0]?.genre || "Без жанра"),
        books: grouped,
      }));
  }, [filteredAndSortedBooks, libraryGroupMode]);

  const formatBookGenres = (book: PersonalBook) => {
    const labels = (book.genres || []).map((genre) => genre.label).filter(Boolean);
    if (labels.length > 0) {
      return labels.join(", ");
    }

    return book.primaryGenre?.label || book.genre || "";
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
          <TabsList className="grid h-auto w-full grid-cols-4 rounded-xl bg-muted/80 p-1 sm:inline-flex sm:h-9 sm:w-auto">
            <TabsTrigger value="current" className="min-h-10 px-2 text-xs sm:text-sm">Читаю сейчас</TabsTrigger>
            <TabsTrigger value="shelf" className="min-h-10 px-2 text-xs sm:text-sm">Книжная полка</TabsTrigger>
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

              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      placeholder="Поиск: название, автор, жанр"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                    />

                    <Select value={libraryGenreFilter} onValueChange={setLibraryGenreFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Жанр" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все жанры</SelectItem>
                        <SelectItem value="none">Без жанра</SelectItem>
                        {genreCatalog.map((genre) => (
                          <SelectItem key={genre.id} value={genre.code}>{genre.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={librarySort} onValueChange={(value) => setLibrarySort(value as LibrarySort)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Сортировка" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_desc">Сначала новые</SelectItem>
                        <SelectItem value="created_asc">Сначала старые</SelectItem>
                        <SelectItem value="title_asc">Название: А-Я</SelectItem>
                        <SelectItem value="title_desc">Название: Я-А</SelectItem>
                        <SelectItem value="author_asc">Автор: А-Я</SelectItem>
                        <SelectItem value="author_desc">Автор: Я-А</SelectItem>
                        <SelectItem value="genre_asc">По жанру</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={libraryGroupMode} onValueChange={(value) => setLibraryGroupMode(value as GenreGroupMode)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Группировка" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Без группировки</SelectItem>
                        <SelectItem value="primary_genre">По основному жанру</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              if (filteredAndSortedBooks.length > 0) {
                return groupedBooks.map((group) => (
                <div key={group.key} className="space-y-3">
                  {libraryGroupMode === "primary_genre" && (
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{group.label}</h3>
                    </div>
                  )}
                  {group.books.map((book) => (
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

                      {formatBookGenres(book) && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Жанры: {formatBookGenres(book)}
                        </div>
                      )}

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
                          {(book.progress ?? 0) > 95 && !shelvedCompletedBookIds.has(book.id) && (
                            <Button
                              variant="secondary"
                              className="flex-1 gap-2 sm:flex-none"
                              onClick={() => handleMarkAsCompleted(book)}
                          disabled={markAsCompletedMutation.isPending}
                        >
                          <BookOpen className="w-4 h-4" />
                          {markAsCompletedMutation.isPending ? "Сохраняем..." : "Прочитано"}
                        </Button>
                      )}
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
              ))}
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

          <TabsContent value="shelf" className="space-y-4">
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Книжная полка</h3>
                    <p className="text-sm text-muted-foreground">
                      Прочитанные книги, которые вы вручную отметили кнопкой «Прочитано».
                    </p>
                  </div>
                  <Button
                    variant={shelfDeletionUnlocked ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShelfDeletionUnlocked((prev) => !prev)}
                  >
                    {shelfDeletionUnlocked ? "Режим удаления включен" : "Разблокировать удаление"}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Поиск по названию и автору"
                    value={shelfSearch}
                    onChange={(e) => setShelfSearch(e.target.value)}
                  />

                  <Select value={shelfFormatFilter} onValueChange={(value) => setShelfFormatFilter(value as ShelfFormatFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Формат" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все форматы</SelectItem>
                      <SelectItem value="EPUB">EPUB</SelectItem>
                      <SelectItem value="FB2">FB2</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={shelfSort} onValueChange={(value) => setShelfSort(value as ShelfSort)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Сортировка" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed_desc">Сначала недавно прочитанные</SelectItem>
                      <SelectItem value="completed_asc">Сначала давно прочитанные</SelectItem>
                      <SelectItem value="title_asc">Название: А-Я</SelectItem>
                      <SelectItem value="title_desc">Название: Я-А</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {shelfItems.length === 0 ? (
              <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium">Полка пуста</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                  Отмечайте книги кнопкой «Прочитано», чтобы переносить их на полку.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleShelfItems.map((item) => {
                    if (!item.book) return null;

                    const completedAt = item.completedAt ?? item.updatedAt;

                    return (
                      <Card key={item.id} className="overflow-hidden">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex gap-3">
                            <div className="w-16 h-24 rounded overflow-hidden bg-muted shrink-0">
                              {item.book.coverUrl ? (
                                <img
                                  src={item.book.coverUrl}
                                  alt={item.book.title}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.src = fallbackCover;
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <BookOpen className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium line-clamp-2">{item.book.title}</h4>
                              <p className="text-sm text-muted-foreground truncate">{item.book.author}</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                Прочитано: {completedAt ? new Date(completedAt).toLocaleDateString("ru-RU") : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              className="flex-1"
                              onClick={() => setLocation(`/books/${item.bookId}/read`)}
                            >
                              Читать снова
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              disabled={!shelfDeletionUnlocked}
                              onClick={() => handleAskShelfDelete(item)}
                            >
                              Удалить
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {canLoadMoreShelfItems && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={handleLoadMoreShelfItems}>
                      Показать еще
                    </Button>
                  </div>
                )}
              </>
            )}
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
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="genre" className="sm:text-right">
                Жанр
              </Label>
              <Input
                id="genre"
                value={editForm.genre}
                onChange={(e) => setEditForm((prev) => ({ ...prev, genre: e.target.value }))}
                className="sm:col-span-3"
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
              Выберите будущий год, в котором хотите прочитать книгу "{planningBook?.title}".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="planned-year">Хочу прочитать в году</Label>
            <Select
              value={String(plannedYear)}
              onValueChange={(value) => setPlannedYear(Number.parseInt(value, 10))}
            >
              <SelectTrigger id="planned-year">
                <SelectValue placeholder="Выберите год" />
              </SelectTrigger>
              <SelectContent>
                {futureYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* Shelf Delete Confirmation Dialog */}
      <Dialog
        open={!!shelfDeleteItem}
        onOpenChange={(open) => {
          if (!open) handleCloseShelfDelete();
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удалить книгу с полки</DialogTitle>
            <DialogDescription>
              Чтобы избежать случайного удаления, введите код подтверждения для книги
              "{shelfDeleteItem?.book?.title}".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Код подтверждения</p>
              <p className="mt-1 font-mono text-lg tracking-widest">{shelfDeleteCode || "------"}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shelf-delete-code">Введите код</Label>
              <Input
                id="shelf-delete-code"
                inputMode="numeric"
                maxLength={6}
                value={shelfDeleteInput}
                onChange={(e) => setShelfDeleteInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 цифр"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseShelfDelete}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmShelfDelete}
              disabled={removeFromShelfMutation.isPending || shelfDeleteInput.length !== 6}
            >
              {removeFromShelfMutation.isPending ? "Удаляем..." : "Удалить"}
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
