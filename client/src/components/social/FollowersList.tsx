import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useFollowers, useFollowing } from '@/hooks/use-social';
import { FollowButton } from './FollowButton';

const FOLLOWERS_LIST_SKELETON_ROWS = [
  'followers-skeleton-1',
  'followers-skeleton-2',
  'followers-skeleton-3',
  'followers-skeleton-4',
  'followers-skeleton-5',
] as const;

interface FollowersListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentUserId?: string;
  mode: 'followers' | 'following';
}

/**
 * Модальный список подписчиков или подписок.
 */
export function FollowersList({
  open,
  onOpenChange,
  userId,
  currentUserId,
  mode,
}: Readonly<FollowersListProps>) {
  const followersQuery = useFollowers(userId, open && mode === 'followers');
  const followingQuery = useFollowing(userId, open && mode === 'following');

  const query = mode === 'followers' ? followersQuery : followingQuery;
  const title = mode === 'followers' ? 'Подписчики' : 'Подписки';
  const users = query.data?.users ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {query.isLoading && (
            <>
              {FOLLOWERS_LIST_SKELETON_ROWS.map((rowId) => (
                <div key={rowId} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </>
          )}

          {!query.isLoading && users.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {mode === 'followers' ? 'Нет подписчиков' : 'Нет подписок'}
            </p>
          )}

          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {user.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
                <AvatarFallback>
                  {(user.displayName ?? user.username).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{user.displayName ?? user.username}</p>
                <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
              </div>

              <FollowButton
                targetUserId={user.id}
                currentUserId={currentUserId}
                size="sm"
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
