import { Button } from '@/components/ui/button';
import { UserPlus, UserMinus } from 'lucide-react';
import { useFollowStatus, useFollowMutation } from '@/hooks/use-social';
import { cn } from '@/lib/utils';

interface FollowButtonProps {
  targetUserId: string;
  currentUserId?: string;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}

/**
 * Кнопка подписки/отписки с оптимистичным обновлением.
 * Скрывается, если targetUserId === currentUserId.
 */
export function FollowButton({
  targetUserId,
  currentUserId,
  className,
  size = 'sm',
}: Readonly<FollowButtonProps>) {
  const canFollow = Boolean(currentUserId && currentUserId !== targetUserId);
  const { data: status, isLoading: statusLoading } = useFollowStatus(targetUserId, canFollow);
  const { follow, unfollow } = useFollowMutation(targetUserId);

  if (!canFollow) return null;

  const isFollowing = status?.isFollowing ?? false;
  const isMutating = follow.isPending || unfollow.isPending;

  const handleClick = () => {
    if (isMutating) return;
    if (isFollowing) {
      unfollow.mutate(undefined);
    } else {
      follow.mutate(undefined);
    }
  };

  return (
    <Button
      size={size}
      variant={isFollowing ? 'outline' : 'default'}
      disabled={statusLoading || isMutating}
      onClick={handleClick}
      className={cn('gap-1.5', className)}
    >
      {isFollowing ? (
        <>
          <UserMinus className="h-4 w-4" />
          Отписаться
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" />
          Подписаться
        </>
      )}
    </Button>
  );
}
