import { Loader2 } from "lucide-react";
import { AchievementBadge } from "@/components/gamification/AchievementBadge";
import type { ProfileAchievement } from "@/types/gamification";

interface AchievementsGridProps {
  achievements: ProfileAchievement[];
  isLoading?: boolean;
}

export function AchievementsGrid({ achievements, isLoading = false }: Readonly<AchievementsGridProps>) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загружаем достижения...
      </div>
    );
  }

  if (achievements.length === 0) {
    return <p className="text-sm text-muted-foreground">Пока нет выданных достижений.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {achievements.map((achievement) => (
        <AchievementBadge key={achievement.achievementId} achievement={achievement} />
      ))}
    </div>
  );
}
