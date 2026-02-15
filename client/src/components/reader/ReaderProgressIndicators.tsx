import { useCallback, useEffect, useRef, useState } from "react";
import { CompactSyncIndicator } from "./SyncIndicator";

interface ProgressSummary {
  progress?: number | null;
  currentChapter?: number | null;
}

interface ReaderProgressIndicatorsProps {
  isSyncing?: boolean;
  lastSyncTime?: number | null;
  error?: string | null;
  userProgress?: ProgressSummary | null;
  groupProgress?: ProgressSummary | null;
  groupLabel?: string;
  panelAriaLabel?: string;
}

function clampProgress(value: number | null | undefined): number {
  if (typeof value !== "number") return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeChapter(value: number | null | undefined): number {
  if (typeof value !== "number" || value < 1) return 1;
  return value;
}

function hasProgressEntry(entry: ProgressSummary | null | undefined): boolean {
  return !!entry && (typeof entry.progress === "number" || typeof entry.currentChapter === "number");
}

export function ReaderProgressIndicators({
  isSyncing = false,
  lastSyncTime,
  error,
  userProgress,
  groupProgress,
  groupLabel = "Клуб",
  panelAriaLabel = "Панель прогресса чтения",
}: Readonly<ReaderProgressIndicatorsProps>) {
  const [progressVisible, setProgressVisible] = useState(false);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelHoveredRef = useRef(false);

  const showUser = hasProgressEntry(userProgress);
  const showGroup = hasProgressEntry(groupProgress);
  const hasAnyProgress = showUser || showGroup;

  const clearHideTimeout = useCallback(() => {
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
      progressTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback((delayMs = 700) => {
    clearHideTimeout();
    progressTimeoutRef.current = setTimeout(() => {
      if (!panelHoveredRef.current) {
        setProgressVisible(false);
      }
    }, delayMs);
  }, [clearHideTimeout]);

  useEffect(() => {
    if (!hasAnyProgress) {
      setProgressVisible(false);
      clearHideTimeout();
      return;
    }

    const cornerSizePx = 96;
    const onMouseMove = (event: MouseEvent) => {
      const inBottomLeftCorner =
        event.clientX <= cornerSizePx &&
        event.clientY >= window.innerHeight - cornerSizePx;

      if (inBottomLeftCorner) {
        clearHideTimeout();
        setProgressVisible(true);
        return;
      }

      if (!panelHoveredRef.current) {
        scheduleHide(500);
      }
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      clearHideTimeout();
    };
  }, [hasAnyProgress, clearHideTimeout, scheduleHide]);

  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, [clearHideTimeout]);

  const userProgressPercent = clampProgress(userProgress?.progress);
  const userChapter = normalizeChapter(userProgress?.currentChapter);
  const groupProgressPercent = clampProgress(groupProgress?.progress);
  const groupChapter = normalizeChapter(groupProgress?.currentChapter);

  return (
    <>
      <CompactSyncIndicator
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime || undefined}
        error={error || undefined}
      />

      {hasAnyProgress && (
        <section
          className={`fixed left-4 bottom-4 bg-card/60 backdrop-blur-sm border rounded-lg shadow-lg transition-opacity duration-500 ${
            progressVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          style={{
            width: "280px",
            zIndex: 1000,
          }}
          onMouseEnter={() => {
            panelHoveredRef.current = true;
            setProgressVisible(true);
            clearHideTimeout();
          }}
          onMouseLeave={() => {
            panelHoveredRef.current = false;
            scheduleHide(300);
          }}
          aria-label={panelAriaLabel}
        >
          <div className="p-3 space-y-2">
            {showUser && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Вы</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-green-600">{userProgressPercent}%</span>
                    <span className="text-xs text-muted-foreground">Гл.{userChapter}</span>
                  </div>
                </div>
                <div className="bg-muted rounded-full h-1.5">
                  <div
                    className="bg-green-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${userProgressPercent}%` }}
                  />
                </div>
              </>
            )}

            {showGroup && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{groupLabel}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-600">{groupProgressPercent}%</span>
                    <span className="text-xs text-muted-foreground">Гл.{groupChapter}</span>
                  </div>
                </div>
                <div className="bg-muted rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${groupProgressPercent}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
