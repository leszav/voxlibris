import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link } from 'wouter';
import { Headphones, BookOpen, Users, UserPlus, Trophy, Rss } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserContextMenu } from '@/components/social/UserContextMenu';
import type { FeedEvent } from '@/api/feed';
import { SessionStartedCard } from './SessionStartedCard';
import { ReadingCompletedCard } from './ReadingCompletedCard';
import { JoinedClubCard } from './JoinedClubCard';

interface ActivityEventCardProps {
  readonly event: FeedEvent;
}

type ActivityMetadata = Readonly<Record<string, unknown>>;

function getMetadataString(metadata: ActivityMetadata, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withQuotedMetadata(
  label: string,
  metadata: ActivityMetadata,
  key: string,
  prefix = ' ',
  suffix = '',
): string {
  const value = getMetadataString(metadata, key);
  return value ? `${label}${prefix}«${value}»${suffix}` : `${label}${suffix}`;
}

function getTargetLink(event: FeedEvent): string | null {
  if (!event.targetId) {
    return null;
  }

  if (event.targetType === 'session') {
    return `/sessions/${event.targetId}`;
  }

  if (event.targetType === 'club') {
    return `/clubs/${event.targetId}`;
  }

  return null;
}

const EVENT_META: Record<
  FeedEvent['eventType'],
  { icon: React.ElementType; color: string; label: (metadata: ActivityMetadata) => string }
> = {
  session_started: {
    icon: Headphones,
    color: 'text-emerald-500',
    label: (metadata) => withQuotedMetadata('начал эфир', metadata, 'bookTitle', ' — '),
  },
  session_ended: {
    icon: Headphones,
    color: 'text-slate-400',
    label: (metadata) => withQuotedMetadata('завершил сессию', metadata, 'sessionTitle'),
  },
  joined_club: {
    icon: Users,
    color: 'text-blue-500',
    label: (metadata) => withQuotedMetadata('вступил в клуб', metadata, 'clubName'),
  },
  left_club: {
    icon: Users,
    color: 'text-slate-400',
    label: (metadata) => withQuotedMetadata('покинул клуб', metadata, 'clubName'),
  },
  club_created: {
    icon: Users,
    color: 'text-violet-500',
    label: (metadata) => withQuotedMetadata('создал клуб', metadata, 'clubName'),
  },
  reading_completed: {
    icon: BookOpen,
    color: 'text-amber-500',
    label: (metadata) => withQuotedMetadata('дочитал', metadata, 'bookTitle'),
  },
  book_review_posted: {
    icon: BookOpen,
    color: 'text-orange-500',
    label: (metadata) => withQuotedMetadata('написал рецензию', metadata, 'bookTitle', ' на '),
  },
  achievement_unlocked: {
    icon: Trophy,
    color: 'text-yellow-500',
    label: (metadata) => withQuotedMetadata('получил бейдж', metadata, 'achievementName'),
  },
  club_session_scheduled: {
    icon: Rss,
    color: 'text-indigo-500',
    label: (metadata) => withQuotedMetadata('запланировал сессию', metadata, 'clubName', ' в '),
  },
  discussion_hot: {
    icon: Rss,
    color: 'text-red-500',
    label: () => 'горячее обсуждение',
  },
  followed_user: {
    icon: UserPlus,
    color: 'text-pink-500',
    label: () => 'подписался на нового чтеца',
  },
  book_added_to_club: {
    icon: BookOpen,
    color: 'text-teal-500',
    label: (metadata) => withQuotedMetadata('добавил книгу', metadata, 'bookTitle', ' ', ' в клуб'),
  },
};

export function ActivityEventCard({ event }: ActivityEventCardProps) {
  if (event.eventType === 'session_started') {
    return <SessionStartedCard event={event} />;
  }

  if (event.eventType === 'reading_completed') {
    return <ReadingCompletedCard event={event} />;
  }

  if (event.eventType === 'joined_club') {
    return <JoinedClubCard event={event} />;
  }

  const meta = EVENT_META[event.eventType];
  if (!meta) return null;

  const Icon = meta.icon;
  const { actor } = event;
  const metadata: ActivityMetadata = event.metadata ?? {};
  const timeAgo = formatDistanceToNow(new Date(event.createdAt), {
    addSuffix: true,
    locale: ru,
  });

  const targetLink = getTargetLink(event);
  const sessionTitle = getMetadataString(metadata, 'sessionTitle');
  const targetLabel = sessionTitle ?? 'Открыть';

  return (
    <div className="flex items-start gap-3 py-3 px-1 group">
      {/* Аватар актора */}
      <UserContextMenu user={actor} actions={["profile"]}>
        <Link href={`/users/${actor.id}`} className="flex-shrink-0">
          <Avatar className="h-10 w-10 cursor-pointer">
            {actor.avatar && <AvatarImage src={actor.avatar} alt={actor.username} />}
            <AvatarFallback className="text-sm font-medium">
              {actor.displayName?.[0]?.toUpperCase() ?? actor.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
      </UserContextMenu>

      {/* Контент */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <Link
            href={`/users/${actor.id}`}
            className="font-semibold hover:underline"
          >
            {actor.displayName ?? actor.username}
          </Link>
          {' '}
          <span className="text-muted-foreground">
            {meta.label(metadata)}
          </span>
        </p>

        {/* Ссылка на объект + статус live */}
        {targetLink && (
          <Link
            href={targetLink}
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
            {targetLabel}
          </Link>
        )}

        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo}</p>
      </div>

      {/* Иконка события */}
      <Icon className={`h-4 w-4 flex-shrink-0 mt-1 ${meta.color} opacity-70`} />
    </div>
  );
}
