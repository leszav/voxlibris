import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StudioMode } from "./LiveTopBar";

interface LiveShellProps {
  topBar: ReactNode;
  stage: ReactNode;
  controlBar: ReactNode;
  rightDock: (isOpen: boolean, onClose: () => void) => ReactNode;
  /** Controlled from outside only to allow "open chat" from ControlBar */
  defaultRightDockOpen?: boolean;
  mode: StudioMode;
}

export function LiveShell({
  topBar,
  stage,
  controlBar,
  rightDock,
  defaultRightDockOpen = true,
  mode,
}: Readonly<LiveShellProps>) {
  const [rightDockOpen, setRightDockOpen] = useState(defaultRightDockOpen);

  // In Focus mode the dock is always hidden
  const dockVisible = mode !== "focus" && rightDockOpen;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#F9F8F6] dark:bg-background">
      {/* Top bar */}
      {topBar}

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Compact sidebar placeholder — 72px icon strip */}
        <nav
          className="w-16 shrink-0 border-r border-border bg-card/80 flex flex-col items-center py-3 gap-2"
          aria-label="Боковая навигация Studio"
        >
          {/* Placeholder slots for future navigation icons */}
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <span className="text-amber-600 text-xs font-bold">VL</span>
          </div>
        </nav>

        {/* Stage area */}
        <div
          className={cn(
            "flex flex-1 overflow-hidden transition-all duration-220",
            mode === "control" && "max-w-[calc(100%-420px)]"
          )}
        >
          {stage}
        </div>

        {/* Right dock (Balanced + Control) */}
        {dockVisible && (
          <div
            className={cn(
              "shrink-0 overflow-hidden transition-all duration-220",
              mode === "control" ? "w-[420px]" : "w-80 xl:w-96"
            )}
          >
            {rightDock(dockVisible, () => setRightDockOpen(false))}
          </div>
        )}

        {/* Focus mode: show "open chat" hint when dock was closed */}
        {mode === "focus" && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20">
            {/* RightDock renders nothing when isOpen=false; handled in ControlBar chatOpen button */}
          </div>
        )}
      </div>

      {/* Floating control bar */}
      {controlBar}
    </div>
  );
}

export type { StudioMode } from "./LiveTopBar";
