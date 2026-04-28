import { useEffect, useRef, useState } from "react";
import { Radio, Play, Square, Users, Headphones } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LiveReader } from "@/hooks/use-live-readers";

function getActiveReaderActionMeta(isListening: boolean, isPending: boolean): {
  statusLabel: string;
  statusClassName: string;
  actionTitle: string;
} {
  if (isPending && isListening) {
    return {
      statusLabel: "Отключаемся...",
      statusClassName: "text-amber-600 dark:text-amber-300",
      actionTitle: "Отключаемся от эфира",
    };
  }

  if (isPending) {
    return {
      statusLabel: "Подключаемся...",
      statusClassName: "text-amber-600 dark:text-amber-300",
      actionTitle: "Подключаемся к эфиру",
    };
  }

  if (isListening) {
    return {
      statusLabel: "Вы слушаете этот эфир",
      statusClassName: "text-emerald-600 dark:text-emerald-300",
      actionTitle: "Отключиться от эфира",
    };
  }

  return {
    statusLabel: "Можно подключиться к эфиру",
    statusClassName: "text-muted-foreground",
    actionTitle: "Слушать",
  };
}

// ── LiveReadersBubble ─────────────────────────────────────────────────────

interface LiveReadersBubbleProps {
  readers: LiveReader[];
  flashCount: number;
  onOpenModal: () => void;
  className?: string;
}

function getLiveReadersBubbleMeta(isActive: boolean, flashing: boolean, readersCount: number): {
  containerStateClassName: string;
  iconClassName: string;
  statusTextClassName: string;
  availabilityLabel: string;
  readersLabel: string;
} {
  const activeToneClassName = flashing
    ? "border-cyan-300 bg-cyan-50 text-cyan-950 shadow-cyan-500/20 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-50"
    : "border-cyan-200/90 bg-cyan-50/70 hover:border-fuchsia-300 hover:bg-fuchsia-50/70 dark:border-cyan-900 dark:bg-cyan-950/20 dark:hover:border-fuchsia-800 dark:hover:bg-fuchsia-950/30";

  if (!isActive) {
    return {
      containerStateClassName: "cursor-default border-border/80 text-muted-foreground shadow-md",
      iconClassName: "border-border bg-muted/60 text-muted-foreground",
      statusTextClassName: "text-muted-foreground",
      availabilityLabel: "Сейчас тихо",
      readersLabel: "Нет активных чтений",
    };
  }

  const readersSuffix = readersCount === 1 ? "чтец в эфире" : "чтеца в эфире";

  return {
    containerStateClassName: activeToneClassName,
    iconClassName: "border-cyan-300 bg-cyan-500/15 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    statusTextClassName: "text-cyan-700 dark:text-cyan-300",
    availabilityLabel: "Эфир доступен",
    readersLabel: `${readersCount} ${readersSuffix}`,
  };
}

/**
 * Компактная live-card для активных чтецов в клубном ридере.
 * Сохраняет прежние действия, но визуально ближе к status pill,
 * чем к декоративному floating bubble.
 */
export function LiveReadersBubble({
  readers,
  flashCount,
  onOpenModal,
  className,
}: Readonly<LiveReadersBubbleProps>) {
  const [flashing, setFlashing] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const prevFlashCount = useRef(flashCount);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isActive = readers.length > 0;
  const {
    containerStateClassName,
    iconClassName,
    statusTextClassName,
    availabilityLabel,
    readersLabel,
  } = getLiveReadersBubbleMeta(isActive, flashing, readers.length);

  // Вспышка при новом чтеце
  useEffect(() => {
    if (flashCount > prevFlashCount.current) {
      setFlashing(true);
      prevFlashCount.current = flashCount;
      const t = setTimeout(() => setFlashing(false), 1800);
      return () => clearTimeout(t);
    }
  }, [flashCount]);

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

  return (
    <button
      type="button"
      onClick={isActive ? onOpenModal : undefined}
      className={cn(
        "relative flex min-w-[220px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200",
        "bg-card/95 shadow-lg backdrop-blur-sm",
        isIdle ? "opacity-30 hover:opacity-100" : "opacity-100",
        containerStateClassName,
        className
      )}
      title={isActive ? `Читают вслух: ${readers.length}` : "Никто не читает вслух"}
      aria-label={isActive ? `${readers.length} активных чтецов` : "Нет активных чтецов"}
    >
      <span
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-300",
          iconClassName
        )}
      >
        <Radio className={cn("h-4.5 w-4.5 transition-all duration-300", isActive && "animate-pulse text-fuchsia-600 dark:text-fuchsia-300", flashing && "scale-110")} />
        {isActive ? (
          <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-500/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-fuchsia-500" />
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-2 text-xs", statusTextClassName)}>
          <Users className="h-3.5 w-3.5" />
          {availabilityLabel}
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
          {readersLabel}
        </span>
      </span>

      {isActive ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300/70 bg-fuchsia-500/10 px-2.5 py-1 text-xs font-medium text-fuchsia-700 dark:border-fuchsia-800 dark:text-fuchsia-300">
          <Headphones className="h-3.5 w-3.5" />
          Открыть
        </span>
      ) : null}

      {flashing && (
        <span className="pointer-events-none absolute inset-0 rounded-2xl border border-fuchsia-300/70" />
      )}
    </button>
  );
}

// ── ActiveReadersModal ────────────────────────────────────────────────────

interface ActiveReadersModalProps {
  open: boolean;
  onClose: () => void;
  readers: LiveReader[];
  listeningToSessionId: string | null;
  onPlay: (reader: LiveReader) => Promise<void> | void;
  onStop: () => Promise<void> | void;
}

/**
 * Модалка со списком активных чтецов.
 */
export function ActiveReadersModal({
  open,
  onClose,
  readers,
  listeningToSessionId,
  onPlay,
  onStop,
}: Readonly<ActiveReadersModalProps>) {
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const handlePlay = async (reader: LiveReader) => {
    if (pendingSessionId) return;

    setPendingSessionId(reader.sessionId);
    try {
      await onPlay(reader);
      onClose();
    } finally {
      setPendingSessionId(null);
    }
  };

  const handleStop = async (sessionId: string) => {
    if (pendingSessionId) return;

    setPendingSessionId(sessionId);
    try {
      await onStop();
      onClose();
    } finally {
      setPendingSessionId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-500" />
            Читают сейчас
          </DialogTitle>
        </DialogHeader>

        {readers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Никто не читает вслух прямо сейчас
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Выберите эфир, к которому хотите подключиться. Если вы уже слушаете одного из чтецов,
              его карточка будет отмечена отдельно.
            </p>

            <ul className="space-y-2">
            {readers.map((reader) => {
              const isListening = listeningToSessionId === reader.sessionId;
              const isPending = pendingSessionId === reader.sessionId;
              const actionMeta = getActiveReaderActionMeta(isListening, isPending);

              return (
                <li
                  key={reader.sessionId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                    isListening
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border bg-muted/30",
                  )}
                >
                  {/* Аватар-заглушка */}
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 font-bold text-sm shrink-0">
                    {reader.readerName[0]?.toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{reader.readerName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                        <Radio className="w-2.5 h-2.5" />
                        <span>В эфире</span>
                      </Badge>
                      {isListening && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          Слушаете
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        Гл. {reader.chapter}
                      </span>
                    </div>
                    <p className={cn("mt-1 text-[11px]", actionMeta.statusClassName)}>
                      {actionMeta.statusLabel}
                    </p>
                  </div>

                  {/* Кнопка play/stop */}
                  {isListening ? (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8 rounded-full shrink-0"
                      onClick={() => void handleStop(reader.sessionId)}
                      disabled={isPending}
                      title={actionMeta.actionTitle}
                    >
                      {isPending ? (
                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        <Square className="w-3 h-3 fill-current" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white border-none shrink-0"
                      onClick={() => void handlePlay(reader)}
                      disabled={isPending}
                      title={actionMeta.actionTitle}
                    >
                      {isPending ? (
                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 fill-current ml-px" />
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
