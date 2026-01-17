import { BookOpen, AudioLines, Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  variant?: "default" | "waves" | "microphone" | "minimal";
}

/**
 * Логотип VoxLibris с несколькими вариантами отображения
 * 
 * Варианты:
 * - default: Книга с аудио-волнами внутри (основной)
 * - waves: Книга с волнами звука (альтернативный)
 * - microphone: Микрофон и книга (для студии чтеца)
 * - minimal: Минималистичная книга (компактный вариант)
 */
export function Logo({ className, iconClassName, variant = "default" }: LogoProps) {
  if (variant === "waves") {
    return (
      <div className={cn("relative flex items-center justify-center", className)}>
        <BookOpen className={cn("w-full h-full text-primary", iconClassName)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Volume2 className={cn("w-1/2 h-1/2 text-accent", iconClassName)} />
        </div>
      </div>
    );
  }

  if (variant === "microphone") {
    return (
      <div className={cn("relative flex items-center justify-center", className)}>
        <BookOpen className={cn("w-full h-full text-primary", iconClassName)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Mic className={cn("w-1/2 h-1/2 text-accent", iconClassName)} />
        </div>
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <BookOpen className={cn("w-full h-full text-primary", iconClassName)} />
      </div>
    );
  }

  // default variant
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <BookOpen className={cn("w-full h-full text-primary", iconClassName)} />
      <div className="absolute inset-0 flex items-center justify-center">
        <AudioLines className={cn("w-1/2 h-1/2 text-accent", iconClassName)} />
      </div>
    </div>
  );
}
