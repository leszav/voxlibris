import { useQuery } from "@tanstack/react-query";
import { BookOpen, Flame, Loader2, Target, Users } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StreakDisplay } from "@/components/gamification/StreakDisplay";
import { GoalProgressBar } from "@/components/profile/GoalProgressBar";
import { GenreDistributionChart } from "@/components/profile/GenreDistributionChart";
import type { ProfileStreakSummary } from "@/types/gamification";

type ReaderStatsResponse = {
  success: boolean;
  stats: {
    totalBooks: number;
    completedBooks: number;
    currentlyReading: number;
    plannedBooks: number;
    abandonedBooks: number;
    readingSessions: number;
    totalListeners: number;
    readerRating: number;
    followersCount: number;
    followingCount: number;
    yearlyGoal: {
      year: number;
      goalBooks: number;
      progress: number;
      percentComplete: number;
    };
    genreDistribution: Array<{ genre: string; count: number }>;
  };
};

interface ReadingStatsPanelProps {
  readonly userId: string;
  readonly streak?: ProfileStreakSummary;
}

export function ReadingStatsPanel({ userId, streak }: ReadingStatsPanelProps) {
  const { data, isLoading, error } = useQuery<ReaderStatsResponse>({
    queryKey: ["user-profile-stats", userId],
    queryFn: async () => {
      const response = await authFetch(`/api/users/${userId}/stats`);
      if (!response.ok) {
        throw new Error("Failed to load profile stats");
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Статистика профиля недоступна
      </div>
    );
  }

  const stats = data.stats;
  const percent = Math.max(0, Math.min(100, stats.yearlyGoal.percentComplete));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Прочитано</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.completedBooks}</span>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Читаю сейчас</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.currentlyReading}</span>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Сессий</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.readingSessions}</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Рейтинг чтеца</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{stats.readerRating.toFixed(1)}</span>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Цель на {stats.yearlyGoal.year} год</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <GoalProgressBar
            progress={stats.yearlyGoal.progress}
            goal={stats.yearlyGoal.goalBooks}
            percent={percent}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Серия чтения</CardTitle>
        </CardHeader>
        <CardContent>
          <StreakDisplay streak={streak} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Жанровые предпочтения</CardTitle>
        </CardHeader>
        <CardContent>
          <GenreDistributionChart items={stats.genreDistribution} />
        </CardContent>
      </Card>
    </div>
  );
}
