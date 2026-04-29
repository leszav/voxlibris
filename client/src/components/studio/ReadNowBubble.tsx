import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReadNowBubbleProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  compact?: boolean;
}

/**
 * Плавающая кнопка «начать читать» для чтеца.
 * Вызывает onClick — клиент решает, открыть студию или навигировать.
 */
export function ReadNowBubble({
  onClick,
  className,
  disabled = false,
  title,
  compact = false,
}: Readonly<ReadNowBubbleProps>) {
  const [isIdle, setIsIdle] = useState(false);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const resetIdle = () => {
      setIsIdle(false);
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
      idleTimeoutRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 3000);
    };

    globalThis.addEventListener("mousemove", resetIdle);
    globalThis.addEventListener("keydown", resetIdle);
    globalThis.addEventListener("click", resetIdle);

    resetIdle();

    return () => {
      globalThis.removeEventListener("mousemove", resetIdle);
      globalThis.removeEventListener("keydown", resetIdle);
      globalThis.removeEventListener("click", resetIdle);
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "group relative flex h-12 w-12 items-center justify-center rounded-full border bg-card/95 text-amber-600 shadow-lg backdrop-blur-sm",
          "border-amber-200/80 hover:border-amber-300 hover:bg-card dark:border-amber-800 dark:text-amber-400",
          isIdle ? "opacity-40 hover:opacity-100" : "opacity-100",
          disabled && "cursor-not-allowed opacity-50 hover:border-amber-200/80 hover:bg-card",
          "active:scale-[0.99] transition-all duration-200 ease-out",
          className,
        )}
        title={title ?? "Начать читать вслух"}
        aria-label="Открыть студию чтеца"
      >
        <BookOpen className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex min-w-[220px] items-center gap-3 rounded-2xl border px-4 py-3 text-left",
        "bg-card/95 text-foreground shadow-lg backdrop-blur-sm",
        "border-amber-200/80 hover:border-amber-300 hover:bg-card",
        isIdle ? "opacity-30 hover:opacity-100" : "opacity-100",
        disabled && "cursor-not-allowed opacity-50 hover:border-amber-200/80 hover:bg-card",
        "active:scale-[0.99] transition-all duration-200 ease-out",
        className
      )}
      title={title ?? "Начать читать вслух"}
      aria-label="Открыть студию чтеца"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-500/10 text-amber-600 dark:border-amber-800 dark:text-amber-400">
        <BookOpen className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold">VoxLibris Studio</span>
        <span className="mt-1 block text-xs text-muted-foreground">Начать чтение вслух</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}
