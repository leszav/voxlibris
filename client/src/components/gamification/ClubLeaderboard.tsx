import { useQuery } from "@tanstack/react-query";
import { Award, Loader2, Medal, Trophy } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ClubLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: "owner" | "moderator" | "member";
  readerRating: number;
  totalReadingSessions: number;
  totalListeners: number;
  score: number;
}

interface ClubLeaderboardResponse {
  club: {
    id: string;
    title: string;
  };
  leaderboard: ClubLeaderboardEntry[];
}

interface ClubLeaderboardProps {
  clubId: string;
  clubTitle: string;
}

function formatRole(role: ClubLeaderboardEntry["role"]): string {
  if (role === "owner") return "Владелец";
  if (role === "moderator") return "Модератор";
  return "Участник";
}

function rankIcon(rank: number) {
  if (rank === 1) {
    return <Trophy className="h-4 w-4 text-amber-500" />;
  }
  if (rank === 2) {
    return <Medal className="h-4 w-4 text-slate-400" />;
  }
  if (rank === 3) {
    return <Award className="h-4 w-4 text-orange-500" />;
  }
  return <span className="text-xs font-semibold text-muted-foreground">#{rank}</span>;
}

export function ClubLeaderboard({ clubId, clubTitle }: Readonly<ClubLeaderboardProps>) {
  const { data, isLoading, error } = useQuery<ClubLeaderboardResponse>({
    queryKey: ["club-leaderboard", clubId],
    queryFn: async () => {
      const response = await authFetch(`/api/clubs/${clubId}/leaderboard`, {
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Не удалось загрузить рейтинг клуба");
      }

      return response.json();
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Рейтинг клуба: {clubTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем рейтинг...
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Рейтинг недоступен"}
          </p>
        ) : null}

        {!isLoading && !error && (data?.leaderboard.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">В клубе пока нет участников для рейтинга.</p>
        ) : null}

        {(data?.leaderboard.length ?? 0) > 0 ? (
          <div className="space-y-3">
            {data?.leaderboard.map((entry) => (
              <div
                key={entry.userId}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center">{rankIcon(entry.rank)}</div>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={entry.avatar ?? ""} />
                    <AvatarFallback>{(entry.displayName || entry.username).slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{entry.displayName || entry.username}</div>
                    <div className="text-xs text-muted-foreground">{entry.totalReadingSessions} сессий • {entry.totalListeners} слушателей</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{formatRole(entry.role)}</Badge>
                  <Badge variant="secondary">{(entry.readerRating / 100).toFixed(1)}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
