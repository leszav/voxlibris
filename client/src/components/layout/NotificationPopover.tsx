import { Bell, MessageCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { useBellItems, useMarkNotificationsRead } from '@/hooks/use-notifications';

interface NotificationPopoverProps {
  messagesUnread: number;
  notificationsUnread: number;
  totalUnread: number;
}

export function NotificationPopover({ messagesUnread, notificationsUnread, totalUnread }: Readonly<NotificationPopoverProps>) {
  const [, setLocation] = useLocation();
  const { data: bellData } = useBellItems(true);
  const markReadMutation = useMarkNotificationsRead();

  const items = bellData?.items ?? [];
  const unreadTotal = bellData?.totalUnread ?? totalUnread;

  const handleOpenItem = (actionUrl: string, kind: string) => {
    if (kind !== 'dm_message') {
      markReadMutation.mutate(kind);
    }
    setLocation(actionUrl);
  };

  const notificationsSettingsLabel = 'Настройка уведомлений';
  const notificationsLabel = 'Уведомления';
  const noNewNotificationsLabel = 'Нет новых уведомлений';

  const renderFallbackItems = () => (
    <div className="space-y-2">
      {messagesUnread > 0 && (
        <button
          className="w-full flex items-center justify-between p-2 text-sm rounded hover:bg-muted/50 transition-colors text-left"
          onClick={() => setLocation('/dashboard?tab=messages')}
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span>Личные сообщения</span>
          </div>
          <span className="font-semibold">{messagesUnread}</span>
        </button>
      )}
      {notificationsUnread > 0 && (
        <button
          className="w-full flex items-center justify-between p-2 text-sm rounded hover:bg-muted/50 transition-colors text-left"
          onClick={() => setLocation('/dashboard?tab=notifications')}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span>{notificationsSettingsLabel}</span>
          </div>
          <span className="font-semibold">{notificationsUnread}</span>
        </button>
      )}
    </div>
  );

  const renderBellItems = () => {
    if (items.length === 0) return renderFallbackItems();

    return items.map((item) => {
      const isDm = item.kind === 'dm_message';
      const itemText = `${item.groupLabel}: ${item.detail}`;
      return (
        <button
          key={item.key}
          className="w-full flex items-center justify-between p-2 text-sm rounded hover:bg-muted/50 transition-colors text-left"
          onClick={() => handleOpenItem(item.actionUrl, item.kind)}
          title={itemText}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isDm ? (
              <MessageCircle className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Bell className="h-4 w-4 text-primary shrink-0" />
            )}
            <span className="truncate">{itemText}</span>
          </div>
          <span className="font-semibold shrink-0">{item.count}</span>
        </button>
      );
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadTotal > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
          <span className="sr-only">{notificationsLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">{notificationsLabel}</h3>
          {unreadTotal === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{noNewNotificationsLabel}</p>
          ) : (
            <div className="space-y-2">{renderBellItems()}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
