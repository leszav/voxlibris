import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface AchievementImagePreviewProps {
  src: string;
  alt: string;
  triggerClassName: string;
  imageClassName?: string;
  previewClassName?: string;
}

export function AchievementImagePreview({
  src,
  alt,
  triggerClassName,
  imageClassName,
  previewClassName,
}: Readonly<AchievementImagePreviewProps>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            triggerClassName,
          )}
          aria-label={`Увеличить награду: ${alt}`}
          title="Увеличить награду"
        >
          <img
            src={src}
            alt={alt}
            className={cn("h-full w-full object-cover", imageClassName)}
            loading="lazy"
          />
        </button>
      </DialogTrigger>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] p-6">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div className="flex flex-col items-center gap-3 pt-2">
          <img
            src={src}
            alt={alt}
            className={cn("h-32 w-32 rounded-xl object-contain sm:h-40 sm:w-40", previewClassName)}
          />
          <p className="max-w-64 text-center text-sm font-medium text-foreground">{alt}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
