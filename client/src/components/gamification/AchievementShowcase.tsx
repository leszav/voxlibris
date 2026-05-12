import { Trophy } from "lucide-react";
import { AchievementsGrid } from "@/components/gamification/AchievementsGrid";
import { StreakDisplay } from "@/components/gamification/StreakDisplay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileGamificationResponse } from "@/types/gamification";

interface AchievementShowcaseProps {
  gamification?: ProfileGamificationResponse;
  isLoading?: boolean;
  isError?: boolean;
}

export function AchievementShowcase({ gamification, isLoading = false, isError = false }: Readonly<AchievementShowcaseProps>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Достижения и серия чтения
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <p className="text-sm text-destructive">
            Не удалось загрузить достижения. Обновите страницу.
          </p>
        )}
        <StreakDisplay streak={gamification?.streak} />
        <AchievementsGrid achievements={gamification?.achievements ?? []} isLoading={isLoading} />
      </CardContent>
    </Card>
  );
}
