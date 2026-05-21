import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FollowButton } from '@/components/social/FollowButton';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';

export interface UserCardData {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  isReader: boolean;
  followersCount: number;
  isFollowing?: boolean;
}

interface UserCardProps {
  readonly user: UserCardData;
}

/**
 * Карточка пользователя для страниц поиска и обнаружения.
 * Кликабельна — ведёт на /profile/:id.
 * Содержит FollowButton для быстрой подписки.
 */
export function UserCard({ user }: UserCardProps) {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => setLocation(`/profile/${user.id}`)}
    >
      <CardContent className="p-4 flex items-start gap-3">
        <Avatar className="h-12 w-12 flex-shrink-0">
          {user.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
          <AvatarFallback>
            {(user.displayName ?? user.username).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">
              {user.displayName ?? user.username}
            </span>
            {user.isReader && (
              <Badge variant="secondary" className="text-xs shrink-0">
                🎙️ Чтец
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">@{user.username}</p>
          {user.bio && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{user.bio}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {user.followersCount} подписчиков
          </p>
        </div>

        {/* Останавливаем всплытие клика чтобы не переходить на профиль при нажатии на кнопку */}
        <div
          role="none"
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <FollowButton
            targetUserId={user.id}
            currentUserId={currentUser?.id}
            size="sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
