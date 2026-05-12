import { Flame } from "lucide-react";
import type { ProfileStreakSummary } from "@/types/gamification";

interface StreakDisplayProps {
  streak?: ProfileStreakSummary;
}

export function StreakDisplay({ streak }: Readonly<StreakDisplayProps>) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Flame className="h-4 w-4" />
          Текущая серия
        </div>
        <div className="mt-1 text-2xl font-bold text-primary">
          {streak?.currentStreakDays ?? 0} дн.
        </div>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="text-sm text-muted-foreground">Лучшая серия</div>
        <div className="mt-1 text-2xl font-bold text-primary">
          {streak?.bestStreakDays ?? 0} дн.
        </div>
      </div>
    </div>
  );
}
