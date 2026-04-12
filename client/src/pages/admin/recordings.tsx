import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Download, Headphones, Loader2, Mic, Pause, Play, Search, Trash2, Users2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { modalConfirm, toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AdminRecording {
  id: string;
  fileName: string;
  sessionId: string;
  clubId: string | null;
  clubName: string;
  bookId: string | null;
  bookTitle: string;
  chapter: number | null;
  readerId: string | null;
  readerName: string;
  recordedAt: string;
  sessionStartedAt: string | null;
  durationSeconds: number | null;
  fileSize: number;
  streamUrl: string;
  downloadUrl: string;
}

interface FilterOption {
  id: string;
  name: string;
}

interface AdminRecordingsResponse {
  recordings: AdminRecording[];
  filters: {
    clubs: FilterOption[];
    readers: FilterOption[];
    books: FilterOption[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface RecordingFilters {
  search: string;
  clubId: string;
  bookId: string;
  readerId: string;
  sort: "desc" | "asc";
  page: number;
  limit: number;
}

async function fetchRecordings(filters: RecordingFilters): Promise<AdminRecordingsResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.clubId !== "all") params.set("clubId", filters.clubId);
  if (filters.bookId !== "all") params.set("bookId", filters.bookId);
  if (filters.readerId !== "all") params.set("readerId", filters.readerId);
  params.set("sort", filters.sort);
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));

  return apiRequest<AdminRecordingsResponse>(`/api/v1/admin/recordings?${params.toString()}`);
}

async function deleteRecording(recordingId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE",
  });
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "--:--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function RecordingCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export default function AdminRecordings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [filters, setFilters] = useState<RecordingFilters>({
    search: "",
    clubId: "all",
    bookId: "all",
    readerId: "all",
    sort: "desc",
    page: 1,
    limit: 12,
  });
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-recordings", filters],
    queryFn: () => fetchRecordings(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecording,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-recordings"] });
      toast({
        title: "Запись удалена",
        description: "Файл записи эфира удалён с сервера.",
      });
    },
    onError: (error) => {
      toast({
        title: "Не удалось удалить запись",
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    },
  });

  const recordings = data?.recordings ?? [];
  const clubOptions = data?.filters.clubs ?? [];
  const bookOptions = data?.filters.books ?? [];
  const readerOptions = data?.filters.readers ?? [];
  const pagination = data?.pagination;
  const canDelete = user?.role === "admin";

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const handleDelete = async (recording: AdminRecording) => {
    const confirmed = await modalConfirm({
      title: "Удалить запись эфира?",
      description: `Будет удалён файл «${recording.fileName}». Это действие нельзя отменить.`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });

    if (!confirmed) return;
    deleteMutation.mutate(recording.id);
  };

  const handleTogglePlayback = async (recording: AdminRecording) => {
    if (playingId === recording.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    audioRef.current?.pause();
    const nextAudio = new Audio(recording.streamUrl);
    nextAudio.onended = () => {
      audioRef.current = null;
      setPlayingId(null);
    };
    nextAudio.onerror = () => {
      audioRef.current = null;
      setPlayingId(null);
      toast({
        title: "Не удалось воспроизвести запись",
        description: "Проверьте наличие файла и права доступа.",
        variant: "destructive",
      });
    };

    audioRef.current = nextAudio;
    setPlayingId(recording.id);

    try {
      await nextAudio.play();
    } catch (error) {
      audioRef.current = null;
      setPlayingId(null);
      toast({
        title: "Браузер заблокировал воспроизведение",
        description: error instanceof Error ? error.message : "Не удалось запустить аудио.",
        variant: "destructive",
      });
    }
  };

  let content: ReactNode;
  if (isLoading) {
    content = (
      <div className="grid gap-4 lg:grid-cols-2">
        <RecordingCardSkeleton />
        <RecordingCardSkeleton />
        <RecordingCardSkeleton />
        <RecordingCardSkeleton />
      </div>
    );
  } else if (recordings.length === 0) {
    content = (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Записи не найдены. После завершения эфиров MP3-файлы появятся здесь автоматически.
      </div>
    );
  } else {
    content = (
      <div className="grid gap-4 lg:grid-cols-2">
        {recordings.map((recording) => {
          const isPlayingThisRecording = playingId === recording.id;
          const playbackLabel = isPlayingThisRecording ? "Остановить" : "Прослушать";

          return (
            <Card key={recording.id} className="border-border/70 shadow-sm">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="line-clamp-2 text-lg">{recording.bookTitle}</CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{recording.clubName}</Badge>
                      {recording.chapter !== null && <Badge variant="outline">Глава {recording.chapter}</Badge>}
                    </CardDescription>
                  </div>

                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void handleDelete(recording)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    <span>{recording.readerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDateTime(recording.recordedAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Users2 className="h-4 w-4" />
                    <span>Размер файла: {formatBytes(recording.fileSize)} • Длительность: {formatDuration(recording.durationSeconds)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant={isPlayingThisRecording ? "secondary" : "default"} onClick={() => void handleTogglePlayback(recording)}>
                    {isPlayingThisRecording ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                    {playbackLabel}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={recording.downloadUrl}>
                      <Download className="mr-2 h-4 w-4" />
                      Скачать
                    </a>
                  </Button>
                </div>

                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <div>Сессия: {recording.sessionId}</div>
                  <div>Файл: {recording.fileName}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Записи эфиров</h1>
            <p className="text-muted-foreground">Прослушивание и удаление записей клубных эфиров с основными метаданными.</p>
          </div>

          <div className="w-full space-y-3">
            <div className="relative max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: 1 }))}
                placeholder="Поиск по клубу, книге, чтецу"
                className="pl-9"
              />
            </div>

            <div className="grid w-full gap-3 lg:grid-cols-[220px_220px_220px_180px_auto]">
              <Select value={filters.clubId} onValueChange={(value) => setFilters((prev) => ({ ...prev, clubId: value, page: 1 }))}>
                <SelectTrigger><SelectValue placeholder="Все клубы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все клубы</SelectItem>
                  {clubOptions.map((club) => (
                    <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.bookId} onValueChange={(value) => setFilters((prev) => ({ ...prev, bookId: value, page: 1 }))}>
                <SelectTrigger><SelectValue placeholder="Все книги" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все книги</SelectItem>
                  {bookOptions.map((book) => (
                    <SelectItem key={book.id} value={book.id}>{book.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.readerId} onValueChange={(value) => setFilters((prev) => ({ ...prev, readerId: value, page: 1 }))}>
                <SelectTrigger><SelectValue placeholder="Все чтецы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все чтецы</SelectItem>
                  {readerOptions.map((reader) => (
                    <SelectItem key={reader.id} value={reader.id}>{reader.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.sort} onValueChange={(value: "desc" | "asc") => setFilters((prev) => ({ ...prev, sort: value, page: 1 }))}>
                <SelectTrigger><SelectValue placeholder="Сначала новые" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Сначала новые</SelectItem>
                  <SelectItem value="asc">Сначала старые</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    search: "",
                    clubId: "all",
                    bookId: "all",
                    readerId: "all",
                    sort: "desc",
                    page: 1,
                    limit: filters.limit,
                  })
                }
              >
                Сбросить все фильтры
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Headphones className="h-5 w-5" />
              Библиотека записей
            </CardTitle>
            <CardDescription>
              {pagination ? `Всего записей: ${pagination.total}` : "Загружаем список записей..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {content}

            {pagination && pagination.pages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Страница {pagination.page} из {pagination.pages}
                  {isFetching && !isLoading ? " • обновляем..." : ""}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1 || isFetching}
                  >
                    Назад
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.pages || isFetching}
                  >
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
