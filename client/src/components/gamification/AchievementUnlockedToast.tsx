import type React from "react";
import { Sparkles } from "lucide-react";
import type { ProfileAchievement } from "@/types/gamification";

interface AchievementUnlockedToastProps {
  achievement: ProfileAchievement;
}

interface ToastLike {
  title?: React.ReactNode;
  description?: React.ReactNode;
}

type ToastDispatcher = (payload: ToastLike) => void;

export function AchievementUnlockedToast({ achievement }: Readonly<AchievementUnlockedToastProps>) {
  return (
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-amber-500" />
      <span>Новое достижение: {achievement.titleRu}</span>
    </div>
  );
}

export function showAchievementUnlockedToast(
  toast: ToastDispatcher,
  achievement: ProfileAchievement,
): void {
  toast({
    title: <AchievementUnlockedToast achievement={achievement} />,
    description: "Откройте профиль, чтобы посмотреть полный список наград.",
  });
}
