import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StreakDisplay } from "@/components/gamification/StreakDisplay";
import type { ProfileGamificationResponse } from "@/types/gamification";

interface ReaderProfileTabProps {
  readonly readerRating: number;
  readonly totalReadingSessions: number;
  readonly totalListeners: number;
  readonly gamification?: ProfileGamificationResponse;
}

export function ReaderProfileTab({
  readerRating,
  totalReadingSessions,
  totalListeners,
  gamification,
}: ReaderProfileTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Профиль чтеца</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3 text-center">
            <div className="text-2xl font-bold text-primary">{(readerRating / 100).toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Рейтинг</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-center">
            <div className="text-2xl font-bold text-primary">{totalReadingSessions}</div>
            <p className="text-xs text-muted-foreground">Сессий</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-center">
            <div className="text-2xl font-bold text-primary">{totalListeners}</div>
            <p className="text-xs text-muted-foreground">Слушателей</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ритм чтения</CardTitle>
        </CardHeader>
        <CardContent>
          <StreakDisplay streak={gamification?.streak} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Недавние достижения</CardTitle>
        </CardHeader>
        <CardContent>
          {gamification?.achievements?.length ? (
            <div className="flex flex-wrap gap-2">
              {gamification.achievements.slice(0, 6).map((achievement) => (
                <Badge key={achievement.achievementId} variant="outline">
                  {achievement.titleRu}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Пока нет достижений</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
