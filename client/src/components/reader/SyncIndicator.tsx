import { CheckCircle, AlertCircle, Clock, Wifi, WifiOff } from "lucide-react";
import { useState, useEffect } from "react";

interface SyncIndicatorProps {
  isSyncing?: boolean;
  lastSyncTime?: number;
  error?: string | null;
  className?: string;
}

export function SyncIndicator({ 
  isSyncing = false, 
  lastSyncTime,
  error,
  className = ""
}: SyncIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isSyncing || error) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        if (!error) {
          setIsVisible(false);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSyncing, error]);

  if (!isVisible && !isSyncing && !error) {
    return null;
  }

  const getStatusIcon = () => {
    if (error) {
      return <WifiOff className="w-4 h-4 text-destructive" />;
    }
    if (isSyncing) {
      return <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />;
    }
    return <CheckCircle className="w-4 h-4 text-green-600" />;
  };

  const getStatusText = () => {
    if (error) {
      return "Ошибка синхронизации";
    }
    if (isSyncing) {
      return "Синхронизация...";
    }
    return "Сохранено";
  };

  const getTimeAgo = () => {
    if (!lastSyncTime) return "";
    
    const seconds = Math.floor((Date.now() - lastSyncTime) / 1000);
    if (seconds < 60) return "только что";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`;
    return `${Math.floor(seconds / 3600)} ч. назад`;
  };

  return (
    <div className={`flex items-center gap-2 text-xs text-muted-foreground transition-opacity duration-300 ${className}`}>
      {getStatusIcon()}
      <span className={error ? "text-destructive" : ""}>
        {getStatusText()}
      </span>
      {lastSyncTime && !isSyncing && !error && (
        <span className="text-xs opacity-70">
          {getTimeAgo()}
        </span>
      )}
    </div>
  );
}

// Компактная версия для заголовка
export function CompactSyncIndicator(props: SyncIndicatorProps) {
  return (
    <div className="fixed top-20 right-4 z-50">
      <SyncIndicator 
        {...props}
        className="bg-background/90 backdrop-blur-sm border rounded-md px-2 py-1 shadow-sm"
      />
    </div>
  );
}