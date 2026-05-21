import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link } from 'wouter';
import { Headphones } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { FeedEvent } from '@/api/feed';

interface SessionStartedCardProps {
  readonly event: FeedEvent;
}

function getMetadataString(metadata: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function SessionStartedCard({ event }: SessionStartedCardProps) {
  const { actor } = event;
  const metadata = event.metadata ?? {};
  const bookTitle = getMetadataString(metadata, 'bookTitle');
  const targetLink = event.targetType === 'session' && event.targetId ? `/sessions/${event.targetId}` : null;
  const timeAgo = formatDistanceToNow(new Date(event.createdAt), {
    addSuffix: true,
    locale: ru,
  });

  return (
    <div className="flex items-start gap-3 py-3 px-1 group">
      <Link href={`/profile/${actor.id}`} className="flex-shrink-0">
        <Avatar className="h-10 w-10 cursor-pointer">
          {actor.avatar && <AvatarImage src={actor.avatar} alt={actor.username} />}
          <AvatarFallback className="text-sm font-medium">
            {actor.displayName?.[0]?.toUpperCase() ?? actor.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <Link href={`/profile/${actor.id}`} className="font-semibold hover:underline">
            {actor.displayName ?? actor.username}
          </Link>{' '}
          <span className="text-muted-foreground">
            начал эфир{bookTitle ? ` - «${bookTitle}»` : ''}
          </span>
        </p>

        {targetLink && (
          <Link
            href={targetLink}
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Headphones className="h-3.5 w-3.5 text-emerald-500" />
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Слушать сейчас</span>
          </Link>
        )}

        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo}</p>
      </div>

      <Headphones className="h-4 w-4 flex-shrink-0 mt-1 text-emerald-500 opacity-70" />
    </div>
  );
}
