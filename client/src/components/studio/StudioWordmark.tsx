import { cn } from "@/lib/utils";

interface StudioWordmarkProps {
  className?: string;
  compact?: boolean;
}

export function StudioWordmark({ className, compact = false }: Readonly<StudioWordmarkProps>) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label="VoxLibris Studio">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-[10px] font-semibold tracking-[0.14em] text-amber-700 dark:text-amber-300">
        VS
      </span>
      <span className="min-w-0 leading-none">
        {compact ? (
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/90">
            VoxLibris Studio
          </span>
        ) : (
          <>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/90">
              VoxLibris Studio
            </span>
            <span className="mt-0.5 block text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Reader Broadcast Console
            </span>
          </>
        )}
      </span>
    </div>
  );
}
