import { useFollowers, useFollowing } from '@/hooks/use-social';

interface SocialStatsProps {
  userId: string;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
}

/**
 * Компонент отображения счётчиков: «X подписчиков · X подписок».
 * При клике вызывает колбэки (открытие модального списка).
 */
export function SocialStats({
  userId,
  onFollowersClick,
  onFollowingClick,
}: Readonly<SocialStatsProps>) {
  const { data: followers } = useFollowers(userId);
  const { data: following } = useFollowing(userId);

  const followersCount = followers?.users?.length ?? 0;
  const followingCount = following?.users?.length ?? 0;

  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <button
        type="button"
        onClick={onFollowersClick}
        className="hover:text-foreground transition-colors cursor-pointer"
      >
        <span className="font-semibold text-foreground">{followersCount}</span>{' '}
        {followersCount === 1 ? 'подписчик' : 'подписчиков'}
      </button>
      <button
        type="button"
        onClick={onFollowingClick}
        className="hover:text-foreground transition-colors cursor-pointer"
      >
        <span className="font-semibold text-foreground">{followingCount}</span> подписок
      </button>
    </div>
  );
}
