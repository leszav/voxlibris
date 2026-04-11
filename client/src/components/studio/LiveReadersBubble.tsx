import { useEffect, useRef, useState } from "react";
import { Radio, Play, Square, Star } from "lucide-react";
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

// ── LiveReadersBubble ─────────────────────────────────────────────────────

interface LiveReadersBubbleProps {
  readers: LiveReader[];
  flashCount: number; // увеличивается при каждом новом чтеце
  onOpenModal: () => void;
  className?: string;
}

/**
 * Пузырь «живые чтецы» — появляется когда кто-то читает.
 * При каждом новом подключении «вспыхивает», затем угасает.
 */
export function LiveReadersBubble({
  readers,
  flashCount,
  onOpenModal,
  className,
}: Readonly<LiveReadersBubbleProps>) {
  const [flashing, setFlashing] = useState(false);
  const prevFlashCount = useRef(flashCount);

  // Запускаем вспышку при каждом новом чтеце
  useEffect(() => {
    if (flashCount > prevFlashCount.current) {
      setFlashing(true);
      prevFlashCount.current = flashCount;
      const t = setTimeout(() => setFlashing(false), 1800);
      return () => clearTimeout(t);
    }
  }, [flashCount]);

  if (readers.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpenModal}
      className={cn(
        "relative flex items-center gap-2 rounded-full transition-all duration-300",
        "px-3.5 py-2.5 text-sm font-medium",
        "shadow-lg",
        flashing
          ? "bg-emerald-500 text-white shadow-emerald-400/40 scale-110"
          : "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 shadow-emerald-500/10 hover:bg-emerald-600/25",
        className
      )}
      title="Сейчас читают вслух"
      aria-label={`${readers.length} активных чтецов`}
    >
      {/* Иконка звуковой волны */}
      <span className="relative flex items-center">
        <Radio className={cn("w-4 h-4 shrink-0", flashing && "animate-pulse")} />
      </span>
      <span className={cn(
        "tabular-nums font-bold transition-all duration-300",
        flashing ? "text-white" : ""
      )}>
        {readers.length}
      </span>
      {/* Ореол при вспышке */}
      {flashing && (
        <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
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
  onPlay: (reader: LiveReader) => void;
  onStop: () => void;
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
          <ul className="space-y-2">
            {readers.map((reader) => {
              const isListening = listeningToSessionId === reader.sessionId;
              return (
                <li
                  key={reader.sessionId}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 bg-muted/30"
                >
                  {/* Аватар-заглушка */}
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-600 font-bold text-sm shrink-0">
                    {reader.readerName[0]?.toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{reader.readerName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5 border-amber-500/40 text-amber-600">
                        <Star className="w-2.5 h-2.5" />
                        <span>–</span>
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        Гл. {reader.chapter}
                      </span>
                    </div>
                  </div>

                  {/* Кнопка play/stop */}
                  {isListening ? (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8 rounded-full shrink-0"
                      onClick={() => { onStop(); onClose(); }}
                      title="Остановить прослушивание"
                    >
                      <Square className="w-3 h-3 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white border-none shrink-0"
                      onClick={() => { onPlay(reader); onClose(); }}
                      title="Слушать"
                    >
                      <Play className="w-3 h-3 fill-current ml-px" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
