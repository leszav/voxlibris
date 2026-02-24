import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HeatmapPoint {
  day: number;
  hour: number;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapPoint[];
  period: string;
}

interface HeatmapCellDetails {
  period: string;
  day: number;
  hour: number;
  totalEvents: number;
  eventsByType: Array<{
    eventType: string;
    count: number;
    percentage: number;
  }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    userId: string | null;
    username: string | null;
    bookId: string | null;
    bookTitle: string | null;
    chapterNumber: number | null;
    duration: number | null;
    progress: number | null;
  }>;
}

const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const dayLabelsLong = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

const hours = Array.from({ length: 24 }, (_, index) => index);

const eventTypeLabels: Record<string, string> = {
  book_open: 'Открытие книги',
  chapter_start: 'Начало главы',
  chapter_complete: 'Завершение главы',
  reading_session: 'Сессия чтения',
  bookmark_create: 'Создание закладки',
  note_create: 'Создание заметки',
  book_complete: 'Завершение книги',
  club_join: 'Вступление в клуб',
  club_leave: 'Выход из клуба',
  book_upload: 'Загрузка книги',
};

function getHeatColor(count: number, maxCount: number) {
  if (count <= 0 || maxCount <= 0) {
    return 'rgba(148, 163, 184, 0.18)';
  }
  const ratio = Math.min(count / maxCount, 1);
  const alpha = 0.2 + ratio * 0.75;
  return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
}

function formatHourRange(hour: number) {
  const value = hour.toString().padStart(2, '0');
  return `${value}:00 - ${value}:59`;
}

function formatEventType(eventType: string) {
  return eventTypeLabels[eventType] || eventType;
}

export function ActivityHeatmap({ data, period }: ActivityHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapPoint | null>(null);
  const [selectedCell, setSelectedCell] = useState<HeatmapPoint | null>(null);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const point of data) {
      map.set(`${point.day}-${point.hour}`, point.count);
    }
    return map;
  }, [data]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const point of data) {
      if (point.count > max) {
        max = point.count;
      }
    }
    return max;
  }, [data]);

  const totalEvents = useMemo(() => data.reduce((acc, point) => acc + point.count, 0), [data]);

  const {
    data: cellDetails,
    isLoading: isCellDetailsLoading,
  } = useQuery<HeatmapCellDetails>({
    queryKey: ['/api/v1/analytics/heatmap/details', period, selectedCell?.day, selectedCell?.hour],
    queryFn: async () => {
      if (!selectedCell) {
        throw new Error('Heatmap cell is not selected');
      }
      return apiRequest<HeatmapCellDetails>(
        `/api/v1/analytics/heatmap/details?period=${period}&day=${selectedCell.day}&hour=${selectedCell.hour}`
      );
    },
    enabled: Boolean(selectedCell && selectedCell.count > 0),
  });

  const isDetailsModalOpen = Boolean(selectedCell && selectedCell.count > 0);

  if (data.length === 0 || maxCount === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Нет данных для построения heatmap за выбранный период.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            Наведите на ячейку, клик по активной ячейке откроет детали событий.
          </div>
          <div className="rounded-md border px-3 py-1.5">
            {hoveredCell
              ? `${dayLabelsLong[hoveredCell.day]}, ${hoveredCell.hour.toString().padStart(2, '0')}:00 — ${hoveredCell.count.toLocaleString()} событий`
              : `Всего событий в heatmap: ${totalEvents.toLocaleString()}`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-20 text-left text-xs font-medium text-muted-foreground">День/час</th>
                {hours.map((hour) => (
                  <th
                    key={hour}
                    className="h-7 w-7 px-0 text-center text-[10px] font-medium text-muted-foreground"
                  >
                    {hour.toString().padStart(2, '0')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayLabels.map((dayLabel, day) => (
                <tr key={dayLabel}>
                  <th className="pr-2 text-left text-xs font-medium text-muted-foreground">{dayLabel}</th>
                  {hours.map((hour) => {
                    const count = cellMap.get(`${day}-${hour}`) ?? 0;
                    const isActiveCell = count > 0;
                    const bgColor = getHeatColor(count, maxCount);
                    const textClass = count > maxCount * 0.55 ? 'text-white' : 'text-foreground/80';
                    return (
                      <td key={`${day}-${hour}`}>
                        <button
                          type="button"
                          className={`h-7 w-7 rounded-sm border border-border/40 text-[10px] leading-none transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${textClass} ${isActiveCell ? 'cursor-pointer hover:scale-105 hover:border-primary/60' : 'cursor-default'}`}
                          style={{ backgroundColor: bgColor }}
                          onClick={() => {
                            if (isActiveCell) {
                              setSelectedCell({ day, hour, count });
                            }
                          }}
                          onMouseEnter={() => setHoveredCell({ day, hour, count })}
                          onFocus={() => setHoveredCell({ day, hour, count })}
                          onMouseLeave={() => {
                            setHoveredCell((current) =>
                              current?.day === day && current?.hour === hour ? null : current
                            );
                          }}
                          onBlur={() => {
                            setHoveredCell((current) =>
                              current?.day === day && current?.hour === hour ? null : current
                            );
                          }}
                          aria-label={`${dayLabelsLong[day]}, ${hour
                            .toString()
                            .padStart(2, '0')}:00, ${count} событий`}
                        >
                          {count > 0 && count < 100 ? count : count >= 100 ? '99+' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Меньше</span>
          <div className="flex items-center gap-1">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const count = Math.round(maxCount * ratio);
              return (
                <span
                  key={ratio}
                  className="h-3 w-6 rounded-sm border border-border/40"
                  style={{ backgroundColor: getHeatColor(count, maxCount) }}
                />
              );
            })}
          </div>
          <span>Больше</span>
        </div>
      </div>

      <Dialog
        open={isDetailsModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCell(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Детализация ячейки heatmap
            </DialogTitle>
            <DialogDescription>
              {selectedCell
                ? `${dayLabelsLong[selectedCell.day]}, ${formatHourRange(selectedCell.hour)}`
                : 'Выберите ячейку'}
            </DialogDescription>
          </DialogHeader>

          {isCellDetailsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">Всего событий</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {cellDetails?.totalEvents.toLocaleString() || 0}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Распределение по типам событий</h4>
                {cellDetails?.eventsByType.length ? (
                  <div className="space-y-2">
                    {cellDetails.eventsByType.map((item) => (
                      <div key={item.eventType} className="flex items-center justify-between rounded-md border p-2">
                        <div className="text-sm">{formatEventType(item.eventType)}</div>
                        <div className="text-sm font-medium tabular-nums">
                          {item.count.toLocaleString()} ({item.percentage}%)
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Нет данных</div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Последние события в этой ячейке</h4>
                <ScrollArea className="h-[320px] pr-2">
                  <div className="space-y-2">
                    {cellDetails?.recentEvents.length ? (
                      cellDetails.recentEvents.map((event) => {
                        const details: string[] = [];
                        if (event.username) details.push(`Пользователь: ${event.username}`);
                        if (event.bookTitle) details.push(`Книга: ${event.bookTitle}`);
                        if (event.chapterNumber !== null) details.push(`Глава: ${event.chapterNumber}`);
                        if (event.progress !== null) details.push(`Прогресс: ${event.progress}%`);
                        if (event.duration !== null) details.push(`Длительность: ${event.duration}с`);

                        return (
                          <div key={event.id} className="rounded-md border p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium">{formatEventType(event.eventType)}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(event.createdAt).toLocaleString('ru-RU')}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {details.length ? details.join(' • ') : 'Без дополнительных данных'}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-muted-foreground">Нет событий для отображения</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
