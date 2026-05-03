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
  bookId?: string;
  bookmarks: Bookmark[];
  onNavigateToBookmark?: (bookmark: Bookmark) => void;
  onCreateBookmark?: (input: {
    chapterNumber?: number;
    position: string;
    title?: string;
  }) => void;
  onDeleteBookmark?: (bookmarkId: string) => void;
  isCreatingBookmark?: boolean;
  getCurrentBookmarkDraft?: () => {
    chapterNumber?: number;
    position: string;
  } | null;
}

export function BookmarksPanel({
  bookId,
  bookmarks,
  onNavigateToBookmark,
  onCreateBookmark,
  onDeleteBookmark,
  isCreatingBookmark = false,
  getCurrentBookmarkDraft,
}: Readonly<BookmarksPanelProps>) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const safeBookId = bookId || "";

  const { mutate: addBookmark, isPending: isAddingBookmarkFallback } = useAddBookmark(safeBookId);
  const { mutate: deleteBookmark } = useDeleteBookmark(safeBookId);
  const isAddingBookmark = onCreateBookmark ? isCreatingBookmark : isAddingBookmarkFallback;
  const canCreateBookmarks = typeof onCreateBookmark === "function" || !!bookId;
  const canDeleteBookmarks = typeof onDeleteBookmark === "function" || !!bookId;

  const handleAdd = () => {
    if (!newTitle.trim() || !canCreateBookmarks) return;

    const currentBookmarkDraft = getCurrentBookmarkDraft?.() ?? {
      chapterNumber: 1,
      position: JSON.stringify({ scrollTop: 0 }),
    };

    if (!currentBookmarkDraft) {
      return;
    }

    const payload = {
      title: newTitle,
      chapterNumber: currentBookmarkDraft.chapterNumber,
      position: currentBookmarkDraft.position,
    };

    if (onCreateBookmark) {
      onCreateBookmark(payload);
      setNewTitle("");
      setIsAdding(false);
      return;
    }

    addBookmark(payload, {
      onSuccess: () => {
        setNewTitle("");
        setIsAdding(false);
      },
    });
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
      if (onDeleteBookmark) {
        onDeleteBookmark(bookmarkId);
        return;
      }
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
        {canCreateBookmarks && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
          >
            {isAdding ? "Отмена" : <Plus className="w-4 h-4" />}
          </Button>
        )}
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
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start p-0 font-medium text-sm mb-1 hover:text-primary transition-colors whitespace-normal text-left"
                    onClick={() => handleNavigate(bookmark)}
                  >
                    <span className="line-clamp-2 break-words">
                      {bookmark.title || "Без названия"}
                    </span>
                  </Button>
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
                  {canDeleteBookmarks && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(bookmark.id)}
                      title="Удалить закладку"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
