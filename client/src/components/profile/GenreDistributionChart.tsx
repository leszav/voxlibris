import { Badge } from "@/components/ui/badge";

interface GenreDistributionChartProps {
  readonly items: Array<{ genre: string; count: number }>;
}

export function GenreDistributionChart({ items }: GenreDistributionChartProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Недостаточно данных для распределения жанров</p>;
  }

  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.genre} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline">{item.genre}</Badge>
            <span className="text-xs text-muted-foreground">{item.count}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary/80"
              style={{ width: `${Math.round((item.count / maxCount) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
