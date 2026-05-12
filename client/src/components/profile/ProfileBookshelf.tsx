import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Star } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type BookshelfItem = {
  id: string;
  bookId: string;
  bookType: "personal" | "club";
  reviewText: string | null;
  rating: number | null;
  displayOrder: number;
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl: string | null;
  } | null;
};

type BookshelfResponse = {
  success: boolean;
  items: BookshelfItem[];
};

interface ProfileBookshelfProps {
  readonly userId: string;
}

export function ProfileBookshelf({ userId }: ProfileBookshelfProps) {
  const { data, isLoading, error } = useQuery<BookshelfResponse>({
    queryKey: ["profile-bookshelf", userId],
    queryFn: async () => {
      const response = await authFetch(`/api/users/${userId}/bookshelf`);
      if (!response.ok) {
        throw new Error("Failed to load profile bookshelf");
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Полка профиля недоступна
        </CardContent>
      </Card>
    );
  }

  if (data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Полка профиля</CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Пока нет добавленных книг
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Полка профиля</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex gap-3">
                {item.book?.coverUrl ? (
                  <img src={item.book.coverUrl} alt={item.book.title} className="h-16 w-12 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-12 items-center justify-center rounded bg-muted">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.book?.title ?? "Книга недоступна"}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.book?.author ?? ""}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary">{item.bookType === "club" ? "Клубная" : "Личная"}</Badge>
                    {item.rating ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {item.rating}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {item.reviewText ? <p className="mt-3 text-sm text-muted-foreground">{item.reviewText}</p> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
