import { BookOpen, Loader2, Users } from "lucide-react";
import type { ClubWithDetails } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ProfileClubsContentProps {
  clubsLoading: boolean;
  clubs: ClubWithDetails[];
  isOwnProfile: boolean;
  currentUserId: string | null;
  setLocation: (path: string) => void;
}

export function ProfileClubsContent({
  clubsLoading,
  clubs,
  isOwnProfile,
  currentUserId,
  setLocation,
}: Readonly<ProfileClubsContentProps>) {
  if (clubsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          {isOwnProfile
            ? "Вы пока не состоите в клубах"
            : "Пользователь не состоит в клубах"}
        </p>
        {isOwnProfile ? (
          <Button
            variant="outline"
            onClick={() => setLocation("/catalog")}
            className="mt-4"
          >
            Найти клубы
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {clubs.map((club) => (
        <Card
          key={club.id}
          className="hover:shadow-md transition-all cursor-pointer border-2 hover:border-primary/50"
          onClick={() => setLocation(`/clubs/${club.id}`)}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-lg">{club.title}</h3>
                  {club.owner?.id === currentUserId ? (
                    <Badge variant="default" className="text-xs">
                      Создатель
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {club.description}
            </p>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {club.memberCount}
              </span>
              {club.book ? (
                <span className="flex items-center gap-1 flex-1 truncate">
                  <BookOpen className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{club.book.title}</span>
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
