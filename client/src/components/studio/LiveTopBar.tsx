import { Wifi, WifiOff, Radio, BookOpen, ChevronRight, Bookmark, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";import studioLogo from '/vlstudio-logo.webp';
export type NetworkQuality = "good" | "fair" | "poor" | "offline";

interface LiveTopBarProps {
  bookTitle: string;
  chapterTitle: string;
  isLive: boolean;
  isRecording: boolean;
  recordingTime: number; // секунды
  networkQuality: NetworkQuality;
  onBookmark: () => void;
  onTextSettings: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function networkQualityColor(quality: NetworkQuality): string {
  if (quality === "good") return "text-emerald-600 dark:text-emerald-400";
  if (quality === "fair") return "text-amber-500";
  return "text-destructive";
}

function networkQualityLabel(quality: NetworkQuality): string {
  if (quality === "good") return "Сеть стабильна";
  if (quality === "fair") return "Сеть нестабильна";
  return "Проблемы с сетью";
}

function NetworkIndicator({ quality }: Readonly<{ quality: NetworkQuality }>) {
  if (quality === "offline") {
    return (
      <span className="flex items-center gap-1 text-destructive text-xs">
        <WifiOff className="w-3.5 h-3.5" />
        Нет сети
      </span>
    );
  }
  return (
    <span className={cn("flex items-center gap-1 text-xs", networkQualityColor(quality))}>
      <Wifi className="w-3.5 h-3.5" />
      {networkQualityLabel(quality)}
    </span>
  );
}

export function LiveTopBar({
  bookTitle,
  chapterTitle,
  isLive,
  isRecording,
  recordingTime,
  networkQuality,
  onBookmark,
  onTextSettings,
}: Readonly<LiveTopBarProps>) {
  return (
    <header className="h-12 shrink-0 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 gap-4 z-20">
      {/* Логотип */}
      <img src={studioLogo} alt="VL Studio" className="h-6 w-auto shrink-0 opacity-90" />
      <Separator orientation="vertical" className="h-5 shrink-0" />
      {/* Левая зона: книга + глава */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm text-foreground truncate max-w-[180px]">
          {bookTitle}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground truncate max-w-[140px]">
          {chapterTitle}
        </span>
      </div>

      {/* Центральная зона: статусы */}
      <div className="flex items-center gap-3 shrink-0">
        {isLive && (
          <Badge
            variant="outline"
            className="gap-1.5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 text-xs font-bold tracking-wide animate-pulse"
          >
            <Radio className="w-3 h-3" />
            В ЭФИРЕ
          </Badge>
        )}

        {isRecording && (
          <span className="flex items-center gap-1.5 text-xs text-destructive font-medium">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            REC {formatTime(recordingTime)}
          </span>
        )}

        <Separator orientation="vertical" className="h-4" />
        <NetworkIndicator quality={networkQuality} />
      </div>

      {/* Правая зона: действия */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onBookmark} title="Закладка">
          <Bookmark className="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onTextSettings} title="Настройки текста">
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
