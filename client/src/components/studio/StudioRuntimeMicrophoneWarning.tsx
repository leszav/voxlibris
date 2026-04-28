import { Button } from "@/components/ui/button";
import { resolveStudioRuntimeMicCheckActionVisible } from "@/lib/studio-prep-view";
import { cn } from "@/lib/utils";

interface StudioRuntimeMicrophoneWarningProps {
  state: "prep" | "live" | "paused";
  runtimeMicrophoneWarning: string | null;
  microphoneAvailable: boolean;
  onRetryDetection: () => void;
  onOpenMicCheck: () => void;
  floating?: boolean;
}

export function StudioRuntimeMicrophoneWarning({
  state,
  runtimeMicrophoneWarning,
  microphoneAvailable,
  onRetryDetection,
  onOpenMicCheck,
  floating = true,
}: Readonly<StudioRuntimeMicrophoneWarningProps>) {
  const showMicCheckAction = resolveStudioRuntimeMicCheckActionVisible({
    state,
    microphoneAvailable,
  });

  if (!runtimeMicrophoneWarning) {
    return null;
  }

  return (
    <div
      className={cn(
        floating
          ? "absolute top-4 left-4 right-4 z-40 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 backdrop-blur-sm"
          : "shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-3",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-destructive">Проблема с микрофоном</p>
          <p className="text-sm text-destructive/90">{runtimeMicrophoneWarning}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRetryDetection}>
            Обновить статус
          </Button>
          {showMicCheckAction && (
            <Button size="sm" variant="destructive" onClick={onOpenMicCheck}>
              Перепроверить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
