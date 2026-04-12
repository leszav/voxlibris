import type { ReactNode } from "react";

interface LiveShellProps {
  topBar: ReactNode;
  stage: ReactNode;
  controlBar: ReactNode;
}

export function LiveShell({
  topBar,
  stage,
  controlBar,
}: Readonly<LiveShellProps>) {
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
        <div className="flex flex-1 overflow-hidden transition-all duration-220">
          {stage}
        </div>
      </div>

      {/* Floating control bar */}
      {controlBar}
    </div>
  );
}
