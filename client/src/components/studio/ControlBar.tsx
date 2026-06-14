import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, HelpCircle, Mic, MicOff, Play, Square, Users, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StudioWordmark } from "@/components/studio/StudioWordmark";
import { SessionListenerAvatars } from "@/components/presence/SessionListenerAvatars";
import type { LiveSessionQuestion, LiveSessionReaction } from "@/hooks/use-audio-session";

interface ControlBarProps {
  state: "prep" | "live" | "paused";
  isOnline: boolean;
  micMuted: boolean;
  onMicToggle: () => void;
  elapsedTime: number;
  listenerCount: number;
  recentReactions?: LiveSessionReaction[];
  reactionCount?: number;
  sessionQuestions?: LiveSessionQuestion[];
  unansweredQuestionCount?: number;
  onQuestionAnswered?: (questionId: string) => Promise<void>;
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

function LiveReactionDock({ reactions, reactionCount }: Readonly<{ reactions: LiveSessionReaction[]; reactionCount: number }>) {
  const [hidden, setHidden] = useState(false);
  const latestReaction = reactions.at(-1);
  const floatingReactions = useMemo(() => reactions.slice(-4), [reactions]);

  return (
    <div className="relative flex items-center gap-1 border-r border-border px-2">
      <style>{`
        @keyframes voxlibris-reader-reaction-float {
          0% { opacity: 0; transform: translate(-50%, 8px) scale(0.72); }
          15% { opacity: 1; transform: translate(-50%, -4px) scale(1.04); }
          100% { opacity: 0; transform: translate(-50%, -34px) scale(1.2); }
        }
      `}</style>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
        onClick={() => setHidden((value) => !value)}
        title={hidden ? 'Показать реакции слушателей' : 'Скрыть реакции слушателей'}
      >
        {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>

      {!hidden && (
        <div className="relative flex h-9 min-w-10 items-center justify-center rounded-xl bg-muted/40 px-2" title="Реакции слушателей">
          {floatingReactions.map((reaction) => (
            <span
              key={reaction.id}
              className="pointer-events-none absolute left-1/2 text-2xl drop-shadow-md"
              style={{ animation: 'voxlibris-reader-reaction-float 1.2s ease-out forwards' }}
              aria-hidden="true"
            >
              {reaction.emoji}
            </span>
          ))}
          <span className="text-lg leading-none" aria-hidden="true">{latestReaction?.emoji ?? '♡'}</span>
          <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{reactionCount}</span>
        </div>
      )}
    </div>
  );
}

function formatQuestionTime(createdAt?: string | Date | null): string {
  if (!createdAt) return 'только что';

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'только что';

  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function LiveQuestionDock({
  questions,
  unansweredQuestionCount,
  onQuestionAnswered,
}: Readonly<{
  questions: LiveSessionQuestion[];
  unansweredQuestionCount: number;
  onQuestionAnswered?: (questionId: string) => Promise<void>;
}>) {
  const [open, setOpen] = useState(false);
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const hasUnanswered = unansweredQuestionCount > 0;
  const orderedQuestions = useMemo(() => (
    [...questions].sort((left, right) => Number(left.isAnswered) - Number(right.isAnswered))
  ), [questions]);

  const handleMarkAnswered = async (questionId: string) => {
    if (!onQuestionAnswered || answeringQuestionId) return;

    setAnsweringQuestionId(questionId);
    try {
      await onQuestionAnswered(questionId);
    } finally {
      setAnsweringQuestionId(null);
    }
  };

  return (
    <div className="border-r border-border px-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground",
            hasUnanswered && "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30 animate-pulse hover:bg-amber-500/15 hover:text-amber-700",
          )}
          onClick={() => setOpen(true)}
          title={hasUnanswered ? `Неотвеченные вопросы: ${unansweredQuestionCount}` : 'Вопросы слушателей'}
          aria-label={hasUnanswered ? `Открыть неотвеченные вопросы слушателей: ${unansweredQuestionCount}` : 'Открыть вопросы слушателей'}
        >
          <HelpCircle className="h-4 w-4" />
          {hasUnanswered && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold tabular-nums text-white shadow-sm">
              {unansweredQuestionCount > 99 ? '99+' : unansweredQuestionCount}
            </span>
          )}
        </Button>

        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Вопросы слушателей</DialogTitle>
            <DialogDescription>
              Ответьте устно во время эфира и отметьте вопрос галочкой — счётчик неотвеченных уменьшится.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {orderedQuestions.length > 0 ? orderedQuestions.map((item) => (
              <article
                key={item.id}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  item.isAnswered ? "border-border bg-muted/20 opacity-70" : "border-amber-500/25 bg-amber-500/5",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Слушатель</span>
                  <time dateTime={item.createdAt ? new Date(item.createdAt).toISOString() : undefined}>
                    {formatQuestionTime(item.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.question}</p>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant={item.isAnswered ? "secondary" : "outline"}
                    className="rounded-xl"
                    disabled={item.isAnswered || answeringQuestionId === item.id || !onQuestionAnswered}
                    onClick={() => void handleMarkAnswered(item.id)}
                  >
                    <Check className="mr-2 h-3.5 w-3.5" />
                    {item.isAnswered ? 'Отвечено' : 'Отметить отвеченным'}
                  </Button>
                </div>
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Пока нет вопросов от слушателей.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ControlBar({
  state,
  isOnline,
  micMuted,
  onMicToggle,
  elapsedTime,
  listenerCount,
  recentReactions = [],
  reactionCount = recentReactions.length,
  sessionQuestions = [],
  unansweredQuestionCount = 0,
  onQuestionAnswered,
  sessionId,
  micLevel,
  micBars,
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

      <LiveReactionDock reactions={recentReactions} reactionCount={reactionCount} />

      <LiveQuestionDock
        questions={sessionQuestions}
        unansweredQuestionCount={unansweredQuestionCount}
        onQuestionAnswered={onQuestionAnswered}
      />

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
