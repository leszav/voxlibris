import { BookmarkPlus, X } from "lucide-react";
import { Button } from "../ui/button";

interface SelectionBookmarkPromptProps {
  text: string;
  top: number;
  left: number;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function SelectionBookmarkPrompt({
  text,
  top,
  left,
  onConfirm,
  onDismiss,
}: Readonly<SelectionBookmarkPromptProps>) {
  return (
    <div
      className="fixed z-[70] -translate-x-1/2"
      style={{ top, left }}
      data-reader-selection-prompt="true"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="max-w-[min(90vw,24rem)] rounded-lg border bg-background/95 shadow-lg backdrop-blur px-3 py-2">
        <p className="text-xs text-muted-foreground line-clamp-2 break-words mb-2">
          {text}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onConfirm}>
            <BookmarkPlus className="w-4 h-4 mr-2" />
            Добавить в закладки
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
