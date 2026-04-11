import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReadNowBubbleProps {
  onClick: () => void;
  className?: string;
}

/**
 * Плавающая кнопка «начать читать» для чтеца.
 * Вызывает onClick — клиент решает, открыть студию или навигировать.
 */
export function ReadNowBubble({
  onClick,
  className,
}: Readonly<ReadNowBubbleProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex items-center justify-center",
        "w-11 h-11 rounded-full",
        "bg-amber-500 hover:bg-amber-600 active:scale-95",
        "text-white shadow-lg shadow-amber-500/30",
        "transition-all duration-200 ease-out",
        className
      )}
      title="Начать читать вслух"
      aria-label="Открыть студию чтеца"
    >
      <Mic className="w-5 h-5 shrink-0" />
      {/* Мягкий пульс-ореол */}
      <span className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping opacity-60 group-hover:opacity-0 transition-opacity" />
    </button>
  );
}
