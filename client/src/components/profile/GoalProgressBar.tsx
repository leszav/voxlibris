interface GoalProgressBarProps {
  readonly progress: number;
  readonly goal: number;
  readonly percent: number;
}

export function GoalProgressBar({ progress, goal, percent }: GoalProgressBarProps) {
  const safePercent = Math.max(0, Math.min(100, percent));

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-primary">{progress}</span>
        <span className="mb-1 text-sm text-muted-foreground">/ {goal} книг</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${safePercent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{safePercent}% выполнено</p>
    </div>
  );
}
