import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface BookWithStatus {
  id: string;
  userId: string;
  bookId: string;
  bookType: 'personal' | 'club';
  status: 'reading' | 'completed' | 'planned' | 'abandoned';
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl?: string;
    format?: string;
  } | null;
}

interface BookshelfProps {
  readonly userId: string;
}

const bookshelfStatuses = [
  { id: "reading", label: "Читаю", color: "bg-blue-500" },
  { id: "completed", label: "Прочитано", color: "bg-green-500" },
  { id: "planned", label: "Хочу прочитать", color: "bg-yellow-500" },
  { id: "abandoned", label: "Брошено", color: "bg-gray-500" },
];

function parsePlannedYear(notes: string | null): number | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { plannedYear?: number };
    const year = parsed.plannedYear;
    return typeof year === "number" && year > 1900 ? year : null;
  } catch {
    return null;
  }
}

export function Bookshelf({ userId }: BookshelfProps) {
  const [activeStatus, setActiveStatus] = React.useState("reading");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: booksWithStatus = [], isLoading } = useQuery<BookWithStatus[]>({
    queryKey: ["reading-status", userId, activeStatus],
    queryFn: async () => {
      return apiRequest<BookWithStatus[]>(`/api/reading-status?status=${activeStatus}`);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ bookId, bookType, newStatus }: { bookId: string; bookType: string; newStatus: string }) => {
      return apiRequest('/api/reading-status', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          bookType,
          status: newStatus,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reading-status"] });
      queryClient.invalidateQueries({ queryKey: ["reading-stats"] });
      queryClient.invalidateQueries({ queryKey: ["reading-goal"] });
      toast({ title: "Статус обновлен" });
    },
    onError: () => {
      toast({
        title: "Ошибка при обновлении статуса",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Статусы */}
      <div className="flex flex-wrap gap-2">
        {bookshelfStatuses.map((status) => (
          <Button
            key={status.id}
            variant={activeStatus === status.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveStatus(status.id)}
            className="flex items-center gap-2"
          >
            <div className={`w-2 h-2 rounded-full ${status.color}`} />
            {status.label}
          </Button>
        ))}
      </div>

      {/* Книги */}
      {booksWithStatus.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {bookshelfStatuses.find(s => s.id === activeStatus)?.label}
            </h3>
            <p className="text-muted-foreground">
              {activeStatus === "reading" && "Сейчас ничего не читаете"}
              {activeStatus === "completed" && "Пока нет прочитанных книг"}
              {activeStatus === "planned" && "Нет книг в планах"}
              {activeStatus === "abandoned" && "Нет брошенных книг"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {booksWithStatus.map((item) => {
            const book = item.book;
            if (!book) return null;
            const plannedYear = item.status === 'planned' ? parsePlannedYear(item.notes) : null;
            
            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {book.coverUrl ? (
                      <img 
                        src={book.coverUrl} 
                        alt={book.title}
                        className="w-12 h-16 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-16 bg-muted rounded flex items-center justify-center">
                        <BookOpen className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{book.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {book.author}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {book.format && (
                          <Badge variant="secondary" className="text-xs">
                            {book.format}
                          </Badge>
                        )}
                        {item.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span className="text-xs">{item.rating}</span>
                          </div>
                        )}
                      </div>
                      {item.progress > 0 && item.status === 'reading' && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-primary h-1.5 rounded-full"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.progress}%</p>
                        </div>
                      )}
                      {plannedYear && item.status === 'planned' && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Хочу прочитать в {plannedYear} году
                        </p>
                      )}
                      
                      {/* Меню смены статуса */}
                      {item.status !== 'abandoned' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                              Изменить статус
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {bookshelfStatuses
                              .filter(s => s.id !== item.status)
                              .map((status) => (
                                <DropdownMenuItem
                                  key={status.id}
                                  onClick={() => updateStatusMutation.mutate({
                                    bookId: item.bookId,
                                    bookType: item.bookType,
                                    newStatus: status.id,
                                  })}
                                >
                                  <div className={`w-2 h-2 rounded-full ${status.color} mr-2`} />
                                  {status.label}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}