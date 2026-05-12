import { Bell } from 'lucide-react';
import { useFeedUnseenCount } from '@/hooks/use-feed';

interface FeedUnseenBadgeProps {
  readonly className?: string;
}

export function FeedUnseenBadge({ className }: FeedUnseenBadgeProps) {
  const { data: count } = useFeedUnseenCount();

  return (
    <span className={`relative inline-flex items-center ${className ?? ''}`}>
      <Bell className="h-5 w-5" />
      {count != null && count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}
