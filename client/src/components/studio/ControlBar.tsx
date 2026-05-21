import { useEffect, useState } from "react";
import { Mic, MicOff, Pause, Play, Square, Users, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudioWordmark } from "@/components/studio/StudioWordmark";
import { SessionListenerAvatars } from "@/components/presence/SessionListenerAvatars";

interface ControlBarProps {
  state: "prep" | "live" | "paused";
  isOnline: boolean;
  micMuted: boolean;
  onMicToggle: () => void;
  elapsedTime: number;
  listenerCount: number;
  sessionId?: string | null;
  /** RMS-уровень сигнала микрофона (0..100) */
  micLevel: number;
  /** 20-element array of VU bar heights (0..100) */
  micBars: ReadonlyArray<number>;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onOpenChat: () => void;
  chatUnread?: number;
  onBookmark?: () => void;
  onSettings: () => void;
  /**
   * Когда false — убирает fixed-позиционирование.
   * Используйте в контекстах, где панель должна быть частью layout-потока
   * (например, footer flex-колонки), а не float поверх контента.
   * По умолчанию true (классическое поведение).
   */
  floating?: boolean;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function levelToDb(level: number): number {
  if (level <= 0) return -60;
  return -60 + (Math.max(0, Math.min(100, level)) / 100) * 60;
}

const SILENCE_GATE = 7;
const SILENCE_SNAP = 2;

export function ControlBar({
  state,
  isOnline,
  micMuted,
  onMicToggle,
  elapsedTime,
  listenerCount,
  sessionId,
  micLevel,
  micBars,
  onPause,
  onResume,
  onEnd,
  onBookmark,
  floating = true,
}: Readonly<ControlBarProps>) {
  const [vuLevel, setVuLevel] = useState(0);
  const [vuPeak, setVuPeak] = useState(0);

  useEffect(() => {
    if (state === "prep" || micMuted) {
      setVuLevel(0);
      setVuPeak(0);
      return;
    }

    const barPeak = micBars.length > 0 ? Math.max(...micBars) : 0;
    const mixedLevel = Math.max(micLevel, barPeak * 0.35);
    const rawTarget = Math.max(0, Math.min(100, mixedLevel));
    // Шумовой порог: при тишине индикатор должен гаснуть до нуля.
    const target = rawTarget < SILENCE_GATE ? 0 : rawTarget;

    // Баллистика VU: быстрая атака, медленный спад.
    setVuLevel((prev) => {
      const attack = 0.42;
      const release = 0.16;
      const next = target > prev
        ? prev + (target - prev) * attack
        : prev + (target - prev) * release;
      const clamped = Math.max(0, Math.min(100, next));
      return target === 0 && clamped < SILENCE_SNAP ? 0 : clamped;
    });

    setVuPeak((prev) => {
      if (target > prev) return target;
      return Math.max(0, prev - 2.2);
    });
  }, [micBars, micLevel, micMuted, state]);

  if (state === "prep") return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-sm px-3 py-2",
        floating && "fixed bottom-6 left-1/2 -translate-x-1/2 z-30",
      )}
      role="toolbar"
      aria-label="Панель управления трансляцией"
    >
      {/* Логотип */}
      <div className="mr-1 shrink-0 border-r border-border pr-2">
        <StudioWordmark compact />
      </div>

      {/* Left group: mic + VU */}
      <div className="flex items-center gap-2 pr-3 border-r border-border">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 rounded-xl",
            micMuted
              ? "text-destructive bg-destructive/10 hover:bg-destructive/20 hover:text-destructive"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={onMicToggle}
          title={micMuted ? "Включить микрофон" : "Выключить микрофон"}
        >
          {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>

        <div className="flex flex-col gap-1.5 min-w-[130px]" aria-hidden>
          <div className="relative h-2.5 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full transition-[width] duration-75"
              style={{
                width: `${vuLevel}%`,
                background: "linear-gradient(90deg, rgb(16 185 129) 0%, rgb(16 185 129) 70%, rgb(245 158 11) 85%, rgb(239 68 68) 100%)",
                boxShadow: micMuted ? "none" : "0 0 10px rgba(16,185,129,0.25)",
              }}
            />
            <div
              className="absolute top-0 h-full w-[2px] bg-white/90"
              style={{ left: `calc(${vuPeak}% - 1px)` }}
            />
          </div>

          <span
            className={cn(
              "text-[10px] tabular-nums",
              micMuted ? "text-muted-foreground" : "text-emerald-500"
            )}
            title="Текущий уровень входного сигнала"
          >
            {micMuted ? "MIC OFF" : `MIC ${Math.round(vuLevel)}% • ${levelToDb(vuLevel).toFixed(1)} dB`}
          </span>
        </div>
      </div>

      {/* Center group: timer + session controls */}
      <div className="flex items-center gap-2 px-3 border-r border-border">
        <span className="tabular-nums text-sm font-medium text-amber-600 dark:text-amber-400 min-w-[52px] text-center">
          {formatElapsed(elapsedTime)}
        </span>

        {state === "live" && (
          <>
            <Button
              size="icon"
              className="h-9 w-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-none"
              onClick={onPause}
              title="Пауза"
            >
              <Pause className="w-4 h-4 fill-current" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={onEnd}
              title="Завершить эфир"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </Button>
          </>
        )}

        {state === "paused" && (
          <>
            <Button
              size="icon"
              className="h-9 w-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-none"
              onClick={onResume}
              title="Продолжить"
            >
              <Play className="w-4 h-4 fill-current ml-px" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={onEnd}
              title="Завершить эфир"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </Button>
          </>
        )}
      </div>

      {/* Right group: listeners */}
      <div className="flex items-center gap-1 pl-2">
        <span
          className={cn(
            "flex items-center gap-1 text-xs px-1",
            isOnline ? "text-emerald-500" : "text-destructive"
          )}
          title={isOnline ? "Соединение с сервером активно" : "Нет соединения с сервером"}
        >
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              isOnline ? "bg-emerald-500" : "bg-destructive"
            )}
          />
          {isOnline ? "Онлайн" : "Офлайн"}
        </span>

        {sessionId ? (
          <SessionListenerAvatars sessionId={sessionId} maxVisible={5} />
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground px-1">
            <Users className="w-3.5 h-3.5" />
            {listenerCount}
          </span>
        )}

        {onBookmark && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={onBookmark}
            title="Закладка"
          >
            <Bookmark className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
