import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const THEMES = {
  sepia:  { name: "Сепия",      text: "#43434F", bg: "#FAF8F2" },
  light:  { name: "Светлая",    text: "#121212", bg: "#FFFFFF" },
  brown:  { name: "Коричневая", text: "#6C4130", bg: "#F5EFDD" },
  dark:   { name: "Тёмная",     text: "#FFFFFF", bg: "#121212" },
  green:  { name: "Зелёная",    text: "#B5F8B8", bg: "#0F1C10" },
} as const;

export type ThemeKey = keyof typeof THEMES;

export const FONTS: ReadonlyArray<{ id: string; name: string; family: string }> = [
  { id: "lora",              name: "Lora",             family: '"Lora", serif' },
  { id: "georgia",           name: "Georgia",          family: "Georgia, serif" },
  { id: "merriweather",      name: "Merriweather",     family: '"Merriweather", serif' },
  { id: "crimson",           name: "Crimson Text",     family: '"Crimson Text", serif' },
  { id: "pt-serif",          name: "PT Serif",         family: '"PT Serif", serif' },
  { id: "roboto-slab",       name: "Roboto Slab",      family: '"Roboto Slab", serif' },
  { id: "playfair",          name: "Playfair Display", family: '"Playfair Display", serif' },
  { id: "libre-baskerville", name: "Libre Baskerville",family: '"Libre Baskerville", serif' },
];

interface ChapterData {
  chapter: {
    title: string;
    content: string;
  };
}

interface ReadingStageProps {
  // Chapter data
  chapterData: ChapterData | null | undefined;
  chapterLoading: boolean;
  currentChapter: number;
  // Upload mode
  uploadMode: boolean;
  contentText: string;
  onContentTextChange: (text: string) => void;
  onUpload: () => void;
  onCancelUpload: () => void;
  onDeleteContent: () => void;
  deleteIsPending: boolean;
  createIsPending: boolean;
  onOpenUpload: () => void;
  // Text appearance
  fontSize: number; // px
  currentTheme: ThemeKey;
  fontFamily: string;
  // Optional overlay slots (modals, banners)
  overlays?: ReactNode;
}

export function ReadingStage({
  chapterData,
  chapterLoading,
  currentChapter,
  uploadMode,
  contentText,
  onContentTextChange,
  onUpload,
  onCancelUpload,
  onDeleteContent,
  deleteIsPending,
  createIsPending,
  onOpenUpload,
  fontSize,
  currentTheme,
  fontFamily,
  overlays,
}: Readonly<ReadingStageProps>) {
  const theme = THEMES[currentTheme];

  const renderContent = () => {
    if (uploadMode) {
      return (
        <div className="space-y-6 max-w-3xl mx-auto w-full px-8 py-10">
          <div className="flex items-center justify-between">
            <h1 className="font-serif font-bold text-3xl text-foreground">Добавить контент</h1>
            <Button variant="outline" size="sm" onClick={onCancelUpload}>
              Отмена
            </Button>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground mb-2 block">
                Текст главы {currentChapter}
              </span>
              <textarea
                value={contentText}
                onChange={(e) => onContentTextChange(e.target.value)}
                className="w-full h-96 bg-muted border border-border rounded-lg p-4 text-foreground resize-none font-mono text-sm"
                placeholder="Вставьте текст главы здесь..."
              />
            </label>
            <Button
              onClick={onUpload}
              disabled={!contentText.trim() || createIsPending}
              className="bg-amber-500 hover:bg-amber-600 text-white border-none"
            >
              {createIsPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      );
    }

    if (chapterLoading) {
      return (
        <div className="max-w-3xl mx-auto w-full px-8 py-10 space-y-4 animate-pulse">
          {[80, 95, 70, 90, 65].map((w) => (
            <div key={w} className="h-5 bg-muted rounded" style={{ width: `${w}%` }} />
          ))}
          <p className="text-muted-foreground text-sm pt-4">Подготавливаем главу…</p>
        </div>
      );
    }

    if (chapterData?.chapter) {
      const paragraphs = chapterData.chapter.content
        .split("\n")
        .filter((t) => t.trim())
        .map((text, idx) => ({ id: `p-${idx}`, text }));

      return (
        <div
          className="max-w-3xl mx-auto w-full rounded-2xl px-10 py-12 shadow-sm"
          style={{
            fontSize: `${fontSize}px`,
            color: theme.text,
            backgroundColor: theme.bg,
            fontFamily,
            lineHeight: "1.8",
          }}
        >
          <div className="flex items-start justify-between mb-10">
            <h1
              className="font-serif font-bold text-4xl leading-tight"
              style={{ color: theme.text }}
            >
              {chapterData.chapter.title}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteContent}
              disabled={deleteIsPending}
              className={cn(
                "shrink-0 ml-4 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
              )}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {paragraphs.map((p) => (
            <p key={p.id} className="mb-6">
              {p.text}
            </p>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
        <p className="text-muted-foreground mb-4 text-lg">Глава {currentChapter} ещё не добавлена</p>
        <Button onClick={onOpenUpload} className="bg-amber-500 hover:bg-amber-600 text-white border-none gap-2">
          <Upload className="w-4 h-4" />
          Добавить контент
        </Button>
      </div>
    );
  };

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden bg-[#F9F8F6] dark:bg-background">
      {overlays}
      <ScrollArea className="flex-1">
        <div className="py-8 pb-32">
          {renderContent()}
        </div>
      </ScrollArea>
    </div>
  );
}
