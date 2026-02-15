import { useState } from "react";
import type { Bookmark } from "@shared/schema";
import { useAddBookmark, useDeleteBookmark } from "../../hooks/use-reader";
import { modalConfirm } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Trash2, Plus, BookmarkPlus, Navigation } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface BookmarksPanelProps {
  bookId: string;
  bookmarks: Bookmark[];
  onNavigateToBookmark?: (bookmark: Bookmark) => void;
}

export function BookmarksPanel({ bookId, bookmarks, onNavigateToBookmark }: BookmarksPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { mutate: addBookmark, isPending: isAddingBookmark } = useAddBookmark(bookId);
  const { mutate: deleteBookmark } = useDeleteBookmark(bookId);

  const handleAdd = () => {
    if (!newTitle.trim()) return;

    // Получаем текущую позицию (в реальности - из ContentRenderer через контекст)
    const currentPosition = JSON.stringify({
      scrollTop: 0,
      // В реальном приложении здесь будет актуальная позиция
    });

    addBookmark(
      {
        position: currentPosition,
        title: newTitle,
        chapterNumber: 1, // TODO: получать из контекста
      },
      {
        onSuccess: () => {
          setNewTitle("");
          setIsAdding(false);
        },
      }
    );
  };

  const handleDelete = async (bookmarkId: string) => {
    const confirmed = await modalConfirm({
      title: "Удалить закладку?",
      description: "Это действие необратимо.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });

    if (confirmed) {
      deleteBookmark(bookmarkId);
    }
  };

  const handleNavigate = (bookmark: Bookmark) => {
    if (onNavigateToBookmark) {
      onNavigateToBookmark(bookmark);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Закладки</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
        >
          {isAdding ? "Отмена" : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {/* Форма добавления */}
      {isAdding && (
        <div className="space-y-2 p-3 border rounded-lg bg-muted/50">
          <Input
            placeholder="Название закладки"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            autoFocus
          />
          <Button
            onClick={handleAdd}
            disabled={isAddingBookmark || !newTitle.trim()}
            className="w-full"
            size="sm"
          >
            <BookmarkPlus className="w-4 h-4 mr-2" />
            Добавить закладку
          </Button>
        </div>
      )}

      {/* Список закладок */}
      <div className="space-y-2">
        {bookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Закладок пока нет
          </p>
        ) : (
          bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-sm mb-1 cursor-pointer hover:text-primary transition-colors" 
                      onClick={() => handleNavigate(bookmark)}>
                    {bookmark.title || "Без названия"}
                  </h4>
                  {bookmark.chapterNumber && (
                    <p className="text-xs text-muted-foreground">
                      Глава {bookmark.chapterNumber}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(bookmark.createdAt), {
                      addSuffix: true,
                      locale: ru,
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleNavigate(bookmark)}
                    title="Перейти к закладке"
                  >
                    <Navigation className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDelete(bookmark.id)}
                    title="Удалить закладку"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
