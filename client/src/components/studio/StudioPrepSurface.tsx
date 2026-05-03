import { Button } from "@/components/ui/button";
import { Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudioPrepSurfaceProps {
  variant: "modal" | "bar";
  open?: boolean;
  statusText: string;
  startButtonLabel: string;
  startDisabled: boolean;
  streamStartError: string | null;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  onStart: () => void;
  onOpenMicCheck: () => void;
  onRetryDetection: () => void;
  onClose?: () => void;
}

function PrepStatus({
  statusText,
  streamStartError,
  microphoneAvailable,
  microphoneLoading,
  onRetryDetection,
  compact,
}: Readonly<{
  statusText: string;
  streamStartError: string | null;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  onRetryDetection: () => void;
  compact?: boolean;
}>) {
  const textClass = compact ? "text-xs" : "text-sm";

  if (streamStartError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
        <p className={cn(textClass, "text-destructive")}>{streamStartError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p
        className={cn(
          textClass,
          microphoneLoading ? "text-amber-500" : "text-muted-foreground",
        )}
      >
        {microphoneLoading ? "Проверяем доступ к микрофону..." : statusText}
      </p>
      {!microphoneLoading && !microphoneAvailable && (
        <Button variant="outline" size="sm" onClick={onRetryDetection}>
          Повторить проверку
        </Button>
      )}
    </div>
  );
}

export function StudioPrepSurface({
  variant,
  open = true,
  statusText,
  startButtonLabel,
  startDisabled,
  streamStartError,
  microphoneAvailable,
  microphoneLoading,
  onStart,
  onOpenMicCheck,
  onRetryDetection,
  onClose,
}: Readonly<StudioPrepSurfaceProps>) {
  if (!open) {
    return null;
  }

  if (variant === "bar") {
    return (
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
          <PrepStatus
            statusText={statusText}
            streamStartError={streamStartError}
            microphoneAvailable={microphoneAvailable}
            microphoneLoading={microphoneLoading}
            onRetryDetection={onRetryDetection}
            compact
          />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              className="bg-amber-500 text-xs text-white hover:bg-amber-600 border-none h-8"
              disabled={startDisabled}
              onClick={onStart}
            >
              {startButtonLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={onOpenMicCheck}
              title="Проверить микрофон"
            >
              Проверить
            </Button>
            {onClose && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-8"
                onClick={onClose}
              >
                Выйти
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-background/60 p-4 backdrop-blur-sm sm:p-6">
      <div className="relative w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl sm:p-8">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500">
          <Mic className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-serif font-bold text-foreground">Готовы к эфиру?</h2>
          <PrepStatus
            statusText={statusText}
            streamStartError={streamStartError}
            microphoneAvailable={microphoneAvailable}
            microphoneLoading={microphoneLoading}
            onRetryDetection={onRetryDetection}
          />
        </div>
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full bg-amber-500 hover:bg-amber-600 text-white border-none h-12 text-lg"
            onClick={onStart}
            disabled={startDisabled}
          >
            {startButtonLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onOpenMicCheck}
          >
            Проверить микрофон
          </Button>
        </div>
      </div>
    </div>
  );
}
