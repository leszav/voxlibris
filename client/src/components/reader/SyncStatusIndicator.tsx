import React from 'react';
import { CloudOff, AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useReaderSettingsSyncStatus } from './core/use-synced-reader-settings';
import type { SyncStatus } from '@/lib/reader-settings-sync';

interface SyncStatusIndicatorProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SYNC_STATUS_CONFIG: Record<SyncStatus, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  text: string;
  description: string;
}> = {
  synced: {
    icon: Check,
    color: 'text-green-600 dark:text-green-400',
    text: 'Синхронизировано',
    description: 'Настройки сохранены и синхронизированы с сервером',
  },
  pending: {
    icon: Loader2,
    color: 'text-blue-600 dark:text-blue-400',
    text: 'Синхронизация...',
    description: 'Сохраняем настройки на сервер',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-600 dark:text-red-400',
    text: 'Ошибка синхронизации',
    description: 'Не удалось сохранить настройки. Нажмите для повторной попытки',
  },
  offline: {
    icon: CloudOff,
    color: 'text-orange-600 dark:text-orange-400',
    text: 'Офлайн',
    description: 'Настройки сохранены локально. Синхронизация произойдет при подключении к интернету',
  },
};

function formatLastSyncTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) { // Less than 1 minute
    return 'только что';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes} мин назад`;
  } else if (diff < 86400000) { // Less than 24 hours
    const hours = Math.floor(diff / 3600000);
    return `${hours} ч назад`;
  } else {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ru-RU');
  }
}

export function SyncStatusIndicator({ 
  className, 
  showText = false, 
  size = 'md' 
}: SyncStatusIndicatorProps) {
  const { syncStatus, lastSyncAt, errorMessage, pendingCount, forcSync } = useReaderSettingsSyncStatus();
  
  const config = SYNC_STATUS_CONFIG[syncStatus];
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };
  
  const handleClick = async () => {
    if (syncStatus === 'error' || pendingCount > 0) {
      try {
        await forcSync();
      } catch (error) {
        console.error('Failed to force sync:', error);
      }
    }
  };
  
  const isClickable = syncStatus === 'error' || pendingCount > 0;
  const lastSyncText = formatLastSyncTime(lastSyncAt);
  
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-medium">{config.text}</div>
      <div className="text-sm text-muted-foreground">
        {errorMessage || config.description}
      </div>
      <div className="text-xs text-muted-foreground">
        Последняя синхронизация: {lastSyncText}
      </div>
      {pendingCount > 0 && (
        <div className="text-xs text-muted-foreground">
          Ожидает синхронизации: {pendingCount}
        </div>
      )}
      {isClickable && (
        <div className="text-xs text-blue-600 dark:text-blue-400">
          Нажмите для повторной попытки
        </div>
      )}
    </div>
  );
  
  if (showText) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isClickable ? "ghost" : "ghost"}
              size="sm"
              className={cn(
                "h-auto p-1 font-normal",
                isClickable && "cursor-pointer hover:bg-accent",
                !isClickable && "cursor-default",
                className
              )}
              onClick={isClickable ? handleClick : undefined}
              disabled={syncStatus === 'pending'}
            >
              <Icon
                className={cn(
                  sizeClasses[size],
                  config.color,
                  syncStatus === 'pending' && 'animate-spin'
                )}
              />
              <span className="ml-2 text-xs">{config.text}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-auto p-1",
              isClickable && "cursor-pointer hover:bg-accent",
              !isClickable && "cursor-default",
              className
            )}
            onClick={isClickable ? handleClick : undefined}
            disabled={syncStatus === 'pending'}
          >
            <Icon
              className={cn(
                sizeClasses[size],
                config.color,
                syncStatus === 'pending' && 'animate-spin'
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact status indicator for tight spaces
 */
export function SyncStatusDot({ className }: { className?: string }) {
  const { syncStatus } = useReaderSettingsSyncStatus();
  const config = SYNC_STATUS_CONFIG[syncStatus];
  
  return (
    <div
      className={cn(
        "h-2 w-2 rounded-full",
        {
          "bg-green-500": syncStatus === 'synced',
          "bg-blue-500 animate-pulse": syncStatus === 'pending',
          "bg-red-500": syncStatus === 'error',
          "bg-orange-500": syncStatus === 'offline',
        },
        className
      )}
      title={config.text}
    />
  );
}
