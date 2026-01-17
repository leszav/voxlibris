import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Plus } from "lucide-react";

interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  format: string;
}

interface BookshelfProps {
  userId: string;
}

const bookshelfStatuses = [
  { id: "reading", label: "Читаю", color: "bg-blue-500" },
  { id: "completed", label: "Прочитано", color: "bg-green-500" },
  { id: "planned", label: "Хочу прочитать", color: "bg-yellow-500" },
  { id: "abandoned", label: "Брошено", color: "bg-gray-500" },
];

export function Bookshelf({ userId }: BookshelfProps) {
  const [activeStatus, setActiveStatus] = React.useState("reading");
  
  const { data: books = [], isLoading } = useQuery<Book[]>({
    queryKey: ["user-books", userId, activeStatus],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${userId}/books?status=${activeStatus}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) return [];
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
      {books.length === 0 ? (
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
          {books.map((book) => (
            <Card key={book.id} className="hover:shadow-md transition-shadow">
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
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {book.format}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}