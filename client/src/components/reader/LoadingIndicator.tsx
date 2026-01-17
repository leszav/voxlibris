import { Loader2 } from "lucide-react";

interface LoadingIndicatorProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingIndicator({ 
  message = "Загрузка...", 
  size = "md",
  className = ""
}: LoadingIndicatorProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6", 
    lg: "w-8 h-8"
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Loader2 className={`animate-spin ${sizeClasses[size]}`} />
      <span className={`${textSizes[size]} text-muted-foreground`}>
        {message}
      </span>
    </div>
  );
}

export function ChapterLoadingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <LoadingIndicator message="Загрузка главы..." size="lg" />
    </div>
  );
}

export function ContentLoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="space-y-4">
        <div className="h-4 bg-muted rounded w-3/4"></div>
        <div className="h-4 bg-muted rounded w-full"></div>
        <div className="h-4 bg-muted rounded w-5/6"></div>
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-4/5"></div>
        </div>
      </div>
    </div>
  );
}