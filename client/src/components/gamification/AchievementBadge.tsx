import { Award, Star, Trophy } from "lucide-react";
import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import { Badge } from "@/components/ui/badge";
import type { ProfileAchievement } from "@/types/gamification";

interface AchievementBadgeProps {
  achievement: ProfileAchievement;
}

function AchievementIcon({ iconType }: Readonly<{ iconType: ProfileAchievement["iconType"] }>) {
  if (iconType === "star") {
    return <Star className="h-3.5 w-3.5 text-amber-500" />;
  }

  if (iconType === "title") {
    return <Award className="h-3.5 w-3.5 text-indigo-500" />;
  }

  return <Trophy className="h-3.5 w-3.5 text-emerald-500" />;
}

export function AchievementBadge({ achievement }: Readonly<AchievementBadgeProps>) {
  return (
    <Badge variant="secondary" className="max-w-full gap-2 px-2.5 py-1.5">
      {achievement.badgeImageUrl ? (
        <AchievementImagePreview
          src={achievement.badgeImageUrl}
          alt={achievement.titleRu}
          triggerClassName="h-4 w-4"
          imageClassName="rounded"
        />
      ) : (
        <AchievementIcon iconType={achievement.iconType} />
      )}
      <span className="truncate">{achievement.titleRu}</span>
    </Badge>
  );
}
